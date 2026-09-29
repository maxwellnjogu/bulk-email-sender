from django.contrib import admin
from .models import Contact, ContactList


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = (
        'email',
        'first_name',
        'last_name',
        'is_subscribed',
        'created_at',
    )
    list_filter = ('is_subscribed',)
    search_fields = ('email', 'first_name', 'last_name')


@admin.register(ContactList)
class ContactListAdmin(admin.ModelAdmin):
    list_display = (
        'name',
        'user',
        'created_at',
    )
    search_fields = ('name', 'description')
    filter_horizontal = ('contacts',)