import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-auth-session/build/QueryParams', () => ({ getQueryParams: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: vi.fn(),
      setSession: vi.fn(),
    },
  },
}));

import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { supabase } from '@/lib/supabase';

import { completeNativeAuthCallback, webAuthCallbackHasError } from './callback';

afterEach(() => vi.clearAllMocks());

describe('auth callbacks', () => {
  it('exchanges a native PKCE code for a Supabase session', async () => {
    vi.mocked(QueryParams.getQueryParams).mockReturnValue({
      errorCode: null,
      params: { code: 'one-time-code' },
    });
    vi.mocked(supabase.auth.exchangeCodeForSession).mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    } as never);

    await expect(
      completeNativeAuthCallback('decisioneats://auth/callback?code=one-time-code')
    ).resolves.toBe('signed-in');
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('one-time-code');
  });

  it('maps a declined native OAuth request to cancellation', async () => {
    vi.mocked(QueryParams.getQueryParams).mockReturnValue({
      errorCode: 'access_denied',
      params: {},
    });

    await expect(
      completeNativeAuthCallback('decisioneats://auth/callback?error=access_denied')
    ).resolves.toBe('cancelled');
  });

  it('detects callback errors in query or fragment parameters', () => {
    expect(
      webAuthCallbackHasError('https://app.example.com/auth/callback?error=access_denied')
    ).toBe(true);
    expect(
      webAuthCallbackHasError('https://app.example.com/auth/callback#error=access_denied')
    ).toBe(true);
    expect(
      webAuthCallbackHasError('https://app.example.com/auth/callback#access_token=token')
    ).toBe(false);
  });
});
