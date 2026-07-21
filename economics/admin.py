from django.contrib import admin

from .models import Expense


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ["vehicle", "category", "date", "amount", "vendor"]
    list_filter = ["category", "date"]
    search_fields = ["vehicle__registration_number", "vendor"]
