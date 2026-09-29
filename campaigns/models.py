from django.db import models
from django.contrib.auth.models import User
from contacts.models import ContactList


class Campaign(models.Model):

    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('SCHEDULED', 'Scheduled'),
        ('SENDING', 'Sending'),
        ('SENT', 'Sent'),
        ('PARTIAL', 'Partial'),   # Some sent, some failed
        ('FAILED', 'Failed'),     # Task crashed or zero sends succeeded
        ('CANCELLED', 'Cancelled'),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='campaigns'
    )

    name = models.CharField(max_length=200)
    subject = models.CharField(max_length=255)
    content = models.TextField()

    contact_list = models.ForeignKey(
        ContactList,
        on_delete=models.CASCADE,
        related_name='campaigns'
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='DRAFT'
    )

    scheduled_at = models.DateTimeField(
        null=True,
        blank=True
    )

    # Celery task ID of the scheduled send — used for revocation on cancel/reschedule
    celery_task_id = models.CharField(
        max_length=255,
        blank=True,
        null=True
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class EmailSend(models.Model):

    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('SENT', 'Sent'),
        ('FAILED', 'Failed'),
    ]

    campaign = models.ForeignKey(
        Campaign,
        on_delete=models.CASCADE,
        related_name='email_sends'
    )

    contact = models.ForeignKey(
        'contacts.Contact',
        on_delete=models.CASCADE,
        related_name='email_sends'
    )

    email = models.EmailField()

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='PENDING'
    )

    ses_message_id = models.CharField(
        max_length=255,
        blank=True,
        null=True
    )

    error_message = models.TextField(
        blank=True,
        null=True
    )

    sent_at = models.DateTimeField(
        null=True,
        blank=True
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.email} - {self.status}"