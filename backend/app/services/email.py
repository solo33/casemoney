"""Email-сервис.

Конфигурация через .env:
    SMTP_HOST=mail.casemoney.ru
    SMTP_PORT=465
    SMTP_USER=no-reply@casemoney.ru
    SMTP_PASSWORD=...       (пароль почтового ящика)
    SMTP_FROM="CaseMoney <no-reply@casemoney.ru>"
    SMTP_STARTTLS=false
    SMTP_USE_SSL=true
    APP_URL=https://casemoney.ru

Если SMTP_HOST не задан — письма выводятся в консоль (dev mode).
"""
import os
import smtplib
import logging
import html as _html
from email.utils import parseaddr
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import httpx
import boto3
from botocore.config import Config

log = logging.getLogger("casemoney.email")

REGISTRATION_NOTIFY_EMAIL = os.getenv(
    "REGISTRATION_NOTIFY_EMAIL", "andrey.zakhartsev@gmail.com"
).strip()


def _smtp_config() -> dict:
    return {
        "host": os.getenv("SMTP_HOST"),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "user": os.getenv("SMTP_USER"),
        "password": os.getenv("SMTP_PASSWORD"),
        "from_addr": os.getenv("SMTP_FROM", "CaseMoney <no-reply@casemoney.ru>"),
        "starttls": os.getenv("SMTP_STARTTLS", "true").lower() != "false",
        "use_ssl": os.getenv("SMTP_USE_SSL", "false").lower() == "true",
    }


def app_url() -> str:
    return os.getenv("APP_URL", "http://localhost:5173").rstrip("/")


def is_smtp_configured() -> bool:
    """Return whether any real email transport is configured.

    The legacy name is kept because it is part of the public auth/admin
    responses. Yandex Cloud Postbox and Brevo use HTTPS APIs and therefore
    work on Render Free; SMTP remains available for local and paid deployments.
    """
    if _postbox_configured():
        return True
    if _brevo_configured():
        return True
    cfg = _smtp_config()
    return bool(cfg["host"] and cfg["user"] and cfg["password"])


def _brevo_configured() -> bool:
    return bool(os.getenv("BREVO_API_KEY") and _sender()[1])


def _postbox_configured() -> bool:
    return bool(
        os.getenv("POSTBOX_ACCESS_KEY_ID")
        and os.getenv("POSTBOX_SECRET_ACCESS_KEY")
        and os.getenv("POSTBOX_FROM_EMAIL")
    )


def _send_via_postbox(to: str, subject: str, text: str, html: str | None) -> bool:
    sender_email = os.environ["POSTBOX_FROM_EMAIL"]
    sender_name = os.getenv("POSTBOX_FROM_NAME", "CaseMoney")
    from_address = f"{sender_name} <{sender_email}>" if sender_name else sender_email
    body = {"Text": {"Data": text, "Charset": "UTF-8"}}
    if html:
        body["Html"] = {"Data": html, "Charset": "UTF-8"}

    try:
        client = boto3.client(
            "sesv2",
            aws_access_key_id=os.environ["POSTBOX_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["POSTBOX_SECRET_ACCESS_KEY"],
            endpoint_url=os.getenv(
                "POSTBOX_ENDPOINT_URL", "https://postbox.cloud.yandex.net"
            ),
            config=Config(region_name="ru-central1"),
        )
        response = client.send_email(
            FromEmailAddress=from_address,
            Destination={"ToAddresses": [to]},
            Content={
                "Simple": {
                    "Subject": {"Data": subject, "Charset": "UTF-8"},
                    "Body": body,
                }
            },
        )
        log.info(
            "Sent email to %s via Yandex Cloud Postbox: %s (message_id=%s)",
            to,
            subject,
            response.get("MessageId"),
        )
        return True
    except Exception as exc:
        log.error("Failed to send email to %s via Yandex Cloud Postbox: %s", to, exc)
        return False


def _sender() -> tuple[str, str]:
    configured_from = os.getenv("SMTP_FROM", "")
    parsed_name, parsed_email = parseaddr(configured_from)
    name = os.getenv("BREVO_SENDER_NAME") or parsed_name or "CaseMoney"
    email = os.getenv("BREVO_SENDER_EMAIL") or parsed_email or os.getenv("SMTP_USER", "")
    return name, email


def _send_via_brevo(to: str, subject: str, text: str, html: str | None) -> bool:
    sender_name, sender_email = _sender()
    payload = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": [{"email": to}],
        "subject": subject,
        "textContent": text,
    }
    if html:
        payload["htmlContent"] = html

    try:
        response = httpx.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={
                "accept": "application/json",
                "api-key": os.environ["BREVO_API_KEY"],
                "content-type": "application/json",
            },
            json=payload,
            timeout=15,
        )
        response.raise_for_status()
        log.info("Sent email to %s via Brevo: %s", to, subject)
        return True
    except Exception as exc:
        log.error("Failed to send email to %s via Brevo: %s", to, exc)
        return False


def send_email(to: str, subject: str, text: str, html: str | None = None) -> bool:
    """Отправляет письмо. Возвращает True если отправлено (или залогано в dev).
    Если SMTP не настроен — печатает письмо в консоль.
    """
    cfg = _smtp_config()

    # Render Free blocks outbound SMTP ports, but HTTPS APIs remain available.
    if _postbox_configured():
        return _send_via_postbox(to, subject, text, html)

    if _brevo_configured():
        return _send_via_brevo(to, subject, text, html)

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
        # Локальная разработка может прочитать письмо в логах, но доставка
        # пользователю фактически не состоялась. Возвращаем False, чтобы UI
        # не показывал ложное «письмо отправлено».
        return False

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

def send_financial_notification(
    to_email: str,
    username: str,
    title: str,
    message: str,
    link: str | None = None,
) -> bool:
    """Send a compact, safe email mirror of an in-app financial event."""
    subject = f"CaseMoney — {title}"
    destination = link or app_url()
    full_link = destination if destination.startswith("http") else f"{app_url()}{destination}"
    username_html = _html.escape(username)
    title_html = _html.escape(title)
    message_html = _html.escape(message).replace("\n", "<br>")
    link_html = _html.escape(full_link, quote=True)
    text = (
        f"Здравствуйте, {username}!\n\n{title}\n{message}\n\n"
        f"Открыть CaseMoney: {full_link}\n\n— CaseMoney"
    )
    html = f"""\
<!doctype html>
<html><body style="font-family:system-ui,sans-serif;background:#f6f2e9;padding:32px;">
  <div style="max-width:560px;margin:0 auto;background:#fffdf7;border:1px solid #e4ddcd;border-radius:12px;padding:28px;">
    <h1 style="font-family:Georgia,serif;color:#173a54;font-size:25px;margin:0 0 18px;">CaseMoney</h1>
    <p style="color:#515c68;line-height:1.6;">Здравствуйте, <strong>{username_html}</strong>!</p>
    <h2 style="color:#1b2531;font-size:20px;margin:18px 0 10px;">{title_html}</h2>
    <p style="color:#515c68;line-height:1.6;">{message_html}</p>
    <p style="margin:24px 0 0;"><a href="{link_html}" style="display:inline-block;background:#173a54;color:#fff;text-decoration:none;padding:12px 20px;border-radius:7px;font-weight:600;">Открыть CaseMoney</a></p>
  </div>
</body></html>"""
    return send_email(to_email, subject, text, html)


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
        f"Ссылка действительна 7 дней.\n\n"
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
      Ссылка действительна 7 дней. Если вы не регистрировались — проигнорируйте это письмо.
    </p>
  </div>
</body></html>
"""
    return send_email(to_email, subject, text, html)


def send_registration_notification(
    user_email: str,
    username: str,
    registered_at: str,
) -> bool:
    """Notify the service owner about a newly created account."""
    if not REGISTRATION_NOTIFY_EMAIL:
        return False


    email_html = _html.escape(user_email)
    username_html = _html.escape(username)
    registered_at_html = _html.escape(registered_at)
    subject = "CaseMoney — новая регистрация"
    text = (
        "В CaseMoney зарегистрирован новый пользователь.\n\n"
        f"Email: {user_email}\n"
        f"Имя пользователя: {username}\n"
        f"Время регистрации: {registered_at}\n"
    )
    html = f"""\
<!doctype html>
<html><body style="font-family: system-ui, sans-serif; background: #f6f2e9; padding: 32px;">
  <div style="max-width: 560px; margin: 0 auto; background: #fffdf7; border: 1px solid #e4ddcd; border-radius: 12px; padding: 28px;">
    <h1 style="font-family: Georgia, serif; color: #173a54; font-size: 24px; margin: 0 0 18px;">
      Новая регистрация в CaseMoney
    </h1>
    <p style="color: #515c68; line-height: 1.7; margin: 0;">
      <strong>Email:</strong> <a href="mailto:{email_html}" style="color: #9c7b3c;">{email_html}</a><br>
      <strong>Имя пользователя:</strong> {username_html}<br>
      <strong>Время регистрации:</strong> {registered_at_html}
    </p>
  </div>
</body></html>
"""
    return send_email(REGISTRATION_NOTIFY_EMAIL, subject, text, html)


def send_credit_payment_reminder(
    to_email: str,
    username: str,
    credit_name: str,
    due_date,
    amount: float | None,
    currency: str,
    overdue: bool,
    credit_url: str,
    is_income: bool = False,
) -> bool:
    """Send a reminder for an upcoming expense or deposit income."""
    due = due_date.strftime("%d.%m.%Y")
    amount_text = f"{amount:g} {currency}" if amount else "сумма не указана"
    if is_income:
        status_text = "Поступление не отмечено" if overdue else "Приближается дата поступления"
        event_label = "Ожидаемый доход"
        date_label = "Дата поступления"
    else:
        status_text = "Платёж просрочен" if overdue else "Приближается дата платежа"
        event_label = "Платёж"
        date_label = "Дата платежа"
    subject = f"CaseMoney — {status_text.lower()}: {credit_name}"
    text = (
        f"Здравствуйте, {username}!\n\n"
        f"{status_text} по обязательству «{credit_name}».\n"
        f"{date_label}: {due}\n"
        f"{event_label}: {amount_text}\n\n"
        f"Открыть обязательства и депозиты: {credit_url}\n\n"
        "— CaseMoney"
    )
    username_html = _html.escape(username)
    name_html = _html.escape(credit_name)
    amount_html = _html.escape(amount_text)
    url_html = _html.escape(credit_url, quote=True)
    status_color = "#c83f2b" if overdue else "#9c7b3c"
    html = f"""\
<!doctype html>
<html><body style="font-family: system-ui, sans-serif; background: #f6f2e9; padding: 32px;">
  <div style="max-width: 560px; margin: 0 auto; background: #fffdf7; border: 1px solid #e4ddcd; border-radius: 12px; padding: 28px;">
    <h1 style="font-family: Georgia, serif; color: #173a54; font-size: 25px; margin: 0 0 18px;">CaseMoney</h1>
    <p style="color: #515c68; line-height: 1.6;">Здравствуйте, <strong>{username_html}</strong>!</p>
    <h2 style="color: {status_color}; font-size: 20px; margin: 18px 0 12px;">{status_text}</h2>
    <p style="color: #1b2531; line-height: 1.7;">
      <strong>{name_html}</strong><br>
      {date_label}: {due}<br>
      {event_label}: {amount_html}
    </p>
    <p style="margin: 24px 0 0;">
      <a href="{url_html}" style="display:inline-block;background:#173a54;color:#fff;text-decoration:none;padding:12px 20px;border-radius:7px;font-weight:600;">
        Открыть обязательства и депозиты
      </a>
    </p>
  </div>
</body></html>
"""
    return send_email(to_email, subject, text, html)


def send_code_email(to_email: str, username: str, code: str) -> bool:
    subject = f"CaseMoney — код подтверждения: {code}"
    username_html = _html.escape(username)
    code_html = _html.escape(code)
    text = (
        f"Здравствуйте, {username}!\n\n"
        f"Ваш код подтверждения регистрации в CaseMoney:\n\n"
        f"    {code}\n\n"
        f"Введите его на странице регистрации. Код действителен 15 минут.\n\n"
        f"Если вы не регистрировались — просто проигнорируйте это письмо.\n\n"
        f"— CaseMoney"
    )
    html = f"""\
<!doctype html>
<html><body style="font-family: system-ui, sans-serif; background: #f6f2e9; padding: 32px;">
  <div style="max-width: 520px; margin: 0 auto; background: #fffdf7; border: 1px solid #e4ddcd; border-radius: 12px; padding: 28px; text-align: center;">
    <h1 style="font-family: Georgia, serif; font-weight: 600; color: #173a54; font-size: 26px; margin: 0 0 16px;">
      CaseMoney
    </h1>
    <p style="color: #515c68; line-height: 1.5; margin: 0 0 16px;">
      Здравствуйте, <strong>{username_html}</strong>! Ваш код подтверждения:
    </p>
    <div style="font-size: 34px; font-weight: 700; letter-spacing: 8px; color: #173a54;
                background: #efe9db; border-radius: 10px; padding: 16px; margin: 0 0 16px;">
      {code_html}
    </div>
    <p style="color: #7a8590; font-size: 13px; margin: 0;">
      Код действителен 15 минут. Если вы не регистрировались — проигнорируйте письмо.
    </p>
  </div>
</body></html>
"""
    return send_email(to_email, subject, text, html)


def send_reset_email(to_email: str, username: str, reset_url: str) -> bool:
    subject = "CaseMoney — восстановление пароля"
    username_html = _html.escape(username)
    url_html = _html.escape(reset_url, quote=True)
    text = (
        f"Здравствуйте, {username}!\n\n"
        f"Вы запросили сброс пароля в CaseMoney. "
        f"Перейдите по ссылке ниже, чтобы задать новый пароль:\n\n"
        f"{reset_url}\n\n"
        f"Ссылка действительна 1 час.\n\n"
        f"Если вы не запрашивали сброс — просто проигнорируйте это письмо, "
        f"пароль останется прежним.\n\n"
        f"— CaseMoney"
    )
    html = f"""\
<!doctype html>
<html><body style="font-family: system-ui, sans-serif; background: #f6f2e9; padding: 32px;">
  <div style="max-width: 520px; margin: 0 auto; background: #fffdf7; border: 1px solid #e4ddcd; border-radius: 12px; padding: 28px;">
    <h1 style="font-family: Georgia, serif; font-weight: 600; color: #173a54; font-size: 26px; margin: 0 0 16px;">
      CaseMoney
    </h1>
    <h2 style="font-family: Georgia, serif; font-weight: 500; color: #1b2531; font-size: 22px; margin: 0 0 12px;">
      Восстановление пароля
    </h2>
    <p style="color: #515c68; line-height: 1.5;">
      Здравствуйте, <strong>{username_html}</strong>!<br>
      Нажмите кнопку ниже, чтобы задать новый пароль.
    </p>
    <p style="margin: 24px 0;">
      <a href="{url_html}" style="
        display: inline-block; background: #173a54; color: #fff;
        text-decoration: none; padding: 12px 24px; border-radius: 6px;
        font-weight: 600;
      ">
        Задать новый пароль
      </a>
    </p>
    <p style="color: #7a8590; font-size: 13px;">
      Или скопируйте ссылку в браузер:<br>
      <a href="{url_html}" style="color: #9c7b3c; word-break: break-all;">{url_html}</a>
    </p>
    <p style="color: #a6afb8; font-size: 12px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e4ddcd;">
      Ссылка действительна 1 час. Если вы не запрашивали сброс — проигнорируйте это письмо.
    </p>
  </div>
</body></html>
"""
    return send_email(to_email, subject, text, html)


def send_support_email(to_email: str, sender_name: str, sender_email: str, message: str) -> bool:
    subject = f"CaseMoney — обращение в поддержку от {sender_name}"
    name_html = _html.escape(sender_name)
    email_html = _html.escape(sender_email)
    message_html = _html.escape(message).replace("\n", "<br>")
    text = (
        "Новое обращение в поддержку CaseMoney.\n\n"
        f"Имя: {sender_name}\n"
        f"Email: {sender_email}\n\n"
        f"Сообщение:\n{message}\n"
    )
    html = f"""\
<!doctype html>
<html><body style="font-family: system-ui, sans-serif; background: #f6f2e9; padding: 32px;">
  <div style="max-width: 620px; margin: 0 auto; background: #fffdf7; border: 1px solid #e4ddcd; border-radius: 12px; padding: 28px;">
    <h1 style="font-family: Georgia, serif; font-weight: 600; color: #173a54; font-size: 24px; margin: 0 0 16px;">
      Обращение в поддержку CaseMoney
    </h1>
    <p style="color: #515c68; line-height: 1.5; margin: 0 0 12px;">
      <strong>Имя:</strong> {name_html}<br>
      <strong>Email:</strong> <a href="mailto:{email_html}" style="color: #9c7b3c;">{email_html}</a>
    </p>
    <div style="color: #1b2531; line-height: 1.6; white-space: normal; background: #fff; border-radius: 8px; padding: 16px;">
      {message_html}
    </div>
  </div>
</body></html>
"""
    return send_email(to_email, subject, text, html)
