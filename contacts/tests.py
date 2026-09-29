"""
Tests for the contacts app:
  - Contact CRUD + ownership isolation
  - ContactList CRUD
  - CSV import validation
  - Unsubscribe via API action
  - Unsubscribe via token link
  - Suppression list
"""

import io
import pytest
from django.urls import reverse

from contacts.models import Contact, ContactList, SuppressedEmail
from contacts.tokens import generate_unsubscribe_token, verify_unsubscribe_token


# ===========================================================================
# Contact CRUD
# ===========================================================================

@pytest.mark.django_db
class TestContactCRUD:

    def test_list_own_contacts(self, auth_client, contact):
        resp = auth_client.get('/api/contacts/')
        assert resp.status_code == 200
        assert len(resp.data) == 1
        assert resp.data[0]['email'] == contact.email

    def test_cannot_see_other_users_contacts(self, other_auth_client, contact):
        resp = other_auth_client.get('/api/contacts/')
        assert resp.status_code == 200
        assert resp.data == []

    def test_create_contact(self, auth_client, user):
        resp = auth_client.post('/api/contacts/', {
            'email': 'new@example.com',
            'first_name': 'New',
            'last_name': 'Contact',
        })
        assert resp.status_code == 201
        assert Contact.objects.filter(user=user, email='new@example.com').exists()

    def test_create_contact_invalid_email(self, auth_client):
        resp = auth_client.post('/api/contacts/', {'email': 'not-an-email'})
        assert resp.status_code == 400

    def test_delete_contact(self, auth_client, contact):
        resp = auth_client.delete(f'/api/contacts/{contact.id}/')
        assert resp.status_code == 204
        assert not Contact.objects.filter(id=contact.id).exists()

    def test_unauthenticated_cannot_list(self, api_client):
        resp = api_client.get('/api/contacts/')
        assert resp.status_code == 401


# ===========================================================================
# CSV Import
# ===========================================================================

@pytest.mark.django_db
class TestCSVImport:

    def _upload(self, auth_client, content, filename='contacts.csv'):
        f = io.BytesIO(content.encode('utf-8'))
        f.name = filename
        return auth_client.post(
            '/api/contacts/import_csv/',
            {'file': f},
            format='multipart'
        )

    def test_valid_import(self, auth_client, user):
        resp = self._upload(auth_client, 'email,first_name,last_name\njohn@example.com,John,Smith\n')
        assert resp.status_code == 200
        assert resp.data['created'] == 1
        assert Contact.objects.filter(user=user, email='john@example.com').exists()

    def test_missing_email_column(self, auth_client):
        resp = self._upload(auth_client, 'name,phone\nJohn,12345\n')
        assert resp.status_code == 400
        assert 'email' in resp.data['error'].lower()

    def test_invalid_email_format_reported(self, auth_client):
        resp = self._upload(auth_client, 'email\nnot-an-email\n')
        assert resp.status_code == 200
        assert resp.data['skipped'] == 1
        assert any('Invalid email' in e['reason'] for e in resp.data.get('errors', []))

    def test_duplicate_within_file(self, auth_client):
        resp = self._upload(auth_client, 'email\ndup@example.com\ndup@example.com\n')
        assert resp.status_code == 200
        assert resp.data['created'] == 1
        assert resp.data['skipped'] == 1

    def test_existing_contact_skipped(self, auth_client, contact):
        resp = self._upload(auth_client, f'email\n{contact.email}\n')
        assert resp.status_code == 200
        assert resp.data['skipped'] == 1
        assert resp.data['created'] == 0

    def test_empty_file(self, auth_client):
        f = io.BytesIO(b'')
        f.name = 'empty.csv'
        resp = auth_client.post('/api/contacts/import_csv/', {'file': f}, format='multipart')
        assert resp.status_code == 400

    def test_wrong_extension(self, auth_client):
        resp = self._upload(auth_client, 'email\na@b.com\n', filename='data.txt')
        assert resp.status_code == 400

    def test_no_file(self, auth_client):
        resp = auth_client.post('/api/contacts/import_csv/', {}, format='multipart')
        assert resp.status_code == 400


# ===========================================================================
# Unsubscribe via API action (authenticated)
# ===========================================================================

@pytest.mark.django_db
class TestUnsubscribeAction:

    def test_unsubscribe_contact(self, auth_client, contact):
        resp = auth_client.post(f'/api/contacts/{contact.id}/unsubscribe/')
        assert resp.status_code == 200
        contact.refresh_from_db()
        assert contact.is_subscribed is False

    def test_cannot_unsubscribe_other_users_contact(self, other_auth_client, contact):
        # other_auth_client does not own this contact — should 404
        resp = other_auth_client.post(f'/api/contacts/{contact.id}/unsubscribe/')
        assert resp.status_code == 404


# ===========================================================================
# Unsubscribe via token link (public)
# ===========================================================================

@pytest.mark.django_db
class TestUnsubscribeByToken:

    def test_valid_token_unsubscribes(self, api_client, contact):
        token = generate_unsubscribe_token(contact.id)
        resp = api_client.get(f'/api/unsubscribe/?token={token}')
        assert resp.status_code == 200
        contact.refresh_from_db()
        assert contact.is_subscribed is False

    def test_valid_token_adds_to_suppression(self, api_client, contact):
        token = generate_unsubscribe_token(contact.id)
        api_client.get(f'/api/unsubscribe/?token={token}')
        assert SuppressedEmail.objects.filter(
            user=contact.user, email=contact.email, reason='UNSUBSCRIBED'
        ).exists()

    def test_missing_token(self, api_client):
        resp = api_client.get('/api/unsubscribe/')
        assert resp.status_code == 400

    def test_invalid_token(self, api_client):
        resp = api_client.get('/api/unsubscribe/?token=totallyinvalid')
        assert resp.status_code == 400

    def test_expired_token(self, api_client, contact):
        import time
        from unittest.mock import patch
        # Generate a token but make verify_unsubscribe_token think it's expired
        token = generate_unsubscribe_token(contact.id)
        future_time = time.time() + (31 * 24 * 60 * 60)  # 31 days later
        with patch('contacts.tokens.time') as mock_time:
            mock_time.time.return_value = future_time
            contact_id = verify_unsubscribe_token(token)
        assert contact_id is None


# ===========================================================================
# Suppression list
# ===========================================================================

@pytest.mark.django_db
class TestSuppressionList:

    def test_create_suppression(self, auth_client, user):
        resp = auth_client.post('/api/suppression/', {
            'email': 'spam@example.com',
            'reason': 'MANUAL'
        })
        assert resp.status_code == 201
        assert SuppressedEmail.objects.filter(user=user, email='spam@example.com').exists()

    def test_list_own_suppressions(self, auth_client, user):
        SuppressedEmail.objects.create(user=user, email='s@example.com', reason='BOUNCE')
        resp = auth_client.get('/api/suppression/')
        assert resp.status_code == 200
        assert len(resp.data) == 1

    def test_cannot_see_other_users_suppressions(self, other_auth_client, user):
        SuppressedEmail.objects.create(user=user, email='s@example.com', reason='BOUNCE')
        resp = other_auth_client.get('/api/suppression/')
        assert resp.data == []
