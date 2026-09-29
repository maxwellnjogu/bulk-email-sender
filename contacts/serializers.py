from rest_framework import serializers
from .models import Contact, ContactList, SuppressedEmail


class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = [
            'id',
            'email',
            'first_name',
            'last_name',
            'is_subscribed',
            'created_at',
        ]
        read_only_fields = [
            'id',
            'created_at',
        ]


class ContactListSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactList
        fields = [
            'id',
            'name',
            'description',
            'contacts',
            'created_at',
        ]
        read_only_fields = [
            'id',
            'created_at',
        ]


class SuppressedEmailSerializer(serializers.ModelSerializer):
    class Meta:
        model = SuppressedEmail
        fields = [
            'id',
            'email',
            'reason',
            'created_at',
        ]
        read_only_fields = [
            'id',
            'created_at',
        ]