from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from core.api import RetireOnDestroyMixin
from core.permissions import HasCapability

from .models import Tyre, TyreRemovalReason, TyreService, TyreServiceType, TyreSource, TyreStatus
from .serializers import TyreSerializer, TyreServiceSerializer


class TyreViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    queryset = Tyre.objects.select_related("vehicle").all()
    serializer_class = TyreSerializer
    permission_classes = [HasCapability]
    required_section = "vehicles"


class TyreServiceViewSet(RetireOnDestroyMixin, viewsets.ModelViewSet):
    queryset = TyreService.objects.select_related("vehicle", "tyre", "previous_tyre").all()
    serializer_class = TyreServiceSerializer
    permission_classes = [HasCapability]
    required_section = "vehicles"

    @action(detail=False, methods=["post"])
    def replace_tyre(self, request):
        """The one intended door for logging a tyre replacement - swaps the
        outgoing tyre for an incoming one (new or promoted from spare stock)
        and records the service in a single transaction, so a rejected
        request can never leave the outgoing tyre retired/spared with
        nothing recorded to explain it, or vice versa. Manually creating a
        TyreService with service_type=replacement through the plain CRUD
        endpoint is still possible but is rejected unless previous_tyre and
        removal_reason are also supplied (see TyreServiceSerializer.validate) -
        there's no path to a "replacement" that doesn't name both tyres."""
        data = request.data
        previous_tyre = get_object_or_404(Tyre, pk=data.get("previous_tyre"))
        if previous_tyre.status != TyreStatus.FITTED:
            raise ValidationError({"previous_tyre": "Only a currently-fitted tyre can be replaced."})

        disposition = data.get("disposition")
        if disposition not in ("retired", "spare"):
            raise ValidationError(
                {"disposition": "Say what happens to the outgoing tyre - retired, or moved to spare stock."}
            )
        if not data.get("removal_reason"):
            raise ValidationError({"removal_reason": "Say why the outgoing tyre is being replaced."})
        if data.get("removal_reason") not in TyreRemovalReason.values:
            raise ValidationError({"removal_reason": "Not a recognised removal reason."})
        if not data.get("date"):
            raise ValidationError({"date": "This field is required."})

        new_odometer = data.get("odometer")
        if new_odometer is not None:
            try:
                new_odometer = Decimal(str(new_odometer))
            except InvalidOperation:
                raise ValidationError({"odometer": "Enter a valid number."})

        promote_tyre = None
        new_tyre_data = None
        promote_id = data.get("promote_tyre")
        if promote_id:
            promote_tyre = get_object_or_404(
                Tyre, pk=promote_id, vehicle=previous_tyre.vehicle, status=TyreStatus.SPARE
            )
            if promote_tyre.id == previous_tyre.id:
                raise ValidationError({"promote_tyre": "A tyre can't replace itself."})
        else:
            new_tyre_data = {
                "brand": data.get("new_brand", ""), "size": data.get("new_size", ""),
                "serial_number": data.get("new_serial_number", ""),
                "purchase_date": data.get("new_purchase_date") or None,
                "purchase_price": data.get("new_purchase_price") or None,
                "notes": data.get("new_notes", ""),
            }

        with transaction.atomic():
            from .services import apply_tyre_replacement

            new_tyre = apply_tyre_replacement(
                previous_tyre=previous_tyre, disposition=disposition, date=data.get("date"),
                promote_tyre=promote_tyre, new_tyre_data=new_tyre_data,
                new_odometer=new_odometer,
            )
            service_payload = {
                "vehicle": previous_tyre.vehicle_id, "tyre": new_tyre.id, "previous_tyre": previous_tyre.id,
                "service_type": TyreServiceType.REPLACEMENT, "date": data.get("date"),
                "odometer": data.get("odometer"), "tread_depth_in": data.get("tread_depth_in"),
                "removal_reason": data.get("removal_reason"),
                "removal_odometer": data.get("removal_odometer"),
                "removal_tread_depth_in": data.get("removal_tread_depth_in"),
                "new_position": new_tyre.position, "vendor": data.get("vendor"),
                "unlisted_vendor_name": data.get("unlisted_vendor_name", ""),
                "performed_by": data.get("performed_by", ""),
                "service_person_name": data.get("service_person_name", ""),
                "service_person_mobile": data.get("service_person_mobile", ""),
                "notes": data.get("notes", ""), "billing": data.get("billing", ""),
                "internal_note": data.get("internal_note", ""), "amount": data.get("amount"),
                # Derived from whether a spare was promoted, not trusted from
                # the client - promote_tyre already being the authoritative
                # signal for where the incoming tyre came from.
                "tyre_source": TyreSource.FROM_SPARE if promote_tyre is not None else TyreSource.NEW_PURCHASE,
                "tyre_vendor": data.get("tyre_vendor"),
                "tyre_unlisted_vendor_name": data.get("tyre_unlisted_vendor_name", ""),
                "tyre_amount": data.get("tyre_amount"),
            }
            serializer = TyreServiceSerializer(data=service_payload)
            serializer.is_valid(raise_exception=True)
            serializer.save()

        return Response(
            {
                "service": TyreServiceSerializer(serializer.instance).data,
                "new_tyre": TyreSerializer(new_tyre).data,
                "previous_tyre": TyreSerializer(previous_tyre).data,
            },
            status=201,
        )
