"""Canonical expense-head seed list, plus the legacy-category -> slug lookup
tables used once by the data migration and going forward by every app that
auto-selects a head when it bills (tyres, maintenance, parts, operations).

Deliberately has zero Django model imports so it's safe to import from a
migration file as well as from ordinary app code.
"""

RUNNING = "running"
LOAD = "load"
TYRE_SERVICE = "tyre_service"
REPAIRS = "repairs"

# (slug, name, group) - seeded once per organization.
SEED_HEADS = [
    ("fuel", "Fuel", RUNNING),
    ("toll_fastag", "Toll / FASTag", RUNNING),
    ("parking", "Parking", RUNNING),
    ("police_rto", "Police / RTO", RUNNING),
    ("weighbridge", "Weighbridge", RUNNING),
    ("bata", "Bata", RUNNING),
    ("food", "Food", RUNNING),
    ("tea", "Tea", RUNNING),
    ("misc", "Misc", RUNNING),
    ("insurance_premium", "Insurance premium", RUNNING),
    ("permit_fee", "Permit fee", RUNNING),
    ("loading", "Loading", LOAD),
    ("unloading", "Unloading", LOAD),
    ("casing_material", "Casing / material", LOAD),
    ("puncture_repair", "Puncture / tyre repair", TYRE_SERVICE),
    ("wheel_alignment", "Wheel alignment", TYRE_SERVICE),
    ("wheel_balancing", "Wheel balancing", TYRE_SERVICE),
    ("tyre_rotation", "Tyre rotation (labour)", TYRE_SERVICE),
    ("tyre_fitting_removal", "Tyre fitting / removal", TYRE_SERVICE),
    ("retreading", "Retreading", TYRE_SERVICE),
    ("general_repairs", "General repairs", REPAIRS),
    ("breakdown", "Breakdown", REPAIRS),
    ("spare_parts", "Spare parts", REPAIRS),
]

# Old economics.ExpenseCategory value -> new slug. "tyres" is refined
# per-row in the data migration where a linked TyreService's service_type
# tells us more; this is just the fallback.
LEGACY_EXPENSE_CATEGORY_TO_SLUG = {
    "maintenance": "general_repairs",
    "tyres": "puncture_repair",
    "toll": "toll_fastag",
    "permit_fee": "permit_fee",
    "insurance_premium": "insurance_premium",
    "spare_parts": "spare_parts",
    "other": "misc",
}

# Old operations.TripExpenseCategory value -> new slug.
LEGACY_TRIP_EXPENSE_CATEGORY_TO_SLUG = {
    "fuel": "fuel",
    "toll_fastag": "toll_fastag",
    "loading": "loading",
    "unloading": "unloading",
    "parking": "parking",
    "police_rto": "police_rto",
    "weighbridge": "weighbridge",
    "casing_material": "casing_material",
    "repairs_on_road": "general_repairs",
    "food": "food",
    "tea_refreshments": "tea",
    "bata": "bata",
    "misc": "misc",
}

# tyres.TyreServiceType value -> default slug, used to pre-fill the head
# when a TyreService bills and the caller didn't pick one explicitly.
TYRE_SERVICE_TYPE_TO_SLUG = {
    "alignment": "wheel_alignment",
    "rotation": "tyre_rotation",
    "balancing": "wheel_balancing",
    "puncture_repair": "puncture_repair",
    "replacement": "tyre_fitting_removal",
    "inspection": "general_repairs",
}
