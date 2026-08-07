import django.db.models.deletion
from django.db import migrations, models


def populate_vendor_from_text(apps, schema_editor):
    """Turn each distinct free-text vendor name (per org) into a real Vendor
    record (type 'other' - there's no way to guess a real type from a label
    alone) and point the expense at it, so existing data isn't lost when the
    field becomes a foreign key."""
    Expense = apps.get_model('economics', 'Expense')
    Vendor = apps.get_model('vendors', 'Vendor')

    cache = {}
    for expense in Expense.objects.exclude(vendor_name=''):
        name = expense.vendor_name.strip()
        if not name:
            continue
        key = (expense.organization_id, name)
        vendor_id = cache.get(key)
        if vendor_id is None:
            vendor, _ = Vendor.objects.get_or_create(
                organization_id=expense.organization_id,
                name=name,
                defaults={"vendor_type": "other"},
            )
            vendor_id = vendor.id
            cache[key] = vendor_id
        expense.vendor_id = vendor_id
        expense.save(update_fields=["vendor"])


class Migration(migrations.Migration):

    dependencies = [
        ('economics', '0001_initial'),
        ('vendors', '0001_initial'),
    ]

    operations = [
        migrations.RenameField(
            model_name='expense',
            old_name='vendor',
            new_name='vendor_name',
        ),
        migrations.AddField(
            model_name='expense',
            name='vendor',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                related_name='expenses', to='vendors.vendor',
            ),
        ),
        migrations.RunPython(populate_vendor_from_text, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='expense',
            name='vendor_name',
        ),
    ]
