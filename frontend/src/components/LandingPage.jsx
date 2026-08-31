import React from 'react';
import './LandingPage.css';

const REGIONS = [
  { code: 'UG', flag: '🇺🇬', name: 'Uganda' },
  { code: 'KE', flag: '🇰🇪', name: 'Kenya' },
  { code: 'RW', flag: '🇷🇼', name: 'Rwanda' },
  { code: 'EAC', flag: '🌍', name: 'EAC Cross-Border' },
  { code: 'EU', flag: '🇪🇺', name: 'EU' },
];

const FEATURES = [
  {
    icon: '💰',
    title: 'Expense & Income Logging',
    desc: 'Log fuel, tolls, maintenance, and load income in seconds, with quick templates for the entries you make every day.',
  },
  {
    icon: '📶',
    title: 'Offline-First',
    desc: 'Keep logging with no signal. Entries queue locally and sync automatically the moment you’re back online.',
  },
  {
    icon: '🛣️',
    title: 'Trip Tracking',
    desc: 'Manual odometer, live GPS, or an OBD-II dongle on Android — pick the mode that fits the cab and log miles automatically.',
  },
  {
    icon: '🌍',
    title: 'Regional Compliance',
    desc: 'Jurisdiction-aware document and inspection tracking for Uganda, Kenya, Rwanda, EAC cross-border corridors, and the EU.',
  },
  {
    icon: '📊',
    title: 'Tax & IFTA Reports',
    desc: 'Schedule C quarterly breakdowns, IFTA fuel summaries by state, and PDF/CSV exports that are ready for your accountant.',
  },
  {
    icon: '🚛',
    title: 'Fleet Dispatch',
    desc: 'Add drivers and dispatchers, see live GPS and per-driver P&L in one dispatch view once you’re running more than one truck.',
  },
];

const TIERS = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    tagline: 'Everything you need to start tracking profit today.',
    features: [
      'Home dashboard & weekly profit chart',
      'Money Log — add, search, and filter entries',
      'Receipt photo capture',
      'Trip miles (manual, GPS, or OBD)',
    ],
    cta: 'Start Free',
    highlight: false,
  },
  {
    name: 'Compliance Pro',
    price: '$34.99',
    period: '/mo',
    tagline: 'For drivers who need tax-ready records and compliance tools.',
    features: [
      'Everything in Free',
      'Tax & IFTA reports (PDF/CSV export)',
      'HOS countdown (11/14-hour clocks)',
      'Maintenance reminders & document packets',
      'Admin panel & custom categories',
    ],
    cta: 'Start Free, Upgrade in App',
    highlight: true,
  },
  {
    name: 'Fleet Lite',
    price: '$89',
    period: '/mo',
    tagline: 'For small carriers running more than one truck.',
    features: [
      'Everything in Compliance Pro',
      '1 billing owner + up to 5 driver/dispatcher seats',
      'Live GPS sharing across the fleet',
      'Multi-driver dispatch & P&L view',
    ],
    cta: 'Start Free, Upgrade in App',
    highlight: false,
  },
];

const LandingPage = ({ onLogin, onSignUp, onTryDemo }) => {
  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <a href="#top" className="landing-logo">🚚 RigHand AI</a>
          <nav className="landing-nav-links" aria-label="Primary">
            <a href="#how-it-works">How It Works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#compliance">Compliance</a>
          </nav>
          <div className="landing-nav-actions">
            <button type="button" className="btn-nav-login" onClick={onLogin}>Login</button>
            <button type="button" className="btn-nav-cta" onClick={onSignUp}>Get Started Free</button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="landing-hero">
          <img
            src={`${process.env.PUBLIC_URL}/truck-console-bg.png`}
            alt=""
            className="landing-hero-truck"
            aria-hidden="true"
          />
          <div className="landing-hero-content">
            <span className="landing-eyebrow">Built for truck drivers & small carriers</span>
            <h1>Know your real profit on every load, every mile.</h1>
            <p className="landing-hero-sub">
              RigHand AI is an offline-first expense, profit, and compliance tracker for drivers and
              small fleets — log costs from the cab, track trips automatically, and stay
              audit-ready across Uganda, Kenya, Rwanda, the EAC, and the EU.
            </p>
            <div className="landing-hero-actions">
              <button type="button" className="btn-hero-primary" onClick={onSignUp}>
                Get Started Free
              </button>
              <button type="button" className="btn-hero-secondary" onClick={onTryDemo}>
                🎯 Try Demo Mode
              </button>
            </div>
            <p className="landing-hero-note">No card required to start on the Free plan.</p>
          </div>
        </section>

        <section className="landing-regions" aria-label="Supported regions">
          <span className="landing-regions-label">Regional compliance support:</span>
          <ul className="landing-regions-list">
            {REGIONS.map((r) => (
              <li key={r.code}>
                <span aria-hidden="true">{r.flag}</span> {r.name}
              </li>
            ))}
          </ul>
        </section>

        <section id="how-it-works" className="landing-section">
          <div className="landing-section-head">
            <span className="landing-section-tag">How It Works</span>
            <h2>From cab to closed books in three steps</h2>
          </div>
          <div className="landing-steps">
            <div className="landing-step">
              <span className="landing-step-num">1</span>
              <h3>Log as you go</h3>
              <p>Record fuel, tolls, maintenance, and load income in seconds — online or off. Nothing waits for signal.</p>
            </div>
            <div className="landing-step">
              <span className="landing-step-num">2</span>
              <h3>Track every trip</h3>
              <p>Start and end trips manually, from live GPS, or from an OBD-II dongle on Android. Miles roll straight into your reports.</p>
            </div>
            <div className="landing-step">
              <span className="landing-step-num">3</span>
              <h3>See what you actually made</h3>
              <p>Net profit, profit per mile, and fuel cost per mile update automatically — plus tax-ready exports when you need them.</p>
            </div>
          </div>
        </section>

        <section id="features" className="landing-section landing-section-alt">
          <div className="landing-section-head">
            <span className="landing-section-tag">Features</span>
            <h2>Everything a working driver actually needs</h2>
          </div>
          <div className="landing-features-grid">
            {FEATURES.map((f) => (
              <div className="landing-feature-card" key={f.title}>
                <span className="landing-feature-icon" aria-hidden="true">{f.icon}</span>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="compliance" className="landing-section">
          <div className="landing-section-head">
            <span className="landing-section-tag">Compliance</span>
            <h2>Jurisdiction-aware, not one-size-fits-all</h2>
            <p className="landing-section-sub">
              The Compliance tab adapts to where you actually operate — inspection and licence
              records, load-control readiness, and cross-border customs evidence for each region you drive.
            </p>
          </div>
          <ul className="landing-regions-list landing-regions-list--large">
            {REGIONS.map((r) => (
              <li key={r.code}>
                <span aria-hidden="true">{r.flag}</span> {r.name}
              </li>
            ))}
          </ul>
        </section>

        <section id="pricing" className="landing-section landing-section-alt">
          <div className="landing-section-head">
            <span className="landing-section-tag">Pricing</span>
            <h2>Start free. Upgrade only if you need it.</h2>
            <p className="landing-section-sub">
              Paid tiers unlock inside the app after you sign up — no separate purchase needed to get started.
            </p>
          </div>
          <div className="landing-pricing-grid">
            {TIERS.map((t) => (
              <div className={`landing-pricing-card${t.highlight ? ' landing-pricing-card--highlight' : ''}`} key={t.name}>
                {t.highlight && <span className="landing-pricing-badge">Most Popular</span>}
                <h3>{t.name}</h3>
                <p className="landing-pricing-tagline">{t.tagline}</p>
                <div className="landing-pricing-amount">
                  {t.price}<span className="landing-pricing-period">{t.period}</span>
                </div>
                <ul className="landing-pricing-features">
                  {t.features.map((feat) => (
                    <li key={feat}>
                      <span aria-hidden="true">✓</span> {feat}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={t.highlight ? 'btn-hero-primary' : 'btn-hero-secondary'}
                  onClick={onSignUp}
                >
                  {t.cta}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-final-cta">
          <h2>Ready to see your real profit per mile?</h2>
          <div className="landing-hero-actions">
            <button type="button" className="btn-hero-primary" onClick={onSignUp}>
              Get Started Free
            </button>
            <button type="button" className="btn-nav-login btn-nav-login--onlight" onClick={onLogin}>
              I already have an account
            </button>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p>🚚 RigHand AI — Expense, profit, and compliance tracking for drivers and small carriers.</p>
        <p className="landing-footer-links">
          <button type="button" className="landing-footer-link" onClick={onLogin}>Login</button>
          <span aria-hidden="true">·</span>
          <button type="button" className="landing-footer-link" onClick={onSignUp}>Create Account</button>
          <span aria-hidden="true">·</span>
          <button type="button" className="landing-footer-link" onClick={onTryDemo}>Try Demo</button>
        </p>
      </footer>
    </div>
  );
};

export default LandingPage;
