from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.credit import CreditObligation
from app.models.notification import Notification
from app.models.user import User
from app.services.email import app_url, send_credit_payment_reminder


def process_credit_reminders(db: Session, user_id: int | None = None) -> tuple[int, int]:
    """Create due-payment notifications and send email reminders.

    The two delivery channels have independent markers. A temporary email
    failure therefore does not duplicate the in-app notification and can be
    retried during the next reminder pass.
    """
    today = date.today()
    query = db.query(CreditObligation).filter(
        CreditObligation.status == "active",
        CreditObligation.next_payment_date.isnot(None),
    )
    if user_id is not None:
        query = query.filter(CreditObligation.user_id == user_id)
    credits = query.all()
    system_count = 0
    email_count = 0

    for credit in credits:
        notify_on = credit.next_payment_date - timedelta(days=credit.reminder_days_before)
        if today < notify_on:
            continue

        overdue = today > credit.next_payment_date
        is_income = credit.kind == "deposit"
        title = (
            "Не отмечено поступление" if overdue else "Ожидается поступление"
        ) if is_income else ("Просрочен платёж" if overdue else "Скоро платёж")
        amount = f" {credit.monthly_payment:g} {credit.currency}" if credit.monthly_payment else ""
        if is_income:
            message = (
                f"Поступление{amount} ожидалось {credit.next_payment_date.strftime('%d.%m.%Y')}."
                if overdue
                else f"{credit.next_payment_date.strftime('%d.%m.%Y')} ожидается поступление{amount}."
            )
        else:
            message = (
                f"Платёж{amount} ожидался {credit.next_payment_date.strftime('%d.%m.%Y')}."
                if overdue
                else f"До {credit.next_payment_date.strftime('%d.%m.%Y')} нужно внести{amount}."
            )

        if credit.last_reminder_for_date != credit.next_payment_date:
            db.add(
                Notification(
                    user_id=credit.user_id,
                    title=f"{title}: {credit.name}",
                    message=message,
                    link="/credits",
                )
            )
            credit.last_reminder_for_date = credit.next_payment_date
            system_count += 1

        if credit.last_email_reminder_for_date != credit.next_payment_date:
            user = db.query(User).filter(User.id == credit.user_id).first()
            if user and send_credit_payment_reminder(
                to_email=user.email,
                username=user.username,
                credit_name=credit.name,
                due_date=credit.next_payment_date,
                amount=credit.monthly_payment,
                currency=credit.currency,
                overdue=overdue,
                is_income=is_income,
                credit_url=f"{app_url()}/credits",
            ):
                credit.last_email_reminder_for_date = credit.next_payment_date
                email_count += 1

        db.commit()

    return system_count, email_count
