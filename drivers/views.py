from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from core.permissions import HasCapability

from .models import Driver
from .serializers import DriverSerializer


class DriverViewSet(viewsets.ModelViewSet):
    queryset = Driver.objects.all()
    serializer_class = DriverSerializer
    permission_classes = [HasCapability]
    required_section = "drivers"
    # No bare DELETE - status changes go through change_status/rejoin below,
    # both routed through Driver.change_status()'s transition check. Both
    # actions are also in core.permissions.CHANGE_STATUS_ACTIONS, so
    # HasCapability already requires drivers.change_status for them - no
    # extra manual check needed here.
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    @action(detail=True, methods=["post"])
    def change_status(self, request, pk=None):
        status = request.data.get("status")
        if not status:
            raise ValidationError({"status": "Select the status to move this driver to."})
        driver = self.get_object()
        try:
            driver.change_status(status, reason=request.data.get("reason", ""))
        except ValueError as exc:
            raise ValidationError(str(exc))
        return Response(DriverSerializer(driver).data)

    @action(detail=True, methods=["post"])
    def rejoin(self, request, pk=None):
        driver = self.get_object()
        try:
            driver.rejoin(reason=request.data.get("reason", ""))
        except ValueError as exc:
            raise ValidationError(str(exc))
        return Response(DriverSerializer(driver).data)
