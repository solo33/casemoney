"""Export helpers for the monthly Family report.

The API returns JSON for the interactive page.  This module turns the same
prepared data into a compact PDF or email without re-running database queries,
so all export variants contain the same figures as the screen.
"""
from __future__ import annotations

from datetime import date, datetime
from html import escape
from io import BytesIO
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


MONTHS_RU = (
    "", "январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
)


def report_period_label(year: int, month: int) -> str:
    return f"{MONTHS_RU[month].capitalize()} {year}"


def format_money(value: float | int | None) -> str:
    return f"{float(value or 0):,.0f}".replace(",", " ")


def _font_name() -> tuple[str, str]:
    """Use a Cyrillic font in Docker and Windows development environments."""
    candidates = [
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
    ]
    for regular, bold in candidates:
        if Path(regular).exists() and Path(bold).exists():
            pdfmetrics.registerFont(TTFont("CaseMoneyReport", regular))
            pdfmetrics.registerFont(TTFont("CaseMoneyReportBold", bold))
            return "CaseMoneyReport", "CaseMoneyReportBold"
    # The fallback keeps the generated document readable in constrained test
    # environments. Production images install DejaVu through the Dockerfile.
    return "Helvetica", "Helvetica-Bold"


def _value(value: float | int | None, currency: str) -> str:
    return f"{format_money(value)} {currency}"


def _table(rows: list[tuple[str, str]], styles: dict[str, ParagraphStyle]) -> Table:
    data = [[Paragraph(escape(left), styles["body"]), Paragraph(escape(right), styles["right"])] for left, right in rows]
    table = Table(data, colWidths=[112 * mm, 63 * mm], repeatRows=0)
    table.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 0.35, colors.HexColor("#E6DECD")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return table


def build_family_report_pdf(data: dict[str, Any], family_name: str) -> bytes:
    """Create an A4 PDF monthly report from the analytics API payload."""
    regular, bold = _font_name()
    styles_base = getSampleStyleSheet()
    styles = {
        "title": ParagraphStyle("FamilyTitle", parent=styles_base["Title"], fontName=bold, fontSize=20, leading=25, textColor=colors.HexColor("#173A54"), spaceAfter=4),
        "subtitle": ParagraphStyle("FamilySubtitle", parent=styles_base["Normal"], fontName=regular, fontSize=10, leading=14, textColor=colors.HexColor("#6F7B86"), spaceAfter=14),
        "heading": ParagraphStyle("FamilyHeading", parent=styles_base["Heading2"], fontName=bold, fontSize=13, leading=17, textColor=colors.HexColor("#173A54"), spaceBefore=14, spaceAfter=6),
        "body": ParagraphStyle("FamilyBody", parent=styles_base["Normal"], fontName=regular, fontSize=9, leading=12, textColor=colors.HexColor("#30485B")),
        "right": ParagraphStyle("FamilyRight", parent=styles_base["Normal"], fontName=bold, fontSize=9, leading=12, textColor=colors.HexColor("#173A54"), alignment=TA_RIGHT),
    }
    currency = str(data.get("currency") or "RUB")
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=17 * mm, bottomMargin=16 * mm,
        title=f"Семейный отчёт — {report_period_label(data['year'], data['month'])}",
        author="CaseMoney",
    )
    story = [
        Paragraph("Семейный отчёт", styles["title"]),
        Paragraph(f"{escape(family_name)} · {report_period_label(data['year'], data['month'])} · CaseMoney", styles["subtitle"]),
        Paragraph("Главное за месяц", styles["heading"]),
        _table([
            ("Доходы", _value(data.get("income_total"), currency)),
            ("Расходы", _value(data.get("expense_total"), currency)),
            ("Результат", _value(data.get("net_total"), currency)),
            ("Запланированные расходы", _value(data.get("planned_total"), currency)),
        ], styles),
    ]

    def section(title: str, items: list[dict[str, Any]], label, value, empty: str) -> None:
        story.append(Paragraph(title, styles["heading"]))
        if not items:
            story.append(Paragraph(empty, styles["body"]))
            return
        story.append(_table([(label(item), value(item)) for item in items], styles))

    section("Вклад участников", data.get("members", []), lambda item: item.get("name", "Участник"), lambda item: _value(item.get("actual"), currency), "Общих расходов в этом месяце пока нет.")
    section("Категории общих расходов", data.get("categories", [])[:8], lambda item: item.get("name", "Без категории"), lambda item: _value(item.get("actual"), currency), "Категории пока не заполнены.")
    section("Взаиморасчёты", data.get("settlements", [])[:8], lambda item: f"{item.get('from_name', '')} → {item.get('to_name', '')}", lambda item: _value(item.get("amount"), currency), "Возмещений за этот месяц пока нет.")
    section("Общие цели", data.get("goals", [])[:8], lambda item: item.get("name", "Цель"), lambda item: f"{item.get('progress_percent', 0):.0f}% · {_value(item.get('current_amount'), currency)} из {_value(item.get('target_amount'), currency)}", "Общих целей пока нет.")

    budget = data.get("budget", {})
    story.extend([
        Paragraph("Бюджет", styles["heading"]),
        _table([
            ("Лимит", _value(budget.get("plan"), currency)),
            ("Факт", _value(budget.get("fact"), currency)),
            ("Остаток", _value(budget.get("remaining"), currency)),
        ], styles),
        Spacer(1, 10),
        Paragraph("Отчёт сформирован по отмеченным общим операциям. Личные счета и личные траты участников не раскрываются.", styles["subtitle"]),
    ])
    document.build(story)
    return buffer.getvalue()


def build_family_report_email_html(data: dict[str, Any], family_name: str) -> str:
    """A compact email version of the same report; suitable for all transports."""
    currency = escape(str(data.get("currency") or "RUB"))

    def row(label: str, value: str) -> str:
        return f"<tr><td style='padding:8px 0;border-bottom:1px solid #e6decd'>{escape(label)}</td><td style='padding:8px 0;border-bottom:1px solid #e6decd;text-align:right;font-weight:700'>{escape(value)}</td></tr>"

    stats = "".join([
        row("Доходы", _value(data.get("income_total"), currency)),
        row("Расходы", _value(data.get("expense_total"), currency)),
        row("Результат", _value(data.get("net_total"), currency)),
        row("Запланированные расходы", _value(data.get("planned_total"), currency)),
    ])
    goals = data.get("goals", [])
    goals_html = "".join(row(str(item.get("name", "Цель")), f"{item.get('progress_percent', 0):.0f}%") for item in goals[:5])
    if not goals_html:
        goals_html = "<tr><td style='padding:8px 0;color:#6f7b86'>Общих целей пока нет.</td></tr>"
    period = escape(report_period_label(data["year"], data["month"]))
    return f"""<!doctype html><html lang='ru'><body style='margin:0;background:#f6f1e6;font-family:Arial,sans-serif;color:#173a54'>
      <main style='max-width:640px;margin:0 auto;padding:28px 18px'>
        <section style='background:#fffdf7;border:1px solid #e4ddcd;border-radius:12px;padding:24px'>
          <h1 style='margin:0 0 4px;font-size:24px'>Семейный отчёт</h1>
          <p style='margin:0 0 20px;color:#6f7b86'>{escape(family_name)} · {period}</p>
          <table style='width:100%;border-collapse:collapse;font-size:14px'>{stats}</table>
          <h2 style='margin:24px 0 8px;font-size:18px'>Общие цели</h2>
          <table style='width:100%;border-collapse:collapse;font-size:14px'>{goals_html}</table>
          <p style='margin:24px 0 0;color:#6f7b86;font-size:12px'>В отчёте учитываются только отмеченные общие операции.</p>
        </section>
      </main></body></html>"""
