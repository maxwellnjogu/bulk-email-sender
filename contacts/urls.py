
from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ContactViewSet,
    ContactListViewSet,
    SuppressedEmailViewSet,
    unsubscribe_by_token,
)

router = DefaultRouter()

router.register('contacts', ContactViewSet, basename='contact')
router.register(
    'contact-lists',
    ContactListViewSet,
    basename='contact-list'
)
router.register(
    'suppression',
    SuppressedEmailViewSet,
    basename='suppression'
)

urlpatterns = router.urls + [
    # Public one-click unsubscribe — no authentication required
    path('unsubscribe/', unsubscribe_by_token, name='unsubscribe-by-token'),
]