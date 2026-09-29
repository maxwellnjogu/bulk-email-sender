"""
Quick smoke-test for Gmail SMTP.
Run: python test_email.py your_target@example.com
"""
import os
import sys
import django

# ── Bootstrap Django ─────────────────────────────────────────────────────────
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

# ── Now safe to import Django email tooling ───────────────────────────────────
from django.core.mail import send_mail
from django.conf import settings

def main():
    to_addr = sys.argv[1] if len(sys.argv) > 1 else settings.EMAIL_HOST_USER
    print(f"Sending test email to: {to_addr}")
    print(f"From:                  {settings.DEFAULT_FROM_EMAIL}")
    print(f"SMTP host:             {settings.EMAIL_HOST}:{settings.EMAIL_PORT}")
    print()

    try:
        send_mail(
            subject="[TEST] Bulk Email Sender - SMTP test",
            message=(
                "Hello!\n\n"
                "This is a test email from your Bulk Email Sender app.\n"
                "If you received this, your Gmail SMTP config is working correctly.\n\n"
                "— Antigravity"
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[to_addr],
            fail_silently=False,
        )
        print("[OK] Email sent successfully!")
    except Exception as exc:
        print(f"[FAIL] Failed to send email: {exc}")
        sys.exit(1)

if __name__ == '__main__':
    main()
