import React, { useState } from 'react';
import { ComplianceAPI } from '../../services/api';

const LANGUAGE_OPTIONS = [
  { code: 'lg', label: 'Luganda' },
  { code: 'sw', label: 'Kiswahili' },
];

const LanguageCaption = ({ text }) => {
  const [active, setActive] = useState(null);
  const [captions, setCaptions] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const choose = async (code) => {
    setMessage('');
    if (active === code) {
      setActive(null);
      return;
    }
    setActive(code);
    if (captions[code]) return;
    setLoading(true);
    try {
      const caption = await ComplianceAPI.translateText(text, code);
      setCaptions(prev => ({ ...prev, [code]: caption }));
    } catch (err) {
      setActive(null);
      setMessage(err?.response?.data?.error || 'The translation is unavailable right now.');
    } finally {
      setLoading(false);
    }
  };

  const caption = active ? captions[active] : null;

  return (
    <div className="luganda-caption">
      <div className="language-picker" role="group" aria-label="Read this in another language">
        <span className="language-picker-label">Read in:</span>
        {LANGUAGE_OPTIONS.map(option => (
          <button
            key={option.code}
            type="button"
            className={`link-btn language-option${active === option.code ? ' active' : ''}`}
            onClick={() => choose(option.code)}
            disabled={loading}
          >
            {loading && active === option.code ? 'Translating…' : option.label}
          </button>
        ))}
      </div>
      {message && <small className="admin-hint warn">{message}</small>}
      {caption && (
        <div className="luganda-caption-box">
          <p className="luganda-caption-text" lang={caption.language}>{caption.translation}</p>
          <p className="luganda-caption-english"><strong>In English:</strong> {caption.englishSummary}</p>
          <small>{caption.disclaimer}</small>
        </div>
      )}
    </div>
  );
};

export default LanguageCaption;
