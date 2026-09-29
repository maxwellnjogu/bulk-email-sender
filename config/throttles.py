"""
Custom DRF throttle classes with named scopes.

These are referenced in view-level `throttle_classes` lists so they
use the rates defined in settings.DEFAULT_THROTTLE_RATES rather than
the global anon/user defaults.
"""

from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    """
    5 login attempts per minute per IP.
    Applied to the JWT token-obtain endpoint to prevent brute-force.
    """
    scope = 'login'


class WebhookRateThrottle(AnonRateThrottle):
    """
    200 webhook calls per minute per IP.
    Applied to the SES/SNS webhook endpoint.
    """
    scope = 'webhook'
