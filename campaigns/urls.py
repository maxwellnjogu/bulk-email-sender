from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CampaignViewSet, EmailSendViewSet, ses_webhook

router = DefaultRouter()

router.register(
    'campaigns',
    CampaignViewSet,
    basename='campaign'
)

router.register(
    'email-sends',
    EmailSendViewSet,
    basename='email-send'
)

urlpatterns = router.urls + [
    path('ses-webhook/', ses_webhook, name='ses-webhook'),
]