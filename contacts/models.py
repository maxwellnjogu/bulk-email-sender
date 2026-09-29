from django.db import models
from django.contrib.auth.models import User


class Contact(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='contacts'
    )
    email = models.EmailField()
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    is_subscribed = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.email


class ContactList(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='contact_lists'
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    contacts = models.ManyToManyField(
        Contact,
        related_name='contact_lists',
        blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    

    def __str__(self):
        return self.name


class SuppressedEmail(models.Model):
    REASON_CHOICES = [
        ('UNSUBSCRIBED', 'Unsubscribed'),
        ('BOUNCE', 'Bounce'),
        ('COMPLAINT', 'Complaint'),
        ('MANUAL', 'Manual'),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='suppressed_emails'
    )

    email = models.EmailField()

    reason = models.CharField(
        max_length=20,
        choices=REASON_CHOICES
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'email')

    def __str__(self):
        return self.email