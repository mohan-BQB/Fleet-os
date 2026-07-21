from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import AuditLog, CompanyProfile, Organization, User


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ["name", "is_active", "created_at"]
    search_fields = ["name"]


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ["username", "email", "role", "organization", "is_active", "is_staff"]
    list_filter = ["role", "organization", "is_active", "is_staff"]
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("Fleet ERP", {"fields": ("organization", "role", "driver_id")}),
    )
    add_fieldsets = DjangoUserAdmin.add_fieldsets + (
        ("Fleet ERP", {"fields": ("email", "organization", "role")}),
    )


@admin.register(CompanyProfile)
class CompanyProfileAdmin(admin.ModelAdmin):
    list_display = ["legal_name", "organization", "gstin"]
    search_fields = ["legal_name", "gstin"]


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ["created_at", "action", "model_name", "object_id", "user", "organization"]
    list_filter = ["action", "model_name"]
    search_fields = ["object_id"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
