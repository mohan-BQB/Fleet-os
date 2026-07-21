from django.contrib import admin

from .models import DriverLedgerEntry, FuelLog, TripLeg, TripSheet


class TripLegInline(admin.TabularInline):
    model = TripLeg
    extra = 0


@admin.register(TripSheet)
class TripSheetAdmin(admin.ModelAdmin):
    list_display = ["vehicle", "driver", "date", "opening_meter", "closing_meter", "status"]
    list_filter = ["status", "date"]
    search_fields = ["vehicle__registration_number", "driver__name"]
    inlines = [TripLegInline]


@admin.register(FuelLog)
class FuelLogAdmin(admin.ModelAdmin):
    list_display = ["vehicle", "date", "litres", "rate_per_litre", "amount", "fuel_station"]
    list_filter = ["date"]
    search_fields = ["vehicle__registration_number", "fuel_station"]


@admin.register(DriverLedgerEntry)
class DriverLedgerEntryAdmin(admin.ModelAdmin):
    list_display = ["driver", "date", "entry_type", "amount", "trip_sheet"]
    list_filter = ["entry_type", "date"]
    search_fields = ["driver__name"]
