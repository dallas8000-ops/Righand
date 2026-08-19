import csv
import uuid
from collections import defaultdict
from datetime import datetime, timedelta
from io import BytesIO

from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from api.jwt_auth import jwt_required
from api.models import Expense
from api.tier_guard import require_pro

SUPPORTED_CURRENCIES = {'USD', 'UGX', 'KES', 'RWF', 'EUR'}


def _currency_code(request):
    code = request.GET.get('currency', 'USD').upper()[:3]
    return code if code in SUPPORTED_CURRENCIES else 'USD'


def _format_money(value, currency_code, decimals=2):
    if value is None:
        return 'N/A'
    return f'{currency_code} {value:.{decimals}f}'


def _parse_date(value, default=None):
    if not value:
        return default
    return datetime.fromisoformat(value.replace('Z', '+00:00')[:10]).date()


def _period_range(period):
    end = timezone.localdate()
    if period == 'weekly':
        start = end - timedelta(days=6)
    else:
        start = end.replace(day=1)
    return start, end


def _user_expenses(user_id, start_date, end_date):
    query = Expense.objects.filter(user_id=user_id)
    if start_date:
        query = query.filter(expense_date__gte=start_date)
    if end_date:
        query = query.filter(expense_date__lte=end_date)
    return list(query.order_by('-expense_date'))


def _load_profit_summary(entry):
    deductions = (entry.fuel_cost_alloc or 0) + (entry.tolls_amount or 0)
    profit = entry.amount - deductions
    return {
        'id': entry.id,
        'description': entry.description,
        'rate': entry.amount,
        'miles': entry.miles,
        'deadheadMiles': entry.deadhead_miles,
        'fuelCostAlloc': entry.fuel_cost_alloc,
        'tollsAmount': entry.tolls_amount,
        'netLoadProfit': profit,
        'profitPerMile': (profit / entry.miles) if entry.miles else None,
    }


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

    fuel_entries = [e for e in expenses if e.category == 'fuel' and e.expense_type == 'expense']
    total_gallons = sum(e.gallons or 0 for e in fuel_entries)
    total_fuel_cost = sum(e.amount for e in fuel_entries)

    load_profits = [
        _load_profit_summary(entry)
        for entry in expenses
        if entry.category == 'load' and entry.expense_type == 'income'
    ]

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
        'loadSummaries': load_profits,
    }


@jwt_required
@require_http_methods(['GET'])
def get_metrics(request):
    try:
        user_id = request.righand_user_id
        start_date = _parse_date(request.GET.get('startDate'))
        end_date = _parse_date(request.GET.get('endDate'))
        period = request.GET.get('period')

        if period in ('weekly', 'monthly') and not start_date:
            start_date, end_date = _period_range(period)

        expenses = _user_expenses(user_id, start_date, end_date)
        metrics = _compute_metrics(expenses)
        metrics['startDate'] = start_date.isoformat() if start_date else None
        metrics['endDate'] = end_date.isoformat() if end_date else None
        return JsonResponse({'success': True, **metrics})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@jwt_required
@require_pro
@require_http_methods(['GET'])
def export_csv(request):
    try:
        user_id = request.righand_user_id
        start_date = _parse_date(request.GET.get('startDate'))
        end_date = _parse_date(request.GET.get('endDate'))
        period = request.GET.get('period', 'monthly')
        currency_code = _currency_code(request)

        if not start_date:
            start_date, end_date = _period_range(period)

        expenses = _user_expenses(user_id, start_date, end_date)
        output = BytesIO()
        writer = csv.writer(output)
        writer.writerow([
            'Date', 'Type', 'Category', 'Description', 'Currency', 'Amount',
            'Miles', 'Gallons', 'Odometer', 'Deadhead Miles',
            'Tolls', 'Fuel Cost Alloc', 'Notes',
        ])
        for e in expenses:
            writer.writerow([
                e.expense_date.isoformat(),
                e.expense_type,
                e.category,
                e.description,
                currency_code,
                f'{e.amount:.2f}',
                e.miles or '',
                e.gallons or '',
                e.odometer or '',
                e.deadhead_miles or '',
                e.tolls_amount or '',
                e.fuel_cost_alloc or '',
                e.notes or '',
            ])

        filename = f'righand-export-{start_date.isoformat()}-to-{end_date.isoformat()}.csv'
        response = HttpResponse(output.getvalue(), content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@jwt_required
@require_pro
@require_http_methods(['GET'])
def export_pdf(request):
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

        user_id = request.righand_user_id
        period = request.GET.get('period', 'monthly')
        currency_code = _currency_code(request)
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
            styles['Normal'],
        ))
        story.append(Spacer(1, 12))

        summary_data = [
            ['Metric', 'Value'],
            ['Total Income', _format_money(metrics['totalIncome'], currency_code)],
            ['Total Expenses', _format_money(metrics['totalExpenses'], currency_code)],
            ['Net Profit', _format_money(metrics['netProfit'], currency_code)],
            ['Profit Per Mile', _format_money(metrics['profitPerMile'], currency_code) if metrics['profitPerMile'] is not None else 'N/A'],
            ['Fuel Cost Per Mile', _format_money(metrics['fuelCostPerMile'], currency_code, 3) if metrics['fuelCostPerMile'] is not None else 'N/A'],
            ['Cost Per Gallon', _format_money(metrics['costPerGallon'], currency_code, 3) if metrics['costPerGallon'] is not None else 'N/A'],
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
                _format_money(e.amount, currency_code),
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
        filename = f'righand-{period}-report-{end_date.isoformat()}.pdf'
        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


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


@jwt_required
@require_http_methods(['GET'])
def weekly_summary(request):
    try:
        user_id = request.righand_user_id
        end = timezone.localdate()
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
                'entryCount': len(day_entries),
            })

        totals = _compute_metrics(expenses)
        return JsonResponse({
            'success': True,
            'startDate': start.isoformat(),
            'endDate': end.isoformat(),
            'days': days,
            'totals': totals,
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@jwt_required
@require_pro
@require_http_methods(['GET'])
def tax_quarterly(request):
    try:
        user_id = request.righand_user_id
        today = timezone.localdate()
        year = int(request.GET.get('year', today.year))
        quarter = int(request.GET.get('quarter', ((today.month - 1) // 3) + 1))
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
                'lineType': 'expense',
            })

        return JsonResponse({
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
            'scheduleCLines': schedule_c_lines,
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@jwt_required
@require_pro
@require_http_methods(['GET'])
def ifta_report(request):
    try:
        user_id = request.righand_user_id
        today = timezone.localdate()
        year = int(request.GET.get('year', today.year))
        quarter = int(request.GET.get('quarter', ((today.month - 1) // 3) + 1))
        quarter = max(1, min(4, quarter))
        start, end = _quarter_range(year, quarter)

        fuel_entries = Expense.objects.filter(
            user_id=user_id,
            category='fuel',
            expense_type='expense',
            expense_date__gte=start,
            expense_date__lte=end,
        )

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
                'avgPricePerGallon': round(data['cost'] / data['gallons'], 3) if data['gallons'] else None,
            }
            for code, data in sorted(by_state.items())
        ]

        total_gallons = sum(s['gallons'] for s in states) + unassigned['gallons']

        return JsonResponse({
            'success': True,
            'year': year,
            'quarter': quarter,
            'startDate': start.isoformat(),
            'endDate': end.isoformat(),
            'states': states,
            'unassigned': {
                'gallons': round(unassigned['gallons'], 2),
                'cost': round(unassigned['cost'], 2),
                'stops': unassigned['stops'],
            },
            'totalGallons': round(total_gallons, 2),
            'totalCost': round(sum(s['cost'] for s in states) + unassigned['cost'], 2),
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
