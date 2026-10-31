import React from 'react';
import './PrivacyPolicy.css';

export const PRIVACY_CONTACT_EMAIL = 'dallas8000@gmail.com';
export const PRIVACY_LAST_UPDATED = '31 October 2026';

const PrivacyPolicy = ({ onBack }) => (
  <div className="privacy-page">
    <article className="privacy-card">
      {onBack && (
        <button type="button" className="privacy-back" onClick={onBack}>
          ← Back
        </button>
      )}
      <h1>RigHand AI Privacy Policy</h1>
      <p className="privacy-updated">Last updated: {PRIVACY_LAST_UPDATED}</p>

      <p>
        RigHand AI is run by Barney R. Gilliom (Gilliom Frontline Digital). This page explains, in plain
        language, what information RigHand keeps, why, and who else receives it.
      </p>

      <h2>What you give us when you register</h2>
      <ul>
        <li><strong>Email address</strong>: to log in and to contact you about your account.</li>
        <li><strong>Full name</strong>: shown in your own account and, if you join a fleet, to that fleet&apos;s owner and dispatchers.</li>
        <li><strong>Password</strong>: stored only as a one-way scrambled form (a hash). We cannot read it.</li>
        <li>
          <strong>Driving licence number</strong>: used only to make sure each driver has one account. It is not
          shown to other RigHand users and is not shared with anyone outside the service providers listed below.
        </li>
      </ul>

      <h2>What you add while using the app</h2>
      <ul>
        <li>Income and expense entries, categories, notes and receipt photos or links.</li>
        <li>Trips: distances, odometer readings, fuel, tolls and load details (such as broker, shipper, receiver, addresses, rates and documents you attach).</li>
        <li>Driving-hours (duty) logs, maintenance reminders and compliance records you enter.</li>
      </ul>
      <p>
        Entries are saved on your phone first, so the app works without signal, and are copied to our servers
        when you are back online.
      </p>

      <h2>Location, Bluetooth, microphone and camera</h2>
      <ul>
        <li><strong>Location</strong>: used when you choose GPS trip tracking. If you are part of a fleet and turn on location sharing, your position is sent about every 3 minutes and shown to that fleet&apos;s owner and dispatchers.</li>
        <li><strong>Bluetooth</strong>: used only to read an OBD-II dongle if you connect one.</li>
        <li><strong>Microphone</strong>: used only when you choose voice entry, through your device&apos;s own speech recognition.</li>
        <li><strong>Camera / photos</strong>: used only when you add a receipt photo.</li>
      </ul>
      <p>The app asks your permission before using any of these, and you can turn them off in your device settings.</p>

      <h2>Who else receives data</h2>
      <p>We do not sell your data. We share it only with the services needed to run RigHand:</p>
      <ul>
        <li><strong>Railway</strong>: hosts our servers and database.</li>
        <li><strong>Stripe and Google Play</strong>: process paid-plan payments. They handle your card details; we never see or store your card number.</li>
        <li><strong>Sentry</strong>: receives technical error reports (for example, browser or device type and the error that occurred) so we can fix problems.</li>
        <li><strong>OpenAI</strong>: receives the text being translated when you use translated captions.</li>
        <li><strong>Your fleet</strong>: if you join a fleet, its owner and dispatchers can see your name, duty status, shared location and the trip and profit figures shown in the dispatch view.</li>
      </ul>
      <p>We may also disclose information if the law requires it.</p>

      <h2>How we protect it</h2>
      <p>
        Data travels between the app and our servers over encrypted connections (HTTPS), and passwords are stored
        only as hashes. No system is perfectly secure, so please use a password you do not use anywhere else.
      </p>

      <h2>Keeping and deleting your data</h2>
      <p>
        We keep your data while your account exists. To see what we hold about you, correct it, or delete your
        account and its data, email{' '}
        <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>{PRIVACY_CONTACT_EMAIL}</a> from the address on your
        account. We will confirm by email once it is done. Data stored only on your phone is removed when you
        clear the app&apos;s data or uninstall it.
      </p>

      <h2>Not legal, tax or safety advice</h2>
      <p>
        RigHand helps you keep records. Its compliance, driving-hours and tax features are tools, not legal, tax
        or safety advice. Check official requirements for where you drive.
      </p>

      <h2>Changes and contact</h2>
      <p>
        If this policy changes, we will update this page and the date above. Questions:{' '}
        <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>{PRIVACY_CONTACT_EMAIL}</a>.
      </p>
    </article>
  </div>
);

export default PrivacyPolicy;
