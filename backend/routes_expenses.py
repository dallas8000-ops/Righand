from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Expense, User, SyncLog
from datetime import datetime, timedelta
import uuid

expenses_bp = Blueprint('expenses', __name__, url_prefix='/api/expenses')


def _apply_expense_fields(expense, data):
    """Apply optional Pro-tier fields from request payload."""
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


@expenses_bp.route('', methods=['POST'])
@jwt_required()
def create_expense():
    """Create a new expense entry"""
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json()
        
        # Validate user
        user = User.query.get(current_user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Create expense
        expense_id = str(uuid.uuid4())
        expense = Expense(
            id=expense_id,
            user_id=current_user_id,
            description=data.get('description'),
            amount=float(data.get('amount', 0)),
            category=data.get('category', 'other'),
            expense_type=data.get('type', 'expense'),
            expense_date=datetime.fromisoformat(data.get('date', datetime.now().isoformat())).date(),
            notes=data.get('notes'),
            is_synced=True
        )
        _apply_expense_fields(expense, data)
        
        db.session.add(expense)
        
        # Log sync
        sync_log = SyncLog(
            id=str(uuid.uuid4()),
            user_id=current_user_id,
            action='CREATE',
            entity_type='EXPENSE',
            entity_id=expense_id,
            status='success'
        )
        db.session.add(sync_log)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'id': expense_id,
            'expense': expense.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@expenses_bp.route('/user/<user_id>', methods=['GET'])
@jwt_required()
def get_user_expenses(user_id):
    """Get all expenses for a user"""
    try:
        current_user_id = get_jwt_identity()
        
        # Users can only view their own expenses
        if current_user_id != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Get optional date range filters
        start_date = request.args.get('startDate')
        end_date = request.args.get('endDate')
        
        query = Expense.query.filter_by(user_id=user_id)
        
        if start_date:
            start = datetime.fromisoformat(start_date).date()
            query = query.filter(Expense.expense_date >= start)
        
        if end_date:
            end = datetime.fromisoformat(end_date).date()
            query = query.filter(Expense.expense_date <= end)
        
        expenses = query.order_by(Expense.expense_date.desc()).all()
        
        return jsonify({
            'success': True,
            'expenses': [e.to_dict() for e in expenses]
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@expenses_bp.route('/<expense_id>', methods=['PUT'])
@jwt_required()
def update_expense(expense_id):
    """Update an expense entry"""
    try:
        current_user_id = get_jwt_identity()
        expense = Expense.query.get(expense_id)
        
        if not expense:
            return jsonify({'error': 'Expense not found'}), 404
        
        if expense.user_id != current_user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        data = request.get_json()
        
        # Update fields
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
        
        expense.updated_at = datetime.utcnow()
        
        # Log sync
        sync_log = SyncLog(
            id=str(uuid.uuid4()),
            user_id=current_user_id,
            action='UPDATE',
            entity_type='EXPENSE',
            entity_id=expense_id,
            status='success'
        )
        db.session.add(sync_log)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'expense': expense.to_dict()
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@expenses_bp.route('/<expense_id>', methods=['DELETE'])
@jwt_required()
def delete_expense(expense_id):
    """Delete an expense entry"""
    try:
        current_user_id = get_jwt_identity()
        expense = Expense.query.get(expense_id)
        
        if not expense:
            return jsonify({'error': 'Expense not found'}), 404
        
        if expense.user_id != current_user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Log sync before deletion
        sync_log = SyncLog(
            id=str(uuid.uuid4()),
            user_id=current_user_id,
            action='DELETE',
            entity_type='EXPENSE',
            entity_id=expense_id,
            status='success'
        )
        db.session.add(sync_log)
        
        db.session.delete(expense)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Expense deleted'
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@expenses_bp.route('/profit', methods=['GET'])
@jwt_required()
def calculate_profit():
    """Calculate net profit for a date range"""
    try:
        current_user_id = get_jwt_identity()
        
        start_date = request.args.get('startDate')
        end_date = request.args.get('endDate')
        
        query = Expense.query.filter_by(user_id=current_user_id)
        
        if start_date:
            start = datetime.fromisoformat(start_date).date()
            query = query.filter(Expense.expense_date >= start)
        
        if end_date:
            end = datetime.fromisoformat(end_date).date()
            query = query.filter(Expense.expense_date <= end)
        
        expenses = query.all()
        
        total_income = sum(e.amount for e in expenses if e.expense_type == 'income')
        total_expenses = sum(e.amount for e in expenses if e.expense_type == 'expense')
        net_profit = total_income - total_expenses
        
        return jsonify({
            'success': True,
            'totalIncome': total_income,
            'totalExpenses': total_expenses,
            'netProfit': net_profit,
            'startDate': start_date,
            'endDate': end_date
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
