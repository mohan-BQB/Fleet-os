import uuid

from django.db import migrations

from economics.expense_heads import SEED_HEADS


def seed_heads(apps, schema_editor):
    Organization = apps.get_model('core', 'Organization')
    ExpenseHead = apps.get_model('economics', 'ExpenseHead')

    for org in Organization.objects.all():
        for slug, name, group in SEED_HEADS:
            ExpenseHead.objects.get_or_create(
                organization=org, slug=slug,
                defaults={'id': uuid.uuid4(), 'name': name, 'group': group},
            )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('economics', '0004_expensehead'),
    ]

    operations = [
        migrations.RunPython(seed_heads, noop_reverse),
    ]
