from django.contrib import admin

from .models import Document


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ["doc_type", "holder", "valid_till", "is_expired", "is_due", "status"]
    list_filter = ["doc_type", "status"]
    search_fields = ["doc_number", "vehicle__registration_number", "driver__name"]
