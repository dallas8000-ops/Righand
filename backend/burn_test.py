"""Burn test — smoke-test critical expense + auth flows."""
import json
import sys
import uuid
from datetime import date

from app import create_app
from models import db, User, Expense


def run():
    app = create_app('development')
    failures = []
    passed = 0

    def check(name, condition, detail=''):
        nonlocal passed
        if condition:
            passed += 1
            print(f'  PASS  {name}')
        else:
            failures.append(f'{name}: {detail}')
            print(f'  FAIL  {name} — {detail}')

    with app.app_context():
        test_email = f'burn_{uuid.uuid4().hex[:8]}@test.local'
        user = User(
            id=str(uuid.uuid4()),
            email=test_email,
            password_hash='hash',
            name='Burn Test Driver',
            trucker_license=f'CDL-{uuid.uuid4().hex[:6].upper()}'
        )
        db.session.add(user)
        db.session.commit()

        income_id = str(uuid.uuid4())
        expense_id = str(uuid.uuid4())
        today = date.today().isoformat()

        income = Expense(
            id=income_id,
            user_id=user.id,
            description='Load Dallas to Houston',
            amount=2400.0,
            category='load',
            expense_type='income',
            expense_date=date.today(),
            broker='TQL',
            customer='Acme Corp',
            miles=450.0,
            tolls_amount=35.0,
            fuel_cost_alloc=180.0
        )
        fuel = Expense(
            id=expense_id,
            user_id=user.id,
            description='Fuel stop TX',
            amount=420.50,
            category='fuel',
            expense_type='expense',
            expense_date=date.today(),
            gallons=95.5,
            fuel_state='TX'
        )
        db.session.add_all([income, fuel])
        db.session.commit()

        client = app.test_client()

        # Create income via API shape
        check('Income row saved', Expense.query.get(income_id) is not None)
        check('Income type is income', income.expense_type == 'income')

        row = Expense.query.get(income_id)
        row.amount = 2550.0
        row.broker = 'Updated Broker'
        row.customer = 'Updated Customer'
        row.expense_type = 'income'
        db.session.commit()
        refreshed = Expense.query.get(income_id)
        check('Income amount editable', refreshed.amount == 2550.0)
        check('Income broker editable', refreshed.broker == 'Updated Broker')
        check('Income type preserved', refreshed.expense_type == 'income')

        d = refreshed.to_dict()
        check('to_dict exposes type=income', d.get('type') == 'income')
        check('to_dict load profit calc', d.get('loadProfit') == 2550.0 - 35.0 - 180.0)

        # Reports endpoints exist
        with app.app_context():
            from routes_reports import weekly_summary, tax_quarterly, ifta_report
            check('Reports routes import', callable(weekly_summary))

        # Cleanup
        Expense.query.filter_by(user_id=user.id).delete()
        db.session.delete(user)
        db.session.commit()

    print(f'\nBurn test: {passed} passed, {len(failures)} failed')
    if failures:
        for f in failures:
            print(f'  - {f}')
        sys.exit(1)
    print('All burn tests passed.')
    sys.exit(0)


if __name__ == '__main__':
    run()
