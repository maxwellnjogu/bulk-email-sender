"""
Tests for the campaigns app:
  - Campaign CRUD + ownership isolation
  - Campaign scheduling
  - Campaign cancellation (+ Celery revoke)
  - Campaign rescheduling
  - Analytics endpoint
  - send_campaign task logic (mocked SES)
  - SNS webhook signature validation
  - Bounce / complaint processing
"""

import json
import pytest
from unittest.mock import patch, MagicMock
from django.utils import timezone
from datetime import timedelta
from botocore.exceptions import ClientError

from campaigns.models import Campaign, EmailSend
from campaigns.tasks import send_campaign, personalize_text
from contacts.models import Contact, SuppressedEmail


# ===========================================================================
# Campaign CRUD
# ===========================================================================

@pytest.mark.django_db
class TestCampaignCRUD:

    def test_list_own_campaigns(self, auth_client, campaign):
        resp = auth_client.get('/api/campaigns/')
        assert resp.status_code == 200
        assert len(resp.data) == 1

    def test_cannot_see_other_campaigns(self, other_auth_client, campaign):
        resp = other_auth_client.get('/api/campaigns/')
        assert resp.data == []

    def test_retrieve_campaign(self, auth_client, campaign):
        resp = auth_client.get(f'/api/campaigns/{campaign.id}/')
        assert resp.status_code == 200
        assert resp.data['name'] == campaign.name

    def test_unauthenticated_blocked(self, api_client, campaign):
        resp = api_client.get('/api/campaigns/')
        assert resp.status_code == 401


# ===========================================================================
# Campaign creation — immediate vs scheduled
# ===========================================================================

@pytest.mark.django_db
class TestCampaignCreation:

    @patch('campaigns.views.send_campaign')
    def test_immediate_send_triggers_task(self, mock_task, auth_client, contact_list):
        mock_task.delay = MagicMock()
        resp = auth_client.post('/api/campaigns/', {
            'name': 'Immediate',
            'subject': 'Hi',
            'content': 'Body',
            'contact_list': contact_list.id,
        })
        assert resp.status_code == 201
        mock_task.delay.assert_called_once()

    @patch('campaigns.views.send_campaign')
    def test_scheduled_send_sets_status(self, mock_task, auth_client, contact_list):
        mock_result = MagicMock()
        mock_result.id = 'celery-task-abc'
        mock_task.apply_async = MagicMock(return_value=mock_result)

        future = (timezone.now() + timedelta(hours=2)).isoformat()
        resp = auth_client.post('/api/campaigns/', {
            'name': 'Scheduled',
            'subject': 'Hi',
            'content': 'Body',
            'contact_list': contact_list.id,
            'scheduled_at': future,
        })
        assert resp.status_code == 201
        campaign = Campaign.objects.get(id=resp.data['id'])
        assert campaign.status == 'SCHEDULED'
        assert campaign.celery_task_id == 'celery-task-abc'


# ===========================================================================
# Cancel
# ===========================================================================

@pytest.mark.django_db
class TestCampaignCancel:

    @patch('campaigns.views.current_app')
    def test_cancel_scheduled_campaign(self, mock_celery, auth_client, scheduled_campaign):
        mock_celery.control.revoke = MagicMock()
        resp = auth_client.post(f'/api/campaigns/{scheduled_campaign.id}/cancel/')
        assert resp.status_code == 200
        scheduled_campaign.refresh_from_db()
        assert scheduled_campaign.status == 'CANCELLED'
        assert scheduled_campaign.celery_task_id is None
        mock_celery.control.revoke.assert_called_once_with(
            'fake-celery-task-id', terminate=False
        )

    def test_cannot_cancel_non_scheduled(self, auth_client, campaign):
        resp = auth_client.post(f'/api/campaigns/{campaign.id}/cancel/')
        assert resp.status_code == 400
        assert 'Only scheduled' in resp.data['error']


# ===========================================================================
# Reschedule
# ===========================================================================

@pytest.mark.django_db
class TestCampaignReschedule:

    @patch('campaigns.views.current_app')
    @patch('campaigns.views.send_campaign')
    def test_reschedule_updates_time_and_task(
        self, mock_task, mock_celery, auth_client, scheduled_campaign
    ):
        mock_celery.control.revoke = MagicMock()
        mock_result = MagicMock()
        mock_result.id = 'new-celery-id'
        mock_task.apply_async = MagicMock(return_value=mock_result)

        new_time = (timezone.now() + timedelta(days=2)).isoformat()
        resp = auth_client.patch(
            f'/api/campaigns/{scheduled_campaign.id}/reschedule/',
            {'scheduled_at': new_time},
            format='json'
        )
        assert resp.status_code == 200
        scheduled_campaign.refresh_from_db()
        assert scheduled_campaign.celery_task_id == 'new-celery-id'
        mock_celery.control.revoke.assert_called_once()

    def test_reschedule_past_time_rejected(self, auth_client, scheduled_campaign):
        past = (timezone.now() - timedelta(hours=1)).isoformat()
        resp = auth_client.patch(
            f'/api/campaigns/{scheduled_campaign.id}/reschedule/',
            {'scheduled_at': past},
            format='json'
        )
        assert resp.status_code == 400
        assert 'future' in resp.data['error']

    def test_reschedule_missing_time(self, auth_client, scheduled_campaign):
        resp = auth_client.patch(
            f'/api/campaigns/{scheduled_campaign.id}/reschedule/',
            {},
            format='json'
        )
        assert resp.status_code == 400

    def test_cannot_reschedule_non_scheduled(self, auth_client, campaign):
        future = (timezone.now() + timedelta(hours=1)).isoformat()
        resp = auth_client.patch(
            f'/api/campaigns/{campaign.id}/reschedule/',
            {'scheduled_at': future},
            format='json'
        )
        assert resp.status_code == 400


# ===========================================================================
# Analytics
# ===========================================================================

@pytest.mark.django_db
class TestAnalytics:

    def test_analytics_returns_counts(self, auth_client, campaign, contact):
        EmailSend.objects.create(
            campaign=campaign, contact=contact,
            email=contact.email, status='SENT'
        )
        EmailSend.objects.create(
            campaign=campaign, contact=contact,
            email=contact.email, status='FAILED'
        )
        resp = auth_client.get(f'/api/campaigns/{campaign.id}/analytics/')
        assert resp.status_code == 200
        assert resp.data['sent'] == 1
        assert resp.data['failed'] == 1
        assert resp.data['total'] == 2
        assert resp.data['success_rate'] == '50.0%'

    def test_analytics_zero_sends(self, auth_client, campaign):
        resp = auth_client.get(f'/api/campaigns/{campaign.id}/analytics/')
        assert resp.data['total'] == 0
        assert resp.data['success_rate'] == '0.0%'


# ===========================================================================
# send_campaign task
# ===========================================================================

@pytest.mark.django_db
class TestSendCampaignTask:

    @patch('campaigns.tasks.send_email')
    def test_successful_send_marks_sent(self, mock_send, campaign, contact):
        mock_send.return_value = {'MessageId': 'msg-123'}
        send_campaign(campaign.id)
        campaign.refresh_from_db()
        assert campaign.status == 'SENT'
        send = EmailSend.objects.get(campaign=campaign)
        assert send.status == 'SENT'
        assert send.ses_message_id == 'msg-123'

    @patch('campaigns.tasks.send_email')
    def test_all_fail_marks_campaign_failed(self, mock_send, campaign, contact):
        mock_send.side_effect = Exception('SES error')
        send_campaign(campaign.id)
        campaign.refresh_from_db()
        assert campaign.status == 'FAILED'

    @patch('campaigns.tasks.send_email')
    def test_suppressed_contact_skipped(self, mock_send, campaign, contact, user):
        SuppressedEmail.objects.create(user=user, email=contact.email, reason='BOUNCE')
        send_campaign(campaign.id)
        mock_send.assert_not_called()
        campaign.refresh_from_db()
        assert campaign.status == 'FAILED'  # no sends attempted

    @patch('campaigns.tasks.send_email')
    def test_unsubscribed_contact_skipped(self, mock_send, campaign, contact):
        contact.is_subscribed = False
        contact.save()
        send_campaign(campaign.id)
        mock_send.assert_not_called()

    @patch('campaigns.tasks.send_email')
    def test_cancelled_campaign_not_sent(self, mock_send, campaign):
        campaign.status = 'CANCELLED'
        campaign.save()
        send_campaign(campaign.id)
        mock_send.assert_not_called()

    @patch('campaigns.tasks.send_email')
    def test_already_sent_not_resent(self, mock_send, campaign):
        campaign.status = 'SENT'
        campaign.save()
        send_campaign(campaign.id)
        mock_send.assert_not_called()

    @patch('campaigns.tasks.send_email')
    def test_partial_status_when_mixed(self, mock_send, campaign, contact, user):
        # Add a second contact — first sends, second fails
        contact2 = Contact.objects.create(
            user=user, email='second@example.com',
            first_name='Second', is_subscribed=True
        )
        campaign.contact_list.contacts.add(contact2)

        def side_effect(to_email, **kwargs):
            if to_email == contact.email:
                return {'MessageId': 'ok-123'}
            raise Exception('Failed')

        mock_send.side_effect = side_effect
        send_campaign(campaign.id)
        campaign.refresh_from_db()
        assert campaign.status == 'PARTIAL'


# ===========================================================================
# Personalisation
# ===========================================================================

@pytest.mark.django_db
class TestPersonaliseText:

    def test_placeholders_replaced(self, contact):
        result = personalize_text('Hello {{first_name}} {{last_name}} - {{email}}', contact)
        assert 'Jane' in result
        assert 'Doe' in result
        assert contact.email in result

    def test_unsubscribe_url_injected(self, contact):
        result = personalize_text('Unsubscribe: {{unsubscribe_url}}', contact)
        assert 'unsubscribe' in result
        assert 'token=' in result


# ===========================================================================
# SES Webhook
# ===========================================================================

@pytest.mark.django_db
class TestSESWebhook:

    def _post(self, api_client, data):
        return api_client.post(
            '/api/ses-webhook/',
            data=json.dumps(data),
            content_type='application/json'
        )

    @patch('campaigns.views._verify_sns_signature', return_value=False)
    def test_invalid_signature_rejected(self, mock_verify, api_client):
        resp = self._post(api_client, {'Type': 'Notification'})
        assert resp.status_code == 403

    @patch('campaigns.views._verify_sns_signature', return_value=True)
    @patch('campaigns.views.urllib.request.urlopen')
    def test_subscription_confirmation_confirmed(
        self, mock_urlopen, mock_verify, api_client
    ):
        mock_urlopen.return_value.__enter__ = MagicMock(return_value=MagicMock())
        mock_urlopen.return_value.__exit__ = MagicMock(return_value=False)
        resp = self._post(api_client, {
            'Type': 'SubscriptionConfirmation',
            'SubscribeURL': 'https://sns.amazonaws.com/confirm?token=abc',
            'TopicArn': 'arn:aws:sns:us-east-1:123:topic',
        })
        assert resp.status_code == 200

    @patch('campaigns.views._verify_sns_signature', return_value=True)
    def test_bounce_adds_to_suppression(self, mock_verify, api_client, user, campaign, contact):
        email_send = EmailSend.objects.create(
            campaign=campaign, contact=contact,
            email=contact.email, status='SENT',
            ses_message_id='bounce-msg-id'
        )
        ses_message = {
            'notificationType': 'Bounce',
            'mail': {'messageId': 'bounce-msg-id'},
            'bounce': {
                'bouncedRecipients': [{'emailAddress': contact.email}]
            }
        }
        resp = self._post(api_client, {
            'Type': 'Notification',
            'Message': json.dumps(ses_message),
        })
        assert resp.status_code == 200
        assert SuppressedEmail.objects.filter(
            user=user, email=contact.email, reason='BOUNCE'
        ).exists()

    @patch('campaigns.views._verify_sns_signature', return_value=True)
    def test_complaint_adds_to_suppression(self, mock_verify, api_client, user, campaign, contact):
        EmailSend.objects.create(
            campaign=campaign, contact=contact,
            email=contact.email, status='SENT',
            ses_message_id='complaint-msg-id'
        )
        ses_message = {
            'notificationType': 'Complaint',
            'mail': {'messageId': 'complaint-msg-id'},
            'complaint': {
                'complainedRecipients': [{'emailAddress': contact.email}]
            }
        }
        resp = self._post(api_client, {
            'Type': 'Notification',
            'Message': json.dumps(ses_message),
        })
        assert resp.status_code == 200
        assert SuppressedEmail.objects.filter(
            user=user, email=contact.email, reason='COMPLAINT'
        ).exists()

    @patch('campaigns.views._verify_sns_signature', return_value=True)
    def test_unknown_message_id_skips_gracefully(self, mock_verify, api_client):
        ses_message = {
            'notificationType': 'Bounce',
            'mail': {'messageId': 'no-such-id'},
            'bounce': {'bouncedRecipients': [{'emailAddress': 'x@y.com'}]}
        }
        resp = self._post(api_client, {
            'Type': 'Notification',
            'Message': json.dumps(ses_message),
        })
        assert resp.status_code == 200
        assert SuppressedEmail.objects.count() == 0
