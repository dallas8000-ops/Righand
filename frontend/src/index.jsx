import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';

// REACT_APP_SENTRY_DSN is set as a Railway build/runtime variable, not
// hardcoded here. No-ops safely if unset (e.g. local dev).
if (process.env.REACT_APP_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.REACT_APP_SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    // Keep trace sampling modest by default; tune from the Sentry dashboard
    // rather than raising this blindly.
    tracesSampleRate: 0.1,
    integrations: [Sentry.browserTracingIntegration()],
  });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
