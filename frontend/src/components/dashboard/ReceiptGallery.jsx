import React, { useState } from 'react';

const ReceiptGallery = ({ expenses, onSelect }) => {
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
              {new Date(expense.date).toLocaleDateString()} · ${Number(expense.amount).toFixed(2)}
            </span>
          </button>
        ))}
      </div>

      {preview && (
        <div className="receipt-modal" role="dialog" onClick={() => setPreview(null)}>
          <div className="receipt-modal-content" onClick={e => e.stopPropagation()}>
            <img src={preview.receiptUrl} alt={preview.description} />
            <div className="receipt-modal-info">
              <strong>{preview.description}</strong>
              <p>{new Date(preview.date).toLocaleDateString()} · ${Number(preview.amount).toFixed(2)}</p>
              <div className="receipt-modal-actions">
                <button type="button" className="btn-secondary small" onClick={() => onSelect?.(preview)}>Edit Entry</button>
                <button type="button" className="btn-secondary small" onClick={() => setPreview(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default ReceiptGallery;
