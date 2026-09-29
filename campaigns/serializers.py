
from rest_framework import serializers
from .models import Campaign, EmailSend


class CampaignSerializer(serializers.ModelSerializer):
    class Meta:
        model = Campaign
        fields = [
            'id',
            'name',
            'subject',
            'content',
            'contact_list',
            'status',
            'scheduled_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'status',
            'created_at',
            'updated_at',
        ]


class EmailSendSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailSend
        fields = [
            'id',
            'campaign',
            'contact',
            'email',
            'status',
            'ses_message_id',
            'error_message',
            'sent_at',
            'created_at',
        ]
        read_only_fields = [
            'id',
            'campaign',
            'contact',
            'email',
            'status',
            'ses_message_id',
            'error_message',
            'sent_at',
            'created_at',
        ]