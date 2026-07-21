from django.contrib import admin

from .models import Vehicle


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = ["registration_number", "organization", "category", "status", "tracking_mode"]
    list_filter = ["category", "status", "tracking_mode"]
    search_fields = ["registration_number", "chassis_number", "engine_number"]
