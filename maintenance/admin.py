from django.contrib import admin

from .models import MaintenanceLog, MaintenanceSchedule


@admin.register(MaintenanceSchedule)
class MaintenanceScheduleAdmin(admin.ModelAdmin):
    list_display = [
        "vehicle", "part_name", "interval_km", "interval_days",
        "last_done_date", "last_done_odometer", "is_overdue", "status",
    ]
    list_filter = ["status"]
    search_fields = ["vehicle__registration_number", "part_name"]


@admin.register(MaintenanceLog)
class MaintenanceLogAdmin(admin.ModelAdmin):
    list_display = ["vehicle", "part_name", "date", "odometer", "schedule", "vendor"]
    list_filter = ["date"]
    search_fields = ["vehicle__registration_number", "part_name", "vendor"]
