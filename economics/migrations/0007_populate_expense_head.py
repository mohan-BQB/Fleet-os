from django.db import migrations

from economics.expense_heads import LEGACY_EXPENSE_CATEGORY_TO_SLUG, TYRE_SERVICE_TYPE_TO_SLUG


def populate(apps, schema_editor):
    Expense = apps.get_model('economics', 'Expense')
    ExpenseHead = apps.get_model('economics', 'ExpenseHead')
    TyreService = apps.get_model('tyres', 'TyreService')

    heads_by_org_slug = {
        (h.organization_id, h.slug): h for h in ExpenseHead.objects.all()
    }

    for expense in Expense.objects.all():
        slug = LEGACY_EXPENSE_CATEGORY_TO_SLUG.get(expense.category, 'misc')

        if expense.category == 'tyres':
            service = TyreService.objects.filter(expense_id=expense.id).first()
            if service is not None:
                slug = TYRE_SERVICE_TYPE_TO_SLUG.get(service.service_type, 'puncture_repair')
            elif TyreService.objects.filter(tyre_expense_id=expense.id).exists():
                # A new-tyre purchase, not a service event - same bucket as
                # any other physical-part purchase.
                slug = 'spare_parts'

        head = heads_by_org_slug.get((expense.organization_id, slug))
        if head is None:
            # Shouldn't happen (every org gets every seed head) - fall back
            # to whatever this org has under "misc" rather than leaving a
            # row unmigrated.
            head = heads_by_org_slug.get((expense.organization_id, 'misc'))
        expense.expense_head_id = head.id
        expense.save(update_fields=['expense_head'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('economics', '0006_expense_expense_head'),
        ('tyres', '0011_tyreservice_tyre_expense_tyreservice_tyre_source_and_more'),
    ]

    operations = [
        migrations.RunPython(populate, noop_reverse),
    ]
