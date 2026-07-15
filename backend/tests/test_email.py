from app.services import email


class _SuccessfulResponse:
    def raise_for_status(self):
        return None


def test_postbox_api_is_preferred_over_other_transports(monkeypatch):
    monkeypatch.setenv("POSTBOX_ACCESS_KEY_ID", "postbox-key-id")
    monkeypatch.setenv("POSTBOX_SECRET_ACCESS_KEY", "postbox-secret")
    monkeypatch.setenv("POSTBOX_FROM_EMAIL", "noreply@casemoney.ru")
    monkeypatch.setenv("POSTBOX_FROM_NAME", "CaseMoney")
    monkeypatch.setenv("BREVO_API_KEY", "brevo-key")
    captured = {}

    class FakePostboxClient:
        def send_email(self, **kwargs):
            captured["send_email"] = kwargs
            return {"MessageId": "message-123"}

    def fake_client(service_name, **kwargs):
        captured["service_name"] = service_name
        captured["client"] = kwargs
        return FakePostboxClient()

    monkeypatch.setattr(email.boto3, "client", fake_client)

    assert email.send_email("user@example.com", "Subject", "Text", "<b>HTML</b>") is True
    assert captured["service_name"] == "sesv2"
    assert captured["client"]["endpoint_url"] == "https://postbox.cloud.yandex.net"
    assert captured["send_email"]["FromEmailAddress"] == (
        "CaseMoney <noreply@casemoney.ru>"
    )
    assert captured["send_email"]["Destination"] == {
        "ToAddresses": ["user@example.com"]
    }
    assert captured["send_email"]["Content"]["Simple"]["Body"] == {
        "Text": {"Data": "Text", "Charset": "UTF-8"},
        "Html": {"Data": "<b>HTML</b>", "Charset": "UTF-8"},
    }


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
