from django.contrib import admin

from .models import Driver


@admin.register(Driver)
class DriverAdmin(admin.ModelAdmin):
    list_display = ["name", "code", "organization", "status", "mobile"]
    list_filter = ["status", "employment_type"]
    search_fields = ["name", "code", "mobile", "licence_number"]
