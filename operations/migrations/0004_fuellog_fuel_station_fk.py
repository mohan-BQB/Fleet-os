import django.db.models.deletion
from django.db import migrations, models


def populate_vendor_from_text(apps, schema_editor):
    """Same idea as economics.0002: turn each distinct free-text fuel
    station name (per org) into a real Vendor (type 'fuel_station', since we
    know exactly what kind of vendor this field always meant) and point the
    fuel log at it."""
    FuelLog = apps.get_model('operations', 'FuelLog')
    Vendor = apps.get_model('vendors', 'Vendor')

    cache = {}
    for log in FuelLog.objects.exclude(fuel_station_name=''):
        name = log.fuel_station_name.strip()
        if not name:
            continue
        key = (log.organization_id, name)
        vendor_id = cache.get(key)
        if vendor_id is None:
            vendor, _ = Vendor.objects.get_or_create(
                organization_id=log.organization_id,
                name=name,
                defaults={"vendor_type": "fuel_station"},
            )
            vendor_id = vendor.id
            cache[key] = vendor_id
        log.fuel_station_id = vendor_id
        log.save(update_fields=["fuel_station"])


class Migration(migrations.Migration):

    dependencies = [
        ('operations', '0003_driverledgerentry_payment_mode_and_more'),
        ('vendors', '0001_initial'),
    ]

    operations = [
        migrations.RenameField(
            model_name='fuellog',
            old_name='fuel_station',
            new_name='fuel_station_name',
        ),
        migrations.AddField(
            model_name='fuellog',
            name='fuel_station',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                related_name='fuel_logs', to='vendors.vendor',
            ),
        ),
        migrations.RunPython(populate_vendor_from_text, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='fuellog',
            name='fuel_station_name',
        ),
    ]
