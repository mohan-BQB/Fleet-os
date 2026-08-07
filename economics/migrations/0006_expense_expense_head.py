import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('economics', '0005_seed_expense_heads'),
    ]

    operations = [
        migrations.AddField(
            model_name='expense',
            name='expense_head',
            field=models.ForeignKey(
                null=True, blank=True, on_delete=django.db.models.deletion.PROTECT,
                related_name='expenses', to='economics.expensehead',
            ),
        ),
    ]
