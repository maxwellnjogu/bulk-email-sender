import json
import logging
import base64
import urllib.request
import urllib.parse
from urllib.error import URLError

from celery.app.control import Control
from celery import current_app

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.x509 import load_pem_x509_certificate

from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from contacts.models import SuppressedEmail
from .models import Campaign, EmailSend
from .serializers import CampaignSerializer, EmailSendSerializer
from .tasks import send_campaign
from config.throttles import WebhookRateThrottle

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory cert cache — avoids re-fetching the signing cert on every call.
# Maps cert URL → PEM bytes.
# ---------------------------------------------------------------------------
_CERT_CACHE: dict[str, bytes] = {}


def _validate_cert_url(url: str) -> bool:
    """
    Ensure the cert URL is a genuine amazonaws.com URL.
    Rejects any attempt to point at an attacker-controlled cert.
    """
    parsed = urllib.parse.urlparse(url)
    return (
        parsed.scheme == 'https'
        and parsed.hostname is not None
        and parsed.hostname.endswith('.amazonaws.com')
    )


def _fetch_cert(cert_url: str) -> bytes:
    """Fetch and cache the PEM cert from the given URL."""
    if cert_url not in _CERT_CACHE:
        try:
            with urllib.request.urlopen(cert_url, timeout=5) as resp:
                _CERT_CACHE[cert_url] = resp.read()
        except URLError as exc:
            raise ValueError(f"Could not fetch SNS signing cert: {exc}") from exc
    return _CERT_CACHE[cert_url]


def _build_canonical_string(data: dict) -> bytes:
    """
    Build the canonical message string for SNS signature verification.
    Field order and inclusion rules are defined by AWS:
    https://docs.aws.amazon.com/sns/latest/dg/SendMessageToHttp.verify.signature.html
    """
    msg_type = data.get('Type', '')

    if msg_type == 'Notification':
        fields = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
    else:
        # SubscriptionConfirmation / UnsubscribeConfirmation
        fields = ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type']

    parts = []
    for field in fields:
        if field in data:
            parts.append(f"{field}\n{data[field]}\n")

    return ''.join(parts).encode('utf-8')


def _verify_sns_signature(data: dict) -> bool:
    """
    Verify the SNS message signature.
    Returns True if valid, False otherwise.
    """
    cert_url = data.get('SigningCertURL', '')

    if not _validate_cert_url(cert_url):
        logger.warning("SNS webhook: rejected invalid SigningCertURL: %s", cert_url)
        return False

    try:
        cert_pem = _fetch_cert(cert_url)
        cert = load_pem_x509_certificate(cert_pem)
        public_key = cert.public_key()

        signature = base64.b64decode(data.get('Signature', ''))
        canonical = _build_canonical_string(data)

        public_key.verify(
            signature,
            canonical,
            padding.PKCS1v15(),
            hashes.SHA1(),   # AWS SNS uses SHA1 for signing
        )
        return True

    except Exception as exc:
        logger.warning("SNS webhook: signature verification failed: %s", exc)
        return False


def _get_user_for_message_id(ses_message_id: str):
    """
    Walk EmailSend → Campaign → user to find who owns this SES message.
    Returns the User instance or None if not found.
    """
    try:
        email_send = EmailSend.objects.select_related('campaign__user').get(
            ses_message_id=ses_message_id
        )
        return email_send.campaign.user
    except EmailSend.DoesNotExist:
        return None


# ---------------------------------------------------------------------------
# ViewSets
# ---------------------------------------------------------------------------

class CampaignViewSet(viewsets.ModelViewSet):
    serializer_class = CampaignSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Campaign.objects.filter(
            user=self.request.user
        )

    def perform_create(self, serializer):
        campaign = serializer.save(user=self.request.user)

        if campaign.scheduled_at:
            campaign.status = 'SCHEDULED'
            result = send_campaign.apply_async(
                args=[campaign.id],
                eta=campaign.scheduled_at
            )
            campaign.celery_task_id = result.id
            campaign.save(update_fields=['status', 'celery_task_id'])
        else:
            send_campaign.delay(campaign.id)

    def _revoke_task(self, campaign):
        """Revoke the pending Celery task for a campaign, if one exists."""
        if campaign.celery_task_id:
            current_app.control.revoke(
                campaign.celery_task_id,
                terminate=False   # don't kill if already running
            )
            logger.info(
                "Revoked Celery task %s for campaign %s",
                campaign.celery_task_id, campaign.id
            )

    @action(detail=True, methods=['get'])
    def analytics(self, request, pk=None):
        campaign = self.get_object()

        sends = campaign.email_sends.all()
        total = sends.count()
        sent = sends.filter(status='SENT').count()
        failed = sends.filter(status='FAILED').count()
        pending = sends.filter(status='PENDING').count()

        success_rate = round((sent / total * 100), 1) if total > 0 else 0.0

        return Response({
            'campaign_id': campaign.id,
            'campaign_status': campaign.status,
            'total': total,
            'sent': sent,
            'failed': failed,
            'pending': pending,
            'success_rate': f"{success_rate}%",
        })

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        campaign = self.get_object()

        if campaign.status != 'SCHEDULED':
            return Response(
                {'error': 'Only scheduled campaigns can be cancelled.'},
                status=400
            )

        self._revoke_task(campaign)

        campaign.status = 'CANCELLED'
        campaign.celery_task_id = None
        campaign.save(update_fields=['status', 'celery_task_id'])

        return Response({
            'message': 'Campaign cancelled successfully.',
            'campaign_id': campaign.id,
            'status': campaign.status
        })

    @action(detail=True, methods=['patch'])
    def reschedule(self, request, pk=None):
        campaign = self.get_object()

        if campaign.status != 'SCHEDULED':
            return Response(
                {'error': 'Only scheduled campaigns can be rescheduled.'},
                status=400
            )

        new_time = request.data.get('scheduled_at')
        if not new_time:
            return Response(
                {'error': 'scheduled_at is required.'},
                status=400
            )

        # Parse and validate the new scheduled time
        from django.utils.dateparse import parse_datetime
        parsed = parse_datetime(str(new_time))
        if parsed is None:
            return Response(
                {'error': 'Invalid datetime format. Use ISO 8601 (e.g. 2026-09-20T10:00:00Z).'},
                status=400
            )

        # Make timezone-aware if naive
        if timezone.is_naive(parsed):
            parsed = timezone.make_aware(parsed)

        if parsed <= timezone.now():
            return Response(
                {'error': 'New scheduled time must be in the future.'},
                status=400
            )

        # Revoke the old Celery task
        self._revoke_task(campaign)

        # Schedule the new task
        result = send_campaign.apply_async(
            args=[campaign.id],
            eta=parsed
        )

        campaign.scheduled_at = parsed
        campaign.celery_task_id = result.id
        campaign.save(update_fields=['scheduled_at', 'celery_task_id'])

        return Response({
            'message': 'Campaign rescheduled successfully.',
            'campaign_id': campaign.id,
            'scheduled_at': campaign.scheduled_at,
            'status': campaign.status,
        })


class EmailSendViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = EmailSendSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return EmailSend.objects.filter(
            campaign__user=self.request.user
        )


# ---------------------------------------------------------------------------
# SES / SNS Webhook
# ---------------------------------------------------------------------------

@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([WebhookRateThrottle])
def ses_webhook(request):
    # ------------------------------------------------------------------
    # 1. Parse the outer SNS envelope
    # ------------------------------------------------------------------
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return Response({'error': 'Invalid JSON'}, status=400)

    msg_type = data.get('Type')

    # ------------------------------------------------------------------
    # 2. Verify SNS signature — reject anything that doesn't pass
    # ------------------------------------------------------------------
    if not _verify_sns_signature(data):
        return Response({'error': 'Invalid SNS signature'}, status=403)

    # ------------------------------------------------------------------
    # 3. Handle SubscriptionConfirmation — auto-confirm the SNS topic
    # ------------------------------------------------------------------
    if msg_type == 'SubscriptionConfirmation':
        subscribe_url = data.get('SubscribeURL', '')
        try:
            with urllib.request.urlopen(subscribe_url, timeout=5):
                pass
            logger.info("SNS webhook: subscription confirmed for topic %s", data.get('TopicArn'))
        except URLError as exc:
            logger.error("SNS webhook: failed to confirm subscription: %s", exc)
            return Response({'error': 'Could not confirm subscription'}, status=500)

        return Response({'message': 'Subscription confirmed.'})

    # ------------------------------------------------------------------
    # 4. Handle Notification — unpack the inner SES message
    # ------------------------------------------------------------------
    if msg_type != 'Notification':
        # UnsubscribeConfirmation or unknown — acknowledge and ignore
        return Response({'message': 'Acknowledged.'})

    try:
        ses_message = json.loads(data.get('Message', '{}'))
    except json.JSONDecodeError:
        return Response({'error': 'Invalid SES message JSON'}, status=400)

    notification_type = ses_message.get('notificationType')

    # ------------------------------------------------------------------
    # 5. Process Bounce
    # ------------------------------------------------------------------
    if notification_type == 'Bounce':
        bounce = ses_message.get('bounce', {})
        recipients = bounce.get('bouncedRecipients', [])
        mail = ses_message.get('mail', {})
        ses_message_id = mail.get('messageId')

        user = _get_user_for_message_id(ses_message_id) if ses_message_id else None

        if user is None:
            logger.warning(
                "SNS bounce: no EmailSend found for messageId=%s — suppression skipped",
                ses_message_id
            )
            return Response({'message': 'Bounce acknowledged (no matching send).'})

        for recipient in recipients:
            email = recipient.get('emailAddress')
            if email:
                _, created = SuppressedEmail.objects.get_or_create(
                    user=user,
                    email=email,
                    defaults={'reason': 'BOUNCE'}
                )
                if created:
                    logger.info("SNS bounce: suppressed %s for user %s", email, user.id)

    # ------------------------------------------------------------------
    # 6. Process Complaint
    # ------------------------------------------------------------------
    elif notification_type == 'Complaint':
        complaint = ses_message.get('complaint', {})
        recipients = complaint.get('complainedRecipients', [])
        mail = ses_message.get('mail', {})
        ses_message_id = mail.get('messageId')

        user = _get_user_for_message_id(ses_message_id) if ses_message_id else None

        if user is None:
            logger.warning(
                "SNS complaint: no EmailSend found for messageId=%s — suppression skipped",
                ses_message_id
            )
            return Response({'message': 'Complaint acknowledged (no matching send).'})

        for recipient in recipients:
            email = recipient.get('emailAddress')
            if email:
                _, created = SuppressedEmail.objects.get_or_create(
                    user=user,
                    email=email,
                    defaults={'reason': 'COMPLAINT'}
                )
                if created:
                    logger.info("SNS complaint: suppressed %s for user %s", email, user.id)

    return Response({'message': 'SES event processed successfully.'})