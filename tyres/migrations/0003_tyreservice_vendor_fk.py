import django.db.models.deletion
from django.db import migrations, models


def populate_vendor_from_text(apps, schema_editor):
    TyreService = apps.get_model('tyres', 'TyreService')
    Vendor = apps.get_model('vendors', 'Vendor')

    cache = {}
    for service in TyreService.objects.exclude(vendor_name=''):
        name = service.vendor_name.strip()
        if not name:
            continue
        key = (service.organization_id, name)
        vendor_id = cache.get(key)
        if vendor_id is None:
            vendor, _ = Vendor.objects.get_or_create(
                organization_id=service.organization_id,
                name=name,
                defaults={"vendor_type": "tyre_shop"},
            )
            vendor_id = vendor.id
            cache[key] = vendor_id
        service.vendor_id = vendor_id
        service.save(update_fields=["vendor"])


class Migration(migrations.Migration):

    dependencies = [
        ('tyres', '0002_tyreservice_new_position_tyreservice_tread_depth_in'),
        ('vendors', '0001_initial'),
    ]

    operations = [
        migrations.RenameField(
            model_name='tyreservice',
            old_name='vendor',
            new_name='vendor_name',
        ),
        migrations.AddField(
            model_name='tyreservice',
            name='vendor',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                related_name='tyre_services', to='vendors.vendor',
            ),
        ),
        migrations.RunPython(populate_vendor_from_text, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='tyreservice',
            name='vendor_name',
        ),
    ]
