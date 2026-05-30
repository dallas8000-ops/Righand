from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Expense
from datetime import datetime, timedelta
from collections import defaultdict
from collections import defaultdict
from io import BytesIO
import csv
import uuid

reports_bp = Blueprint('reports', __name__, url_prefix='/api/reports')


def _parse_date(value, default=None):
    if not value:
        return default
    return datetime.fromisoformat(value.replace('Z', '+00:00')[:10]).date()


def _period_range(period):
    end = datetime.utcnow().date()
    if period == 'weekly':
        start = end - timedelta(days=6)
    else:
        start = end.replace(day=1)
    return start, end


def _user_expenses(user_id, start_date, end_date):
    query = Expense.query.filter_by(user_id=user_id)
    if start_date:
        query = query.filter(Expense.expense_date >= start_date)
    if end_date:
        query = query.filter(Expense.expense_date <= end_date)
    return query.order_by(Expense.expense_date.desc()).all()


def _compute_metrics(expenses):
    total_income = sum(e.amount for e in expenses if e.expense_type == 'income')
    total_expenses = sum(e.amount for e in expenses if e.expense_type == 'expense')
    net_profit = total_income - total_expenses

    loaded_miles = sum(
        e.miles or 0 for e in expenses
        if e.expense_type == 'income' and (e.miles or 0) > 0
    )
    all_miles = sum(e.miles or 0 for e in expenses if (e.miles or 0) > 0)
    miles_basis = loaded_miles or all_miles

    fuel_entries = [
        e for e in expenses
        if e.category == 'fuel' and e.expense_type == 'expense'
    ]
    total_gallons = sum(e.gallons or 0 for e in fuel_entries)
    total_fuel_cost = sum(e.amount for e in fuel_entries)

    load_entries = [
        e for e in expenses
        if e.category == 'load' and e.expense_type == 'income'
    ]
    load_profits = []
    for entry in load_entries:
        deductions = (entry.fuel_cost_alloc or 0) + (entry.tolls_amount or 0)
        profit = entry.amount - deductions
        load_profits.append({
            'id': entry.id,
            'description': entry.description,
            'rate': entry.amount,
            'miles': entry.miles,
            'deadheadMiles': entry.deadhead_miles,
            'fuelCostAlloc': entry.fuel_cost_alloc,
            'tollsAmount': entry.tolls_amount,
            'netLoadProfit': profit,
            'profitPerMile': (profit / entry.miles) if entry.miles else None
        })

    return {
        'totalIncome': round(total_income, 2),
        'totalExpenses': round(total_expenses, 2),
        'netProfit': round(net_profit, 2),
        'loadedMiles': round(loaded_miles, 1),
        'totalMiles': round(all_miles, 1),
        'profitPerMile': round(net_profit / miles_basis, 2) if miles_basis else None,
        'totalGallons': round(total_gallons, 2),
        'totalFuelCost': round(total_fuel_cost, 2),
        'costPerGallon': round(total_fuel_cost / total_gallons, 3) if total_gallons else None,
        'fuelCostPerMile': round(total_fuel_cost / miles_basis, 3) if miles_basis else None,
        'loadSummaries': load_profits
    }


@reports_bp.route('/metrics', methods=['GET'])
@jwt_required()
def get_metrics():
    try:
        user_id = get_jwt_identity()
        start_date = _parse_date(request.args.get('startDate'))
        end_date = _parse_date(request.args.get('endDate'))
        period = request.args.get('period')

        if period in ('weekly', 'monthly') and not start_date:
            start_date, end_date = _period_range(period)

        expenses = _user_expenses(user_id, start_date, end_date)
        metrics = _compute_metrics(expenses)
        metrics['startDate'] = start_date.isoformat() if start_date else None
        metrics['endDate'] = end_date.isoformat() if end_date else None

        return jsonify({'success': True, **metrics}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@reports_bp.route('/export/csv', methods=['GET'])
@jwt_required()
def export_csv():
    try:
        user_id = get_jwt_identity()
        start_date = _parse_date(request.args.get('startDate'))
        end_date = _parse_date(request.args.get('endDate'))
        period = request.args.get('period', 'monthly')

        if not start_date:
            start_date, end_date = _period_range(period)

        expenses = _user_expenses(user_id, start_date, end_date)
        output = BytesIO()
        writer = csv.writer(output)
        writer.writerow([
            'Date', 'Type', 'Category', 'Description', 'Amount',
            'Miles', 'Gallons', 'Odometer', 'Deadhead Miles',
            'Tolls', 'Fuel Cost Alloc', 'Notes'
        ])
        for e in expenses:
            writer.writerow([
                e.expense_date.isoformat(),
                e.expense_type,
                e.category,
                e.description,
                f'{e.amount:.2f}',
                e.miles or '',
                e.gallons or '',
                e.odometer or '',
                e.deadhead_miles or '',
                e.tolls_amount or '',
                e.fuel_cost_alloc or '',
                e.notes or ''
            ])

        output.seek(0)
        filename = f'righand-export-{start_date.isoformat()}-to-{end_date.isoformat()}.csv'
        return send_file(
            output,
            mimetype='text/csv',
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@reports_bp.route('/export/pdf', methods=['GET'])
@jwt_required()
def export_pdf():
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

        user_id = get_jwt_identity()
        period = request.args.get('period', 'monthly')
        start_date, end_date = _period_range(period)

        expenses = _user_expenses(user_id, start_date, end_date)
        metrics = _compute_metrics(expenses)

        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()
        story = []

        title = 'Weekly' if period == 'weekly' else 'Monthly'
        story.append(Paragraph(f'RigHand AI — {title} Profit Report', styles['Title']))
        story.append(Paragraph(
            f'Period: {start_date.isoformat()} to {end_date.isoformat()}',
            styles['Normal']
        ))
        story.append(Spacer(1, 12))

        summary_data = [
            ['Metric', 'Value'],
            ['Total Income', f"${metrics['totalIncome']:.2f}"],
            ['Total Expenses', f"${metrics['totalExpenses']:.2f}"],
            ['Net Profit', f"${metrics['netProfit']:.2f}"],
            ['Profit Per Mile', f"${metrics['profitPerMile']:.2f}" if metrics['profitPerMile'] is not None else 'N/A'],
            ['Fuel Cost Per Mile', f"${metrics['fuelCostPerMile']:.3f}" if metrics['fuelCostPerMile'] is not None else 'N/A'],
            ['Cost Per Gallon', f"${metrics['costPerGallon']:.3f}" if metrics['costPerGallon'] is not None else 'N/A'],
            ['Loaded Miles', str(metrics['loadedMiles'])],
            ['Total Gallons', str(metrics['totalGallons'])],
        ]
        summary_table = Table(summary_data, colWidths=[220, 220])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#667eea')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ]))
        story.append(summary_table)
        story.append(Spacer(1, 16))
        story.append(Paragraph('Recent Entries', styles['Heading2']))

        rows = [['Date', 'Type', 'Category', 'Description', 'Amount']]
        for e in expenses[:40]:
            rows.append([
                e.expense_date.strftime('%m/%d'),
                e.expense_type,
                e.category,
                e.description[:28],
                f'${e.amount:.2f}'
            ])
        entry_table = Table(rows, colWidths=[55, 55, 70, 180, 60])
        entry_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#764ba2')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
        ]))
        story.append(entry_table)

        doc.build(story)
        buffer.seek(0)
        filename = f'righand-{period}-report-{end_date.isoformat()}.pdf'
        return send_file(
            buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _quarter_range(year, quarter):
    starts = {1: (1, 1), 2: (4, 1), 3: (7, 1), 4: (10, 1)}
    month, day = starts[quarter]
    start = datetime(year, month, day).date()
    if quarter == 4:
        end = datetime(year, 12, 31).date()
    else:
        next_month, next_day = starts[quarter + 1]
        end = datetime(year, next_month, next_day).date() - timedelta(days=1)
    return start, end


@reports_bp.route('/weekly-summary', methods=['GET'])
@jwt_required()
def weekly_summary():
    """Daily income/expense breakdown for the last 7 days."""
    try:
        user_id = get_jwt_identity()
        end = datetime.utcnow().date()
        start = end - timedelta(days=6)
        expenses = _user_expenses(user_id, start, end)

        days = []
        for i in range(7):
            day = start + timedelta(days=i)
            day_entries = [e for e in expenses if e.expense_date == day]
            income = sum(e.amount for e in day_entries if e.expense_type == 'income')
            expense_total = sum(e.amount for e in day_entries if e.expense_type == 'expense')
            days.append({
                'date': day.isoformat(),
                'label': day.strftime('%a'),
                'income': round(income, 2),
                'expenses': round(expense_total, 2),
                'net': round(income - expense_total, 2),
                'entryCount': len(day_entries)
            })

        totals = _compute_metrics(expenses)
        return jsonify({
            'success': True,
            'startDate': start.isoformat(),
            'endDate': end.isoformat(),
            'days': days,
            'totals': totals
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@reports_bp.route('/tax/quarterly', methods=['GET'])
@jwt_required()
def tax_quarterly():
    """Schedule C-style quarterly breakdown by category."""
    try:
        user_id = get_jwt_identity()
        year = int(request.args.get('year', datetime.utcnow().year))
        quarter = int(request.args.get('quarter', ((datetime.utcnow().month - 1) // 3) + 1))
        quarter = max(1, min(4, quarter))
        start, end = _quarter_range(year, quarter)
        expenses = _user_expenses(user_id, start, end)

        income_by_cat = defaultdict(float)
        expense_by_cat = defaultdict(float)
        for e in expenses:
            if e.expense_type == 'income':
                income_by_cat[e.category] += e.amount
            else:
                expense_by_cat[e.category] += e.amount

        total_income = sum(income_by_cat.values())
        total_expenses = sum(expense_by_cat.values())

        schedule_c_lines = []
        for cat, amount in sorted(expense_by_cat.items(), key=lambda x: -x[1]):
            schedule_c_lines.append({
                'category': cat,
                'label': cat.replace('-', ' ').title(),
                'amount': round(amount, 2),
                'lineType': 'expense'
            })

        return jsonify({
            'success': True,
            'year': year,
            'quarter': quarter,
            'startDate': start.isoformat(),
            'endDate': end.isoformat(),
            'totalIncome': round(total_income, 2),
            'totalExpenses': round(total_expenses, 2),
            'netProfit': round(total_income - total_expenses, 2),
            'incomeByCategory': {k: round(v, 2) for k, v in income_by_cat.items()},
            'expenseByCategory': {k: round(v, 2) for k, v in expense_by_cat.items()},
            'scheduleCLines': schedule_c_lines
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@reports_bp.route('/ifta', methods=['GET'])
@jwt_required()
def ifta_report():
    """IFTA fuel tax helper — gallons and cost by state."""
    try:
        user_id = get_jwt_identity()
        year = int(request.args.get('year', datetime.utcnow().year))
        quarter = int(request.args.get('quarter', ((datetime.utcnow().month - 1) // 3) + 1))
        quarter = max(1, min(4, quarter))
        start, end = _quarter_range(year, quarter)

        fuel_entries = Expense.query.filter_by(
            user_id=user_id,
            category='fuel',
            expense_type='expense'
        ).filter(
            Expense.expense_date >= start,
            Expense.expense_date <= end
        ).all()

        by_state = defaultdict(lambda: {'gallons': 0.0, 'cost': 0.0, 'stops': 0})
        unassigned = {'gallons': 0.0, 'cost': 0.0, 'stops': 0}

        for entry in fuel_entries:
            gallons = entry.gallons or 0
            cost = entry.amount or 0
            state = entry.fuel_state
            if state:
                by_state[state]['gallons'] += gallons
                by_state[state]['cost'] += cost
                by_state[state]['stops'] += 1
            else:
                unassigned['gallons'] += gallons
                unassigned['cost'] += cost
                unassigned['stops'] += 1

        states = [
            {
                'state': code,
                'gallons': round(data['gallons'], 2),
                'cost': round(data['cost'], 2),
                'stops': data['stops'],
                'avgPricePerGallon': round(data['cost'] / data['gallons'], 3) if data['gallons'] else None
            }
            for code, data in sorted(by_state.items())
        ]

        total_gallons = sum(s['gallons'] for s in states) + unassigned['gallons']

        return jsonify({
            'success': True,
            'year': year,
            'quarter': quarter,
            'startDate': start.isoformat(),
            'endDate': end.isoformat(),
            'states': states,
            'unassigned': {
                'gallons': round(unassigned['gallons'], 2),
                'cost': round(unassigned['cost'], 2),
                'stops': unassigned['stops']
            },
            'totalGallons': round(total_gallons, 2),
            'totalCost': round(sum(s['cost'] for s in states) + unassigned['cost'], 2)
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
