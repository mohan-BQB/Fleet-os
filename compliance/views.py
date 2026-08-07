from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from core.api import RetireOnDestroyMixin
from core.permissions import HasCapability

from .models import Document
from .serializers import DocumentSerializer


class DocumentViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    """CRUD for compliance documents, plus /documents/alerts/ for the
    dashboard: everything expired or inside its reminder window."""
    queryset = Document.objects.select_related("vehicle", "driver").all()
    serializer_class = DocumentSerializer
    permission_classes = [HasCapability]
    # Covers both vehicle- and driver-held documents under one section -
    # every built-in role's `vehicles` and `drivers` defaults match exactly,
    # so this only under/over-grants for a custom per-user override that
    # deliberately splits the two, which no role preset does today.
    required_section = "vehicles"

    @action(detail=False, methods=["get"])
    def alerts(self, request):
        docs = self.get_queryset().needs_attention()
        serializer = self.get_serializer(docs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def renew(self, request, pk=None):
        document = self.get_object()
        valid_till = request.data.get("valid_till")
        if not valid_till:
            raise ValidationError({"valid_till": "Enter the new valid-till date."})
        new_doc = document.renew(
            valid_till=valid_till,
            doc_number=request.data.get("doc_number"),
            issue_date=request.data.get("issue_date"),
            reminder_days_before=request.data.get("reminder_days_before"),
            notes=request.data.get("notes"),
        )
        return Response(DocumentSerializer(new_doc).data, status=201)
