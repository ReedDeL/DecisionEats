import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-auth-session', () => ({ makeRedirectUri: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

import { AUTH_CALLBACK_PATH, PASSWORD_RESET_PATH, resolveWebAuthRedirectUri } from './redirect-uri';

describe('web auth redirect URIs', () => {
  it('returns OAuth callbacks to the same browser origin and callback route', () => {
    expect(
      resolveWebAuthRedirectUri(
        'https://preview.decisioneats.pages.dev',
        AUTH_CALLBACK_PATH,
        'https://decisioneats.pages.dev'
      )
    ).toBe('https://preview.decisioneats.pages.dev/auth/callback');
  });

  it('uses the current local origin for password reset links', () => {
    expect(
      resolveWebAuthRedirectUri(
        'http://localhost:8081',
        PASSWORD_RESET_PATH,
        'https://decisioneats.pages.dev'
      )
    ).toBe('http://localhost:8081/auth/reset-password');
  });

  it('keeps a configured origin only when it matches the current origin', () => {
    expect(
      resolveWebAuthRedirectUri(
        'https://decisioneats.pages.dev',
        AUTH_CALLBACK_PATH,
        'https://decisioneats.pages.dev'
      )
    ).toBe('https://decisioneats.pages.dev/auth/callback');
  });
});
