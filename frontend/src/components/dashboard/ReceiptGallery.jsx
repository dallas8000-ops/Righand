import React, { useState } from 'react';
import { formatCurrency } from '../../utils/currency';

const defaultFormatMoney = (value) => formatCurrency(value, 'USD');

const ReceiptGallery = ({ expenses, onSelect, formatMoney = defaultFormatMoney }) => {
  const withReceipts = expenses.filter(e => e.receiptUrl);
  const [preview, setPreview] = useState(null);

  if (withReceipts.length === 0) {
    return (
      <section className="receipt-gallery empty">
        <h3>Receipt Gallery</h3>
        <p className="section-help">Attach receipt photos when logging expenses to see them here.</p>
      </section>
    );
  }

  return (
    <section className="receipt-gallery">
      <h3>Receipt Gallery ({withReceipts.length})</h3>
      <div className="receipt-grid">
        {withReceipts.map(expense => (
          <button
            key={expense.id}
            type="button"
            className="receipt-thumb"
            onClick={() => setPreview(expense)}
          >
            <img src={expense.receiptUrl} alt={expense.description} />
            <span className="receipt-thumb-meta">
              {new Date(expense.date).toLocaleDateString()} · {formatMoney(expense.amount)}
            </span>
          </button>
        ))}
      </div>

      {preview && (
        <dialog className="receipt-modal" open aria-label="Receipt preview">
          <div className="receipt-modal-content">
            <img src={preview.receiptUrl} alt={preview.description} />
            <div className="receipt-modal-info">
              <strong>{preview.description}</strong>
              <p>{new Date(preview.date).toLocaleDateString()} · {formatMoney(preview.amount)}</p>
              <div className="receipt-modal-actions">
                <button type="button" className="btn-secondary small" onClick={() => onSelect?.(preview)}>Edit Entry</button>
                <button type="button" className="btn-secondary small" onClick={() => setPreview(null)}>Close</button>
              </div>
            </div>
          </div>
        </dialog>
      )}
    </section>
  );
};

export default ReceiptGallery;
