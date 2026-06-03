import uuid
from datetime import datetime

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.jwt_auth import jwt_required
from api.models import Expense, SyncLog, User
from api.utils import parse_json


def _apply_expense_fields(expense, data):
    optional_float_fields = {
        'miles': 'miles',
        'gallons': 'gallons',
        'odometer': 'odometer',
        'deadheadMiles': 'deadhead_miles',
        'deadhead_miles': 'deadhead_miles',
        'tollsAmount': 'tolls_amount',
        'tolls_amount': 'tolls_amount',
        'fuelCostAlloc': 'fuel_cost_alloc',
        'fuel_cost_alloc': 'fuel_cost_alloc',
    }
    for key, attr in optional_float_fields.items():
        if key in data:
            value = data.get(key)
            setattr(expense, attr, float(value) if value not in (None, '') else None)

    if 'receiptUrl' in data or 'receipt_url' in data:
        expense.receipt_url = data.get('receiptUrl') or data.get('receipt_url')
    if 'notes' in data:
        expense.notes = data.get('notes')
    if 'broker' in data:
        expense.broker = data.get('broker') or None
    if 'customer' in data:
        expense.customer = data.get('customer') or None
    if 'fuelState' in data or 'fuel_state' in data:
        state = data.get('fuelState') or data.get('fuel_state')
        expense.fuel_state = state.upper()[:2] if state else None


@jwt_required
@require_http_methods(['POST'])
def create_expense(request):
    try:
        current_user_id = request.righand_user_id
        data = parse_json(request)

        if not User.objects.filter(pk=current_user_id).exists():
            return JsonResponse({'error': 'User not found'}, status=404)

        expense_id = str(uuid.uuid4())
        expense = Expense(
            id=expense_id,
            user_id=current_user_id,
            description=data.get('description'),
            amount=float(data.get('amount', 0)),
            category=data.get('category', 'other'),
            expense_type=data.get('type', 'expense'),
            expense_date=datetime.fromisoformat(
                data.get('date', datetime.now().isoformat())
            ).date(),
            notes=data.get('notes'),
            is_synced=True,
        )
        _apply_expense_fields(expense, data)
        expense.save()

        SyncLog(
            id=str(uuid.uuid4()),
            user_id=current_user_id,
            action='CREATE',
            entity_type='EXPENSE',
            entity_id=expense_id,
            status='success',
        ).save()

        return JsonResponse({
            'success': True,
            'id': expense_id,
            'expense': expense.to_dict(),
        }, status=201)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@jwt_required
@require_http_methods(['GET'])
def get_user_expenses(request, user_id):
    try:
        current_user_id = request.righand_user_id
        if current_user_id != user_id:
            return JsonResponse({'error': 'Unauthorized'}, status=403)

        start_date = request.GET.get('startDate')
        end_date = request.GET.get('endDate')

        query = Expense.objects.filter(user_id=user_id)
        if start_date:
            query = query.filter(expense_date__gte=datetime.fromisoformat(start_date).date())
        if end_date:
            query = query.filter(expense_date__lte=datetime.fromisoformat(end_date).date())

        expenses = query.order_by('-expense_date')
        return JsonResponse({
            'success': True,
            'expenses': [e.to_dict() for e in expenses],
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@jwt_required
def expense_detail(request, expense_id):
    if request.method == 'PUT':
        return update_expense(request, expense_id)
    if request.method == 'DELETE':
        return delete_expense(request, expense_id)
    return JsonResponse({'error': 'Method not allowed'}, status=405)


@jwt_required
@require_http_methods(['PUT'])
def update_expense(request, expense_id):
    try:
        current_user_id = request.righand_user_id
        expense = Expense.objects.filter(pk=expense_id).first()
        if not expense:
            return JsonResponse({'error': 'Expense not found'}, status=404)
        if expense.user_id != current_user_id:
            return JsonResponse({'error': 'Unauthorized'}, status=403)

        data = parse_json(request)
        if 'description' in data:
            expense.description = data['description']
        if 'amount' in data:
            expense.amount = float(data['amount'])
        if 'category' in data:
            expense.category = data['category']
        if 'type' in data or 'expense_type' in data:
            expense.expense_type = data.get('type') or data.get('expense_type')
        if 'date' in data:
            expense.expense_date = datetime.fromisoformat(data['date']).date()
        if 'notes' in data:
            expense.notes = data['notes']

        _apply_expense_fields(expense, data)
        expense.save()

        SyncLog(
            id=str(uuid.uuid4()),
            user_id=current_user_id,
            action='UPDATE',
            entity_type='EXPENSE',
            entity_id=expense_id,
            status='success',
        ).save()

        return JsonResponse({'success': True, 'expense': expense.to_dict()})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@jwt_required
@require_http_methods(['DELETE'])
def delete_expense(request, expense_id):
    try:
        current_user_id = request.righand_user_id
        expense = Expense.objects.filter(pk=expense_id).first()
        if not expense:
            return JsonResponse({'error': 'Expense not found'}, status=404)
        if expense.user_id != current_user_id:
            return JsonResponse({'error': 'Unauthorized'}, status=403)

        SyncLog(
            id=str(uuid.uuid4()),
            user_id=current_user_id,
            action='DELETE',
            entity_type='EXPENSE',
            entity_id=expense_id,
            status='success',
        ).save()
        expense.delete()

        return JsonResponse({'success': True, 'message': 'Expense deleted'})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@jwt_required
@require_http_methods(['GET'])
def calculate_profit(request):
    try:
        current_user_id = request.righand_user_id
        start_date = request.GET.get('startDate')
        end_date = request.GET.get('endDate')

        query = Expense.objects.filter(user_id=current_user_id)
        if start_date:
            query = query.filter(expense_date__gte=datetime.fromisoformat(start_date).date())
        if end_date:
            query = query.filter(expense_date__lte=datetime.fromisoformat(end_date).date())

        expenses = list(query)
        total_income = sum(e.amount for e in expenses if e.expense_type == 'income')
        total_expenses = sum(e.amount for e in expenses if e.expense_type == 'expense')

        return JsonResponse({
            'success': True,
            'totalIncome': total_income,
            'totalExpenses': total_expenses,
            'netProfit': total_income - total_expenses,
            'startDate': start_date,
            'endDate': end_date,
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
