from django.contrib import admin

from .models import Tyre, TyreService


@admin.register(Tyre)
class TyreAdmin(admin.ModelAdmin):
    list_display = ["vehicle", "position", "brand", "size", "status", "fitted_date"]
    list_filter = ["status", "brand"]
    search_fields = ["vehicle__registration_number", "serial_number", "brand"]


@admin.register(TyreService)
class TyreServiceAdmin(admin.ModelAdmin):
    list_display = ["vehicle", "service_type", "date", "odometer", "tyre", "new_position", "tread_depth_in"]
    list_filter = ["service_type", "date"]
    search_fields = ["vehicle__registration_number", "vendor"]
