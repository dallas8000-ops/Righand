import { isDeveloperMode } from './useSubscription';

jest.mock('../services/api', () => ({ SubscriptionAPI: { getMe: jest.fn() } }));

describe('isDeveloperMode', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.REACT_APP_DEVELOPER_BUILD;
    localStorage.clear();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('ignores the localStorage flag in a production build', () => {
    process.env.NODE_ENV = 'production';
    localStorage.setItem('righandDeveloperMode', 'true');
    expect(isDeveloperMode()).toBe(false);
  });

  test('honors the flag in a developer build', () => {
    process.env.NODE_ENV = 'production';
    process.env.REACT_APP_DEVELOPER_BUILD = 'true';
    localStorage.setItem('righandDeveloperMode', 'true');
    expect(isDeveloperMode()).toBe(true);
  });

  test('honors the flag under npm start (development)', () => {
    process.env.NODE_ENV = 'development';
    localStorage.setItem('righandDeveloperMode', 'true');
    expect(isDeveloperMode()).toBe(true);
  });

  test('is off in a developer build when the flag is not set', () => {
    process.env.REACT_APP_DEVELOPER_BUILD = 'true';
    expect(isDeveloperMode()).toBe(false);
  });
});
