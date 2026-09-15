import { describe, expect, it, vi } from 'vitest';

import { runGoogleOAuthFlow, type GoogleOAuthFlowDependencies } from '@/lib/auth/google-flow';

function flow(overrides: Partial<GoogleOAuthFlowDependencies> = {}): GoogleOAuthFlowDependencies {
  return {
    platform: 'android',
    redirectTo: 'decisioneats://auth/callback',
    startWebRedirect: vi.fn(async () => undefined),
    requestNativeUrl: vi.fn(async () => 'https://project.supabase.co/auth/v1/authorize'),
    openNativeSession: vi.fn(async () => ({
      type: 'success',
      url: 'decisioneats://auth/callback#access_token=access&refresh_token=refresh',
    })),
    readSessionTokens: vi.fn(() => ({ accessToken: 'access', refreshToken: 'refresh' })),
    setSession: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('runGoogleOAuthFlow', () => {
  it('starts the web redirect without opening a native session', async () => {
    const dependencies = flow({ platform: 'web' });
    await expect(runGoogleOAuthFlow(dependencies)).resolves.toEqual({ type: 'redirecting' });
    expect(dependencies.startWebRedirect).toHaveBeenCalledWith(dependencies.redirectTo);
    expect(dependencies.openNativeSession).not.toHaveBeenCalled();
  });

  it('stores the Supabase token pair after Android returns', async () => {
    const dependencies = flow();
    await expect(runGoogleOAuthFlow(dependencies)).resolves.toEqual({ type: 'signed-in' });
    expect(dependencies.setSession).toHaveBeenCalledWith({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
  });

  it('does not store a session after cancellation', async () => {
    const dependencies = flow({ openNativeSession: vi.fn(async () => ({ type: 'cancel' })) });
    await expect(runGoogleOAuthFlow(dependencies)).resolves.toEqual({ type: 'cancelled' });
    expect(dependencies.setSession).not.toHaveBeenCalled();
  });

  it('does not store a session after consent denial', async () => {
    const dependencies = flow({ readSessionTokens: vi.fn(() => null) });
    await expect(runGoogleOAuthFlow(dependencies)).resolves.toEqual({ type: 'cancelled' });
    expect(dependencies.setSession).not.toHaveBeenCalled();
  });

  it('rejects a callback missing either token', async () => {
    const dependencies = flow({
      readSessionTokens: vi.fn(() => ({ accessToken: null, refreshToken: null })),
    });
    await expect(runGoogleOAuthFlow(dependencies)).rejects.toThrow(
      'Google sign-in did not return a session.'
    );
  });
});
