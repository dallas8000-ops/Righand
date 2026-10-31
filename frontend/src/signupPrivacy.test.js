import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AuthForm from './components/AuthForm';

jest.mock('./services/offlineDB', () => ({
  UserDB: {
    saveUserSession: jest.fn(() => Promise.resolve()),
    getUserSession: jest.fn(() => Promise.resolve(null)),
  },
}));
jest.mock('./services/api', () => ({
  AuthAPI: { verifyToken: jest.fn(() => Promise.resolve(false)) },
  setAuthToken: jest.fn(),
}));
jest.mock('./components/Dashboard', () => () => <div>dashboard</div>);

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('sign-up explains the driving-licence field and links the privacy policy', () => {
  let container;
  let root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.history.pushState({}, '', '/');
  });

  it('register form shows why the licence is needed and links to /privacy', async () => {
    await act(async () => {
      root.render(<AuthForm isLogin={false} onAuthSuccess={() => {}} onToggleMode={() => {}} />);
    });

    const licence = container.querySelector('#license');
    expect(licence).not.toBeNull();
    const hint = container.querySelector('#license-why');
    expect(hint).not.toBeNull();
    expect(licence.getAttribute('aria-describedby')).toBe('license-why');
    expect(hint.textContent).toMatch(/only to make sure each driver has one account/);

    const privacyLinks = [...container.querySelectorAll('a')].filter((a) => a.getAttribute('href') === '/privacy');
    expect(privacyLinks.length).toBeGreaterThanOrEqual(2);
  });

  it('login form does not show the registration privacy notice', async () => {
    await act(async () => {
      root.render(<AuthForm isLogin onAuthSuccess={() => {}} onToggleMode={() => {}} />);
    });
    expect(container.querySelector('#license-why')).toBeNull();
    expect(container.querySelector('.auth-privacy-note')).toBeNull();
  });

  it('/privacy renders the policy without logging in', async () => {
    window.history.pushState({}, '', '/privacy');
    await act(async () => {
      root.render(<App />);
    });
    expect(container.querySelector('h1').textContent).toBe('RigHand AI Privacy Policy');
    expect(container.textContent).toMatch(/Driving licence number/);
    expect(container.textContent).not.toMatch(/does not collect, store, or share any personal information/);
  });
});
