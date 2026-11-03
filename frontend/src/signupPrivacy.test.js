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

describe('sign-up asks only for email, name and password and links the privacy policy', () => {
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

  it('register form no longer asks for a driving licence and links to /privacy', async () => {
    await act(async () => {
      root.render(<AuthForm isLogin={false} onAuthSuccess={() => {}} onToggleMode={() => {}} />);
    });

    expect(container.querySelector('#license')).toBeNull();
    expect(container.querySelector('input[name="truckerLicense"]')).toBeNull();
    expect(container.textContent).not.toMatch(/licence/i);
    ['#email', '#name', '#password'].forEach((id) => expect(container.querySelector(id)).not.toBeNull());

    const privacyLinks = [...container.querySelectorAll('a')].filter((a) => a.getAttribute('href') === '/privacy');
    expect(privacyLinks.length).toBeGreaterThanOrEqual(1);
  });

  it('login form does not show the registration privacy notice', async () => {
    await act(async () => {
      root.render(<AuthForm isLogin onAuthSuccess={() => {}} onToggleMode={() => {}} />);
    });
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
