from django.contrib import admin

from .models import PartInventoryItem, PartStockMovement


@admin.register(PartInventoryItem)
class PartInventoryItemAdmin(admin.ModelAdmin):
    list_display = ["name", "part_number", "unit", "quantity_on_hand", "reorder_level", "status"]
    list_filter = ["status"]
    search_fields = ["name", "part_number"]


@admin.register(PartStockMovement)
class PartStockMovementAdmin(admin.ModelAdmin):
    list_display = ["item", "movement_type", "date", "quantity", "unit_cost", "vendor", "source_model", "source_id"]
    list_filter = ["movement_type", "date"]
    search_fields = ["item__name", "item__part_number", "vendor__name", "unlisted_vendor_name"]
