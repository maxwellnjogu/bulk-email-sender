
from rest_framework.routers import DefaultRouter
from .views import EmailTemplateViewSet


router = DefaultRouter()

router.register(
    'email-templates',
    EmailTemplateViewSet,
    basename='email-template'
)

urlpatterns = router.urls