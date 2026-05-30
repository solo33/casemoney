"""Email-сервис.

Конфигурация через .env:
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=...
    SMTP_PASSWORD=...
    SMTP_FROM="CaseMoney <noreply@casemoney.ru>"
    SMTP_STARTTLS=true      (по умолчанию true)
    SMTP_USE_SSL=false      (для порта 465 — true)
    APP_URL=https://casemoney.ru

Если SMTP_HOST не задан — письма выводятся в консоль (dev mode).
"""
import os
import smtplib
import logging
import html as _html
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

log = logging.getLogger("casemoney.email")


def _smtp_config() -> dict:
    return {
        "host": os.getenv("SMTP_HOST"),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "user": os.getenv("SMTP_USER"),
        "password": os.getenv("SMTP_PASSWORD"),
        "from_addr": os.getenv("SMTP_FROM", "CaseMoney <noreply@casemoney.local>"),
        "starttls": os.getenv("SMTP_STARTTLS", "true").lower() != "false",
        "use_ssl": os.getenv("SMTP_USE_SSL", "false").lower() == "true",
    }


def app_url() -> str:
    return os.getenv("APP_URL", "http://localhost:5173").rstrip("/")


def is_smtp_configured() -> bool:
    cfg = _smtp_config()
    return bool(cfg["host"] and cfg["user"] and cfg["password"])


def send_email(to: str, subject: str, text: str, html: str | None = None) -> bool:
    """Отправляет письмо. Возвращает True если отправлено (или залогано в dev).
    Если SMTP не настроен — печатает письмо в консоль.
    """
    cfg = _smtp_config()

    if not is_smtp_configured():
        print("\n" + "=" * 60)
        print(f"[EMAIL — SMTP не настроен, dev-режим]")
        print(f"To:      {to}")
        print(f"From:    {cfg['from_addr']}")
        print(f"Subject: {subject}")
        print("-" * 60)
        print(text)
        if html:
            print("-" * 60)
            print("(html также доступен)")
        print("=" * 60 + "\n")
        return True

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = cfg["from_addr"]
    msg["To"] = to

    msg.attach(MIMEText(text, "plain", "utf-8"))
    if html:
        msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        if cfg["use_ssl"]:
            smtp = smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=15)
        else:
            smtp = smtplib.SMTP(cfg["host"], cfg["port"], timeout=15)
            if cfg["starttls"]:
                smtp.starttls()
        smtp.login(cfg["user"], cfg["password"])
        smtp.sendmail(cfg["user"], [to], msg.as_string())
        smtp.quit()
        log.info(f"Sent email to {to}: {subject}")
        return True
    except Exception as e:
        log.error(f"Failed to send email to {to}: {e}")
        return False


# === конкретные шаблоны ===

def send_activation_email(to_email: str, username: str, activation_url: str) -> bool:
    subject = "CaseMoney — подтвердите ваш email"
    # В plain-text экранирование не нужно. В HTML — обязательно (username и URL
    # могут содержать спецсимволы; URL также квотим как атрибут).
    username_html = _html.escape(username)
    url_html = _html.escape(activation_url, quote=True)
    text = (
        f"Здравствуйте, {username}!\n\n"
        f"Вы зарегистрировались в CaseMoney. "
        f"Перейдите по ссылке ниже, чтобы подтвердить email и активировать аккаунт:\n\n"
        f"{activation_url}\n\n"
        f"Ссылка действительна 24 часа.\n\n"
        f"Если вы не регистрировались — просто проигнорируйте это письмо.\n\n"
        f"— CaseMoney"
    )
    html = f"""\
<!doctype html>
<html><body style="font-family: Inter, system-ui, sans-serif; background: #faf8f3; padding: 32px;">
  <div style="max-width: 520px; margin: 0 auto; background: #fff; border: 1px solid #e7e5e0; border-radius: 12px; padding: 28px;">
    <h1 style="font-family: Georgia, serif; font-weight: 500; color: #9f1239; font-size: 28px; margin: 0 0 16px;">
      ₽ CaseMoney
    </h1>
    <h2 style="font-family: Georgia, serif; font-weight: 500; color: #1c1917; font-size: 22px; margin: 0 0 12px;">
      Подтвердите email
    </h2>
    <p style="color: #57534e; line-height: 1.5;">
      Здравствуйте, <strong>{username_html}</strong>!<br>
      Вы зарегистрировались в CaseMoney. Нажмите кнопку ниже, чтобы активировать аккаунт.
    </p>
    <p style="margin: 24px 0;">
      <a href="{url_html}" style="
        display: inline-block; background: #9f1239; color: #fff;
        text-decoration: none; padding: 12px 24px; border-radius: 6px;
        font-weight: 600;
      ">
        Активировать аккаунт
      </a>
    </p>
    <p style="color: #78716c; font-size: 13px;">
      Или скопируйте ссылку в браузер:<br>
      <a href="{url_html}" style="color: #9f1239; word-break: break-all;">{url_html}</a>
    </p>
    <p style="color: #a8a29e; font-size: 12px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e7e5e0;">
      Ссылка действительна 24 часа. Если вы не регистрировались — проигнорируйте это письмо.
    </p>
  </div>
</body></html>
"""
    return send_email(to_email, subject, text, html)
