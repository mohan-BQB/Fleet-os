import django.db.models.deletion
from django.db import migrations, models


def populate_vendor_from_text(apps, schema_editor):
    MaintenanceLog = apps.get_model('maintenance', 'MaintenanceLog')
    Vendor = apps.get_model('vendors', 'Vendor')

    cache = {}
    for log in MaintenanceLog.objects.exclude(vendor_name=''):
        name = log.vendor_name.strip()
        if not name:
            continue
        key = (log.organization_id, name)
        vendor_id = cache.get(key)
        if vendor_id is None:
            vendor, _ = Vendor.objects.get_or_create(
                organization_id=log.organization_id,
                name=name,
                defaults={"vendor_type": "garage"},
            )
            vendor_id = vendor.id
            cache[key] = vendor_id
        log.vendor_id = vendor_id
        log.save(update_fields=["vendor"])


class Migration(migrations.Migration):

    dependencies = [
        ('maintenance', '0001_initial'),
        ('vendors', '0001_initial'),
    ]

    operations = [
        migrations.RenameField(
            model_name='maintenancelog',
            old_name='vendor',
            new_name='vendor_name',
        ),
        migrations.AddField(
            model_name='maintenancelog',
            name='vendor',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                related_name='maintenance_logs', to='vendors.vendor',
            ),
        ),
        migrations.RunPython(populate_vendor_from_text, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='maintenancelog',
            name='vendor_name',
        ),
    ]
