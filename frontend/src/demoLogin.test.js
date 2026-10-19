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
jest.mock('./components/LandingPage', () => ({ onTryDemo }) => (
  <button type="button" onClick={onTryDemo}>Try demo</button>
));

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('demo entry points clear a leftover developer-mode flag', () => {
  let container;
  let root;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('righandDeveloperMode', 'true');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const clickButton = async (label) => {
    const button = [...container.querySelectorAll('button')]
      .find((el) => el.textContent.includes(label));
    expect(button).toBeDefined();
    await act(async () => { button.click(); });
  };

  test('AuthForm demo login', async () => {
    const onAuthSuccess = jest.fn();
    await act(async () => { root.render(<AuthForm onAuthSuccess={onAuthSuccess} />); });
    await clickButton('Demo Mode');
    expect(onAuthSuccess).toHaveBeenCalled();
    expect(localStorage.getItem('authToken')).toBe('demo_token_12345');
    expect(localStorage.getItem('righandDeveloperMode')).toBeNull();
  });

  test('landing page demo', async () => {
    await act(async () => { root.render(<App />); });
    await clickButton('Try demo');
    expect(container.textContent).toContain('dashboard');
    expect(localStorage.getItem('authToken')).toBe('demo_token_12345');
    expect(localStorage.getItem('righandDeveloperMode')).toBeNull();
  });
});
