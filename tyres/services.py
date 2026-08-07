"""Atomic tyre-replacement mechanics. Called from
TyreServiceViewSet.replace_tyre inside the same DB transaction as the
TyreService record documenting the swap - so a replacement can never leave
the outgoing tyre retired/spared with no incoming tyre recorded, or vice
versa (see the view action for the transaction boundary and validation)."""
from .models import Tyre, TyreStatus


def apply_tyre_replacement(*, previous_tyre, disposition, date, promote_tyre=None, new_tyre_data=None, new_odometer=None):
    """new_odometer must already be a Decimal or None by the time it gets
    here (see the view, which parses it) - Tyre.save()'s distance math does
    real Decimal arithmetic against it, so a raw request string would blow
    up there instead of failing with a clean validation error."""
    old_position = previous_tyre.position

    if disposition == "retired":
        previous_tyre.retire()
    else:
        # Keeps a human-readable trace of where this spare came from, and -
        # just as important - frees the road position string so the
        # incoming tyre can take it without a same-vehicle position clash
        # (Tyre.position is otherwise unique-per-vehicle among non-retired
        # tyres, enforced in TyreSerializer.validate()).
        previous_tyre.status = TyreStatus.SPARE
        previous_tyre.position = f"Spare (ex {old_position})" if old_position else "Spare"
        previous_tyre.save()

    if promote_tyre is not None:
        new_tyre = promote_tyre
        new_tyre.position = old_position
        new_tyre.status = TyreStatus.FITTED
        new_tyre.fitted_date = date
        if new_odometer is not None:
            new_tyre.odometer_at_fitting = new_odometer
        new_tyre.save()
    else:
        new_tyre = Tyre.objects.create(
            vehicle=previous_tyre.vehicle, position=old_position, status=TyreStatus.FITTED,
            fitted_date=date, odometer_at_fitting=new_odometer, **(new_tyre_data or {}),
        )
    return new_tyre
