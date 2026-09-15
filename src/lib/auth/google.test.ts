import { afterEach, describe, expect, it, vi } from 'vitest';

const platformState = vi.hoisted(() => ({ os: 'web' }));

vi.mock('expo-auth-session', () => ({ makeRedirectUri: vi.fn() }));
vi.mock('expo-auth-session/build/QueryParams', () => ({ getQueryParams: vi.fn() }));
vi.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: vi.fn(),
  openAuthSessionAsync: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn(),
      setSession: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));
vi.mock('react-native', () => ({
  Platform: {
    get OS(): string {
      return platformState.os;
    },
  },
}));

import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';

import {
  createGoogleOAuthDependencies,
  resolveWebRedirectUri,
  signInWithGoogle,
  signOut,
} from '@/lib/auth/google';
import { supabase } from '@/lib/supabase';

afterEach(() => {
  platformState.os = 'web';
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('resolveWebRedirectUri', () => {
  it('uses the configured production origin when present', () => {
    expect(resolveWebRedirectUri('http://localhost:8081', 'https://homechef-2xy.pages.dev')).toBe(
      'https://homechef-2xy.pages.dev'
    );
  });

  it('falls back to the current browser origin for local development', () => {
    expect(resolveWebRedirectUri('http://localhost:8081', '   ')).toBe('http://localhost:8081');
  });
});

describe('createGoogleOAuthDependencies', () => {
  it('uses a regular Supabase redirect on web', async () => {
    const signInWithOAuth = vi.fn(async () => ({ data: {}, error: null }));
    const dependencies = createGoogleOAuthDependencies({
      platform: 'web',
      redirectTo: 'https://homechef.example.com',
      signInWithOAuth,
      setSession: vi.fn(async () => ({ error: null })),
      openAuthSessionAsync: vi.fn(),
      getQueryParams: vi.fn(),
    });
    await dependencies.startWebRedirect('https://homechef.example.com');
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://homechef.example.com' },
    });
  });

  it('requests an Android URL without auto-navigation', async () => {
    const signInWithOAuth = vi.fn(async () => ({
      data: { url: 'https://auth.example' },
      error: null,
    }));
    const dependencies = createGoogleOAuthDependencies({
      platform: 'android',
      redirectTo: 'decisioneats://auth/callback',
      signInWithOAuth,
      setSession: vi.fn(async () => ({ error: null })),
      openAuthSessionAsync: vi.fn(),
      getQueryParams: vi.fn(),
    });
    await expect(dependencies.requestNativeUrl('decisioneats://auth/callback')).resolves.toBe(
      'https://auth.example'
    );
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'decisioneats://auth/callback', skipBrowserRedirect: true },
    });
  });

  it('maps callback tokens for the flow without retaining provider tokens', () => {
    const dependencies = createGoogleOAuthDependencies({
      platform: 'android',
      redirectTo: 'decisioneats://auth/callback',
      signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
      setSession: vi.fn(async () => ({ error: null })),
      openAuthSessionAsync: vi.fn(),
      getQueryParams: vi.fn(() => ({
        errorCode: null,
        params: { access_token: 'session-access', refresh_token: 'session-refresh' },
      })),
    });

    expect(dependencies.readSessionTokens('decisioneats://auth/callback')).toEqual({
      accessToken: 'session-access',
      refreshToken: 'session-refresh',
    });
  });

  it('maps an access_denied OAuth error code to cancellation', () => {
    const dependencies = createGoogleOAuthDependencies({
      platform: 'android',
      redirectTo: 'decisioneats://auth/callback',
      signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
      setSession: vi.fn(async () => ({ error: null })),
      openAuthSessionAsync: vi.fn(),
      getQueryParams: vi.fn(() => ({ errorCode: 'access_denied', params: {} })),
    });

    expect(dependencies.readSessionTokens('decisioneats://auth/callback')).toBeNull();
  });

  it('maps Supabase access_denied callback parameters to cancellation', () => {
    const dependencies = createGoogleOAuthDependencies({
      platform: 'android',
      redirectTo: 'decisioneats://auth/callback',
      signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
      setSession: vi.fn(async () => ({ error: null })),
      openAuthSessionAsync: vi.fn(),
      getQueryParams: vi.fn(() => ({
        errorCode: null,
        params: { error: 'access_denied', error_code: 'access_denied' },
      })),
    });

    expect(dependencies.readSessionTokens('decisioneats://auth/callback')).toBeNull();
  });

  it('rejects a callback containing another OAuth error', () => {
    const dependencies = createGoogleOAuthDependencies({
      platform: 'android',
      redirectTo: 'decisioneats://auth/callback',
      signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
      setSession: vi.fn(async () => ({ error: null })),
      openAuthSessionAsync: vi.fn(),
      getQueryParams: vi.fn(() => ({
        errorCode: null,
        params: { error: 'server_error', error_code: 'unexpected_failure' },
      })),
    });

    expect(() => dependencies.readSessionTokens('decisioneats://auth/callback')).toThrow(
      'Google sign-in failed.'
    );
  });

  it('passes the callback session pair to Supabase', async () => {
    const setSession = vi.fn(async () => ({ error: null }));
    const dependencies = createGoogleOAuthDependencies({
      platform: 'android',
      redirectTo: 'decisioneats://auth/callback',
      signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
      setSession,
      openAuthSessionAsync: vi.fn(),
      getQueryParams: vi.fn(),
    });

    await dependencies.setSession({
      accessToken: 'session-access',
      refreshToken: 'session-refresh',
    });

    expect(setSession).toHaveBeenCalledWith({
      access_token: 'session-access',
      refresh_token: 'session-refresh',
    });
  });

  it('wires the public entry point to the web redirect flow', async () => {
    const signInWithOAuthMock = vi.mocked(supabase.auth.signInWithOAuth);
    const openAuthSessionAsyncMock = vi.mocked(WebBrowser.openAuthSessionAsync);
    vi.stubGlobal('location', { origin: 'https://homechef.example.com' });
    platformState.os = 'web';
    signInWithOAuthMock.mockResolvedValue({
      data: { provider: 'google', url: 'https://project.supabase.co/auth/v1/authorize' },
      error: null,
    });

    await expect(signInWithGoogle()).resolves.toEqual({ type: 'redirecting' });

    expect(signInWithOAuthMock).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://homechef.example.com' },
    });
    expect(openAuthSessionAsyncMock).not.toHaveBeenCalled();
  });

  it('wires the public entry point through the Android auth return', async () => {
    const makeRedirectUriMock = vi.mocked(makeRedirectUri);
    const signInWithOAuthMock = vi.mocked(supabase.auth.signInWithOAuth);
    const openAuthSessionAsyncMock = vi.mocked(WebBrowser.openAuthSessionAsync);
    const getQueryParamsMock = vi.mocked(QueryParams.getQueryParams);
    const setSessionMock = vi.mocked(supabase.auth.setSession);
    platformState.os = 'android';
    makeRedirectUriMock.mockReturnValue('decisioneats://auth/callback');
    signInWithOAuthMock.mockResolvedValue({
      data: { provider: 'google', url: 'https://project.supabase.co/auth/v1/authorize' },
      error: null,
    });
    openAuthSessionAsyncMock.mockResolvedValue({
      type: 'success',
      url: 'decisioneats://auth/callback#access_token=session-access&refresh_token=session-refresh',
    });
    getQueryParamsMock.mockReturnValue({
      errorCode: null,
      params: { access_token: 'session-access', refresh_token: 'session-refresh' },
    });
    setSessionMock.mockResolvedValue({ data: { session: null, user: null }, error: null });

    await expect(signInWithGoogle()).resolves.toEqual({ type: 'signed-in' });

    expect(signInWithOAuthMock).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'decisioneats://auth/callback', skipBrowserRedirect: true },
    });
    expect(setSessionMock).toHaveBeenCalledWith({
      access_token: 'session-access',
      refresh_token: 'session-refresh',
    });
  });

  it('rejects an unsupported platform before creating adapter dependencies', async () => {
    const makeRedirectUriMock = vi.mocked(makeRedirectUri);
    const signInWithOAuthMock = vi.mocked(supabase.auth.signInWithOAuth);
    makeRedirectUriMock.mockClear();
    signInWithOAuthMock.mockClear();
    platformState.os = 'ios';

    await expect(signInWithGoogle()).rejects.toThrow(
      'Google sign-in is not available on this platform.'
    );

    expect(makeRedirectUriMock).not.toHaveBeenCalled();
    expect(signInWithOAuthMock).not.toHaveBeenCalled();
    platformState.os = 'web';
  });

  it('delegates sign-out to Supabase', async () => {
    const signOutMock = vi.mocked(supabase.auth.signOut);
    signOutMock.mockResolvedValue({ error: null });

    await signOut();

    expect(signOutMock).toHaveBeenCalledOnce();
  });
});
