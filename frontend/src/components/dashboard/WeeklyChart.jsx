import React from 'react';
import { formatCurrency } from '../../utils/currency';

const defaultFormatMoney = (value) => formatCurrency(value, 'USD', { maximumFractionDigits: 0 });

const WeeklyChart = ({ days, title = 'Weekly Summary', formatMoney = defaultFormatMoney }) => {
  if (!days?.length) return null;
  const maxVal = Math.max(...days.map(d => Math.max(d.income, d.expenses, Math.abs(d.net))), 1);

  return (
    <section className="weekly-chart-section">
      <h3>{title}</h3>
      <div className="weekly-chart">
        {days.map(day => (
          <div key={day.date} className="weekly-chart-col">
            <div className="weekly-bars">
              <div
                className="weekly-bar income-bar"
                style={{ height: `${(day.income / maxVal) * 100}%` }}
                title={`Income: ${formatMoney(day.income)}`}
              />
              <div
                className="weekly-bar expense-bar"
                style={{ height: `${(day.expenses / maxVal) * 100}%` }}
                title={`Expenses: ${formatMoney(day.expenses)}`}
              />
            </div>
            <span className={day.net >= 0 ? 'weekly-net positive' : 'weekly-net negative'}>
              {day.net >= 0 ? '+' : ''}{formatMoney(day.net)}
            </span>
            <span className="weekly-label">{day.label}</span>
          </div>
        ))}
      </div>
      <div className="weekly-legend">
        <span><i className="legend-dot income" /> Income</span>
        <span><i className="legend-dot expense" /> Expenses</span>
      </div>
    </section>
  );
};

export default WeeklyChart;
