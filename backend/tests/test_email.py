from app.services import email


class _SuccessfulResponse:
    def raise_for_status(self):
        return None


def test_brevo_api_is_preferred_over_smtp(monkeypatch):
    monkeypatch.setenv("BREVO_API_KEY", "test-key")
    monkeypatch.setenv("BREVO_SENDER_EMAIL", "sender@example.com")
    monkeypatch.setenv("BREVO_SENDER_NAME", "CaseMoney")
    monkeypatch.delenv("SMTP_HOST", raising=False)
    captured = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return _SuccessfulResponse()

    monkeypatch.setattr(email.httpx, "post", fake_post)

    assert email.send_email("user@example.com", "Subject", "Text", "<b>HTML</b>") is True
    assert captured["url"] == "https://api.brevo.com/v3/smtp/email"
    assert captured["headers"]["api-key"] == "test-key"
    assert captured["json"]["sender"] == {
        "name": "CaseMoney",
        "email": "sender@example.com",
    }
    assert captured["json"]["to"] == [{"email": "user@example.com"}]
