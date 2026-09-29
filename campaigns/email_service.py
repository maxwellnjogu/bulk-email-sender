import uuid
from django.core.mail import send_mail
from django.conf import settings


def send_email(to_email, subject, body):
    """
    Send an email via Django's configured email backend (SMTP).
    Returns a dict mimicking the SES response shape so tasks.py stays compatible.
    """
    send_mail(
        subject=subject,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[to_email],
        fail_silently=False,
    )

    # Return a fake "MessageId" so tasks.py can store it without changes
    return {'MessageId': str(uuid.uuid4())}