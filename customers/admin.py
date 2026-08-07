from django.contrib import admin

from .models import Customer, CustomerLedgerEntry


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ["name", "organization", "status", "mobile"]
    list_filter = ["status"]
    search_fields = ["name", "gstin", "mobile"]


@admin.register(CustomerLedgerEntry)
class CustomerLedgerEntryAdmin(admin.ModelAdmin):
    list_display = ["customer", "date", "entry_type", "amount", "payment_mode"]
    list_filter = ["entry_type", "date"]
    search_fields = ["customer__name"]
