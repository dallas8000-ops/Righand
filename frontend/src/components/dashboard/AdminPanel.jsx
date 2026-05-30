import React, { useState, useEffect } from 'react';

const formatMoney = (v) => `$${Number(v || 0).toFixed(2)}`;

const AdminPanel = ({
  expenses,
  openingIncome,
  onSaveOpeningIncome,
  onEdit,
  onDelete,
  onAddIncome,
  onAddExpense,
  onReload
}) => {
  const [draftOpening, setDraftOpening] = useState(String(openingIncome || ''));

  useEffect(() => {
    setDraftOpening(String(openingIncome || ''));
  }, [openingIncome]);
  const handleSaveOpening = () => {
    const val = parseFloat(draftOpening) || 0;
    onSaveOpeningIncome(val);
  };

  return (
    <section className="admin-panel">
      <h2>Admin</h2>

      <div className="admin-block">
        <h3>Starting Income</h3>
        <p className="admin-hint">Opening balance for the month (added to load payments).</p>
        <div className="admin-row">
          <input
            type="number"
            step="0.01"
            min="0"
            value={draftOpening}
            onChange={(e) => setDraftOpening(e.target.value)}
            placeholder="0.00"
            className="admin-input"
          />
          <button type="button" className="btn-primary" onClick={handleSaveOpening}>Save</button>
        </div>
      </div>

      <div className="admin-block">
        <h3>Quick Add</h3>
        <div className="admin-actions">
          <button type="button" className="btn-primary" onClick={onAddIncome}>+ Income</button>
          <button type="button" className="btn-secondary" onClick={onAddExpense}>+ Expense</button>
          <button type="button" className="btn-secondary" onClick={onReload}>Refresh</button>
        </div>
      </div>

      <div className="admin-block">
        <h3>All Entries ({expenses.length})</h3>
        {expenses.length === 0 ? (
          <p className="admin-empty">No entries yet. Use + Income to log your first load payment.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {expenses.map(entry => (
                  <tr key={entry.localId ?? entry.id}>
                    <td>{entry.date ? entry.date.split('T')[0] : '—'}</td>
                    <td>
                      <span className={`type-pill ${entry.type}`}>{entry.type}</span>
                    </td>
                    <td>{entry.description}</td>
                    <td>{entry.category}</td>
                    <td className={entry.type === 'income' ? 'income-amount' : 'expense-amount'}>
                      {formatMoney(entry.amount)}
                    </td>
                    <td className="admin-table-actions">
                      <button type="button" className="btn-secondary small" onClick={() => onEdit(entry)}>Edit</button>
                      <button type="button" className="btn-delete small" onClick={() => onDelete(entry)}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};

export default AdminPanel;
