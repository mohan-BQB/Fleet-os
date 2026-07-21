from rest_framework import viewsets
from rest_framework.decorators import action
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
    required_capability = "compliance_maintenance"

    @action(detail=False, methods=["get"])
    def alerts(self, request):
        docs = self.get_queryset().needs_attention()
        serializer = self.get_serializer(docs, many=True)
        return Response(serializer.data)
