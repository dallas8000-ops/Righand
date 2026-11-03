import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { SubscriptionAPI } from '../services/api';
import { useSubscription } from './useSubscription';

jest.mock('../services/api', () => ({ SubscriptionAPI: { getMe: jest.fn() } }));

global.IS_REACT_ACT_ENVIRONMENT = true;

async function renderAccess(isDemo = false) {
  let result;
  const Probe = () => {
    result = useSubscription(isDemo);
    return null;
  };
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(<Probe />);
  });
  await act(async () => {});
  root.unmount();
  return result;
}

describe('useSubscription hasAccess (trial paywall)', () => {
  beforeEach(() => {
    localStorage.clear();
    SubscriptionAPI.getMe.mockReset();
  });

  test('locks the app when the server says the trial is over and nothing is paid', async () => {
    SubscriptionAPI.getMe.mockResolvedValue({ tier: 'free', trialExpired: true, hasAccess: false });
    expect((await renderAccess()).hasAccess).toBe(false);
  });

  test('keeps access while the server grants it (trial, paid plan or fleet seat)', async () => {
    SubscriptionAPI.getMe.mockResolvedValue({ tier: 'free', trialActive: true, hasAccess: true });
    expect((await renderAccess()).hasAccess).toBe(true);
  });

  test('a failed status request never walls the user (the API still enforces the lock)', async () => {
    SubscriptionAPI.getMe.mockRejectedValue(new Error('offline'));
    expect((await renderAccess()).hasAccess).toBe(true);
  });

  test('demo mode is never walled', async () => {
    expect((await renderAccess(true)).hasAccess).toBe(true);
  });
});
