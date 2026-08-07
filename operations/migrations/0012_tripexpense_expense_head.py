import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('economics', '0005_seed_expense_heads'),
        ('operations', '0011_tripexpense_expense_tripexpense_fuel_log_and_more'),
    ]

    operations = [
        # No existing TripExpense rows at the time this was written - a
        # straight swap, no backfill migration needed (contrast with
        # economics.Expense.category -> expense_head, which had live data).
        migrations.RemoveField(
            model_name='tripexpense',
            name='category',
        ),
        migrations.AddField(
            model_name='tripexpense',
            name='expense_head',
            field=models.ForeignKey(
                default=None, on_delete=django.db.models.deletion.PROTECT,
                related_name='trip_expenses', to='economics.expensehead',
            ),
            preserve_default=False,
        ),
    ]
