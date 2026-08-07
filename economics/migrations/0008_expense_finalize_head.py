import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('economics', '0007_populate_expense_head'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='expense',
            name='category',
        ),
        migrations.AlterField(
            model_name='expense',
            name='expense_head',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='expenses', to='economics.expensehead',
            ),
        ),
    ]
