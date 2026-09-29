import csv
import io
import re

from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser

from .models import Contact, ContactList, SuppressedEmail
from .serializers import (
    ContactSerializer,
    ContactListSerializer,
    SuppressedEmailSerializer,
)
from .tokens import verify_unsubscribe_token

EMAIL_REGEX = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
CSV_ROW_LIMIT = 10_000


class ContactViewSet(viewsets.ModelViewSet):
    serializer_class = ContactSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Contact.objects.filter(
            user=self.request.user
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(
        detail=False,
        methods=['post'],
        parser_classes=[MultiPartParser, FormParser]
    )
    def import_csv(self, request):
        csv_file = request.FILES.get('file')

        # ---- file-level validation ----------------------------------------
        if not csv_file:
            return Response(
                {'error': 'CSV file is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not csv_file.name.lower().endswith('.csv'):
            return Response(
                {'error': 'Only CSV files are allowed.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if csv_file.size == 0:
            return Response(
                {'error': 'The uploaded file is empty.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            decoded = csv_file.read().decode('utf-8')
        except UnicodeDecodeError:
            return Response(
                {'error': 'File must be UTF-8 encoded.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reader = csv.DictReader(io.StringIO(decoded))

        # ---- header validation --------------------------------------------
        if reader.fieldnames is None or 'email' not in reader.fieldnames:
            return Response(
                {'error': "CSV must contain an 'email' column."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # ---- row-level processing -----------------------------------------
        created = 0
        skipped = 0
        errors = []          # list of {row, email, reason}
        seen_in_file = set() # dedup within the upload itself

        for row_index, row in enumerate(reader, start=2):  # row 1 = header

            if row_index - 1 > CSV_ROW_LIMIT:
                errors.append({
                    'row': row_index,
                    'reason': f'Row limit of {CSV_ROW_LIMIT:,} exceeded — import stopped.'
                })
                break

            email = (row.get('email') or '').strip().lower()

            if not email:
                errors.append({'row': row_index, 'email': '', 'reason': 'Email is empty.'})
                skipped += 1
                continue

            if not EMAIL_REGEX.match(email):
                errors.append({'row': row_index, 'email': email, 'reason': 'Invalid email format.'})
                skipped += 1
                continue

            if email in seen_in_file:
                errors.append({'row': row_index, 'email': email, 'reason': 'Duplicate within file.'})
                skipped += 1
                continue

            seen_in_file.add(email)

            if Contact.objects.filter(user=request.user, email=email).exists():
                skipped += 1
                continue

            Contact.objects.create(
                user=request.user,
                email=email,
                first_name=(row.get('first_name') or '').strip(),
                last_name=(row.get('last_name') or '').strip(),
                is_subscribed=True
            )
            created += 1

        response_data = {
            'message': 'CSV imported.',
            'created': created,
            'skipped': skipped,
        }
        if errors:
            response_data['errors'] = errors

        return Response(response_data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def unsubscribe(self, request, pk=None):
        contact = self.get_object()

        contact.is_subscribed = False
        contact.save(update_fields=['is_subscribed'])

        return Response(
            {'message': 'Contact unsubscribed successfully.'},
            status=status.HTTP_200_OK
        )


class ContactListViewSet(viewsets.ModelViewSet):
    serializer_class = ContactListSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ContactList.objects.filter(
            user=self.request.user
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class SuppressedEmailViewSet(viewsets.ModelViewSet):
    serializer_class = SuppressedEmailSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return SuppressedEmail.objects.filter(
            user=self.request.user
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


# ---------------------------------------------------------------------------
# Public unsubscribe-by-token view (no authentication required)
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([AllowAny])
def unsubscribe_by_token(request):
    """
    One-click unsubscribe endpoint.
    Called via the signed link embedded in every campaign email.

    GET /api/unsubscribe/?token=<signed-token>
    """
    token = request.query_params.get('token', '')

    if not token:
        return Response(
            {'error': 'Token is required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    contact_id = verify_unsubscribe_token(token)

    if contact_id is None:
        return Response(
            {'error': 'Invalid or expired unsubscribe link.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        contact = Contact.objects.get(id=contact_id)
    except Contact.DoesNotExist:
        return Response(
            {'error': 'Contact not found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    # Unsubscribe the contact
    contact.is_subscribed = False
    contact.save(update_fields=['is_subscribed'])

    # Also add to suppression list so they won't receive future campaigns
    # from any campaign by the same user, even if re-added to a list
    SuppressedEmail.objects.get_or_create(
        user=contact.user,
        email=contact.email,
        defaults={'reason': 'UNSUBSCRIBED'}
    )

    return Response(
        {'message': 'You have been unsubscribed successfully.'},
        status=status.HTTP_200_OK
    )