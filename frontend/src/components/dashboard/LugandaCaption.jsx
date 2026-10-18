import React, { useState } from 'react';
import { ComplianceAPI } from '../../services/api';

const LugandaCaption = ({ text }) => {
  const [state, setState] = useState('idle');
  const [caption, setCaption] = useState(null);
  const [message, setMessage] = useState('');

  const load = async () => {
    if (caption) {
      setState(state === 'open' ? 'idle' : 'open');
      return;
    }
    setState('loading');
    setMessage('');
    try {
      setCaption(await ComplianceAPI.translateToLuganda(text));
      setState('open');
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Luganda caption is unavailable right now.');
      setState('error');
    }
  };

  return (
    <div className="luganda-caption">
      <button type="button" className="link-btn" onClick={load} disabled={state === 'loading'}>
        {state === 'loading' ? 'Translating…' : state === 'open' ? 'Hide Luganda' : '🇺🇬 Luganda'}
      </button>
      {state === 'error' && <small className="admin-hint warn">{message}</small>}
      {state === 'open' && caption && (
        <div className="luganda-caption-box">
          <p className="luganda-caption-text" lang="lg">{caption.luganda}</p>
          <p className="luganda-caption-english"><strong>In English:</strong> {caption.englishSummary}</p>
          <small>{caption.disclaimer}</small>
        </div>
      )}
    </div>
  );
};

export default LugandaCaption;
