from django.contrib import admin

from .models import Vendor, VendorLedgerEntry


@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display = ["name", "vendor_type", "organization", "status", "mobile"]
    list_filter = ["vendor_type", "status"]
    search_fields = ["name", "gstin", "mobile"]


@admin.register(VendorLedgerEntry)
class VendorLedgerEntryAdmin(admin.ModelAdmin):
    list_display = ["vendor", "date", "entry_type", "amount", "payment_mode"]
    list_filter = ["entry_type", "date"]
    search_fields = ["vendor__name"]
