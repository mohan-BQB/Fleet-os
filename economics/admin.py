from django.contrib import admin

from .models import Expense, ExpenseHead


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ["vehicle", "expense_head", "date", "amount", "vendor"]
    list_filter = ["expense_head__group", "date"]
    search_fields = ["vehicle__registration_number", "vendor__name"]


@admin.register(ExpenseHead)
class ExpenseHeadAdmin(admin.ModelAdmin):
    list_display = ["name", "group", "slug"]
    list_filter = ["group"]
    search_fields = ["name", "slug"]
