import logging
import smtplib

from celery import shared_task
from celery.exceptions import MaxRetriesExceededError
from django.utils import timezone
from django.conf import settings

from .models import Campaign, EmailSend
from .email_service import send_email
from contacts.models import SuppressedEmail
from contacts.tokens import generate_unsubscribe_token

logger = logging.getLogger(__name__)



def _build_unsubscribe_url(contact_id: int) -> str:
    """Build the full unsubscribe URL for a contact."""
    token = generate_unsubscribe_token(contact_id)
    base_url = getattr(settings, 'SITE_BASE_URL', 'http://localhost:8000')
    return f"{base_url}/api/unsubscribe/?token={token}"


def personalize_text(text: str, contact) -> str:
    """Replace personalisation placeholders including a signed unsubscribe link."""
    unsubscribe_url = _build_unsubscribe_url(contact.id)

    return (
        text
        .replace('{{first_name}}', contact.first_name or '')
        .replace('{{last_name}}', contact.last_name or '')
        .replace('{{email}}', contact.email)
        .replace('{{unsubscribe_url}}', unsubscribe_url)
    )



@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,   # 1 minute between retries
    acks_late=True,           # Only ack after completion — safe against worker crashes
)
def send_campaign(self, campaign_id: int):
    """
    Send a campaign to all eligible contacts.

    Final campaign status is determined by results:
      - All sent successfully  → SENT
      - Some sent, some failed → PARTIAL
      - Nothing sent at all    → FAILED
      - Unhandled exception    → FAILED (with error stored)

    Individual SES throttling / transient errors trigger per-task retries
    (up to max_retries) with exponential back-off before marking as FAILED.
    """
    try:
        campaign = Campaign.objects.get(id=campaign_id)
    except Campaign.DoesNotExist:
        logger.error("send_campaign: Campaign %s not found", campaign_id)
        return

    # Guard: only run if in a valid pre-send state
    if campaign.status == 'SENT':
        logger.warning("send_campaign: Campaign %s already sent — skipping", campaign_id)
        return f"Campaign {campaign_id} already sent"

    if campaign.status == 'CANCELLED':
        logger.warning("send_campaign: Campaign %s is cancelled — skipping", campaign_id)
        return f"Campaign {campaign_id} is cancelled"

    campaign.status = 'SENDING'
    campaign.save(update_fields=['status'])

    contacts = campaign.contact_list.contacts.filter(is_subscribed=True)

    sent_count = 0
    failed_count = 0
    suppressed_count = 0

    try:
        for contact in contacts:

            # Skip suppressed contacts
            if SuppressedEmail.objects.filter(
                user=campaign.user,
                email=contact.email
            ).exists():
                suppressed_count += 1
                continue

            email_send = EmailSend.objects.create(
                campaign=campaign,
                contact=contact,
                email=contact.email,
                status='PENDING'
            )

            try:
                subject = personalize_text(campaign.subject, contact)
                body = personalize_text(campaign.content, contact)

                response = send_email(
                    to_email=contact.email,
                    subject=subject,
                    body=body
                )

                email_send.status = 'SENT'
                email_send.ses_message_id = response['MessageId']
                email_send.sent_at = timezone.now()
                email_send.save()

                sent_count += 1
                logger.debug(
                    "send_campaign: sent to %s (campaign %s)",
                    contact.email, campaign_id
                )

            except smtplib.SMTPException as exc:
                error_msg = str(exc)
                logger.warning(
                    "send_campaign: SMTP error for %s — will retry task: %s",
                    contact.email, error_msg
                )
                email_send.status = 'FAILED'
                email_send.error_message = f"[SMTP] {error_msg}"
                email_send.save()
                failed_count += 1

                raise self.retry(
                    exc=exc,
                    countdown=60 * (2 ** self.request.retries)
                )

            except Exception as exc:
                logger.exception(
                    "send_campaign: unexpected error for %s: %s",
                    contact.email, exc
                )
                email_send.status = 'FAILED'
                email_send.error_message = str(exc)
                email_send.save()
                failed_count += 1

    except MaxRetriesExceededError:
        # All retries exhausted — mark campaign FAILED
        logger.error(
            "send_campaign: max retries exceeded for campaign %s", campaign_id
        )
        campaign.status = 'FAILED'
        campaign.save(update_fields=['status'])
        return f"Campaign {campaign_id} failed after max retries"

    except Exception as exc:
        # Completely unexpected error in the outer loop
        logger.exception(
            "send_campaign: unhandled exception for campaign %s: %s",
            campaign_id, exc
        )
        campaign.status = 'FAILED'
        campaign.save(update_fields=['status'])
        return f"Campaign {campaign_id} failed: {exc}"

    # ----------------------------------------------------------------
    # Determine final campaign status
    # ----------------------------------------------------------------
    total_attempted = sent_count + failed_count

    if sent_count > 0 and failed_count == 0:
        final_status = 'SENT'
    elif sent_count > 0 and failed_count > 0:
        final_status = 'PARTIAL'
    else:
        # Nothing sent at all (all failed, or no eligible contacts)
        final_status = 'FAILED'

    campaign.status = final_status
    campaign.save(update_fields=['status'])

    logger.info(
        "send_campaign: campaign %s finished — status=%s sent=%d failed=%d suppressed=%d",
        campaign_id, final_status, sent_count, failed_count, suppressed_count
    )

    return (
        f"Campaign {campaign_id}: {final_status} | "
        f"sent={sent_count} failed={failed_count} suppressed={suppressed_count}"
    )