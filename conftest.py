"""
Shared pytest fixtures available to all test modules.
"""

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from contacts.models import Contact, ContactList, SuppressedEmail
from campaigns.models import Campaign, EmailSend


# ---------------------------------------------------------------------------
# Client / auth fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username='testuser',
        email='testuser@example.com',
        password='testpass123'
    )


@pytest.fixture
def other_user(db):
    return User.objects.create_user(
        username='otheruser',
        email='otheruser@example.com',
        password='testpass123'
    )


@pytest.fixture
def auth_client(api_client, user):
    """APIClient pre-authenticated as `user`."""
    refresh = RefreshToken.for_user(user)
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return api_client


@pytest.fixture
def other_auth_client(api_client, other_user):
    """APIClient pre-authenticated as `other_user`."""
    refresh = RefreshToken.for_user(other_user)
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
    return api_client


# ---------------------------------------------------------------------------
# Model fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def contact(db, user):
    return Contact.objects.create(
        user=user,
        email='contact@example.com',
        first_name='Jane',
        last_name='Doe',
        is_subscribed=True
    )


@pytest.fixture
def contact_list(db, user, contact):
    cl = ContactList.objects.create(user=user, name='Test List')
    cl.contacts.add(contact)
    return cl


@pytest.fixture
def campaign(db, user, contact_list):
    return Campaign.objects.create(
        user=user,
        name='Test Campaign',
        subject='Hello {{first_name}}',
        content='Hi {{first_name}}, click {{unsubscribe_url}} to unsubscribe.',
        contact_list=contact_list,
        status='DRAFT'
    )


@pytest.fixture
def scheduled_campaign(db, user, contact_list):
    from django.utils import timezone
    from datetime import timedelta
    return Campaign.objects.create(
        user=user,
        name='Scheduled Campaign',
        subject='Scheduled',
        content='Scheduled content',
        contact_list=contact_list,
        status='SCHEDULED',
        scheduled_at=timezone.now() + timedelta(hours=1),
        celery_task_id='fake-celery-task-id'
    )
