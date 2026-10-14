import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

import {
  runGoogleOAuthFlow,
  type GoogleOAuthFlowDependencies,
  type GoogleOAuthOutcome,
} from './google-flow';
import { AUTH_CALLBACK_PATH, resolveWebAuthRedirectUri } from './redirect-uri';

type GoogleOAuthPlatform = 'android' | 'web';

interface GoogleOAuthStartOptions {
  redirectTo: string;
  skipBrowserRedirect?: boolean;
}

interface GoogleOAuthStartResponse {
  data: { url?: string | null };
  error: Error | null;
}

interface SupabaseSessionResponse {
  error: Error | null;
}

export interface GoogleOAuthAdapterDependencies {
  platform: GoogleOAuthPlatform;
  redirectTo: string;
  signInWithOAuth(input: {
    provider: 'google';
    options: GoogleOAuthStartOptions;
  }): Promise<GoogleOAuthStartResponse>;
  setSession(input: {
    access_token: string;
    refresh_token: string;
  }): Promise<SupabaseSessionResponse>;
  openAuthSessionAsync(url: string, redirectTo: string): Promise<{ type: string; url?: string }>;
  getQueryParams(url: string): { errorCode: string | null; params: Record<string, string> };
}

WebBrowser.maybeCompleteAuthSession();

export function resolveWebRedirectUri(
  currentOrigin: string,
  configuredOrigin = process.env.EXPO_PUBLIC_SITE_URL
): string {
  return resolveWebAuthRedirectUri(currentOrigin, AUTH_CALLBACK_PATH, configuredOrigin);
}

export function createGoogleOAuthDependencies(
  adapter: GoogleOAuthAdapterDependencies
): GoogleOAuthFlowDependencies {
  return {
    platform: adapter.platform,
    redirectTo: adapter.redirectTo,
    startWebRedirect: async (redirectTo) => {
      const { error } = await adapter.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) throw error;
    },
    requestNativeUrl: async (redirectTo) => {
      const { data, error } = await adapter.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error('Google sign-in did not return an authorization URL.');
      return data.url;
    },
    openNativeSession: adapter.openAuthSessionAsync,
    readSessionTokens: (url) => {
      const { errorCode, params } = adapter.getQueryParams(url);
      const errors = [errorCode, params.error, params.error_code];
      if (errors.includes('access_denied')) return null;
      if (errors.some((error) => Boolean(error))) {
        throw new Error('Google sign-in failed.');
      }
      return {
        accessToken: params.access_token ?? null,
        refreshToken: params.refresh_token ?? null,
      };
    },
    setSession: async ({ accessToken, refreshToken }) => {
      const { error } = await adapter.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
    },
  };
}

export async function signInWithGoogle(): Promise<GoogleOAuthOutcome> {
  if (Platform.OS !== 'web' && Platform.OS !== 'android') {
    throw new Error('Google sign-in is not available on this platform.');
  }
  const platform: GoogleOAuthPlatform = Platform.OS === 'web' ? 'web' : 'android';
  const redirectTo =
    platform === 'web'
      ? resolveWebRedirectUri(globalThis.location.origin)
      : makeRedirectUri({ path: 'auth/callback' });
  return runGoogleOAuthFlow(
    createGoogleOAuthDependencies({
      platform,
      redirectTo,
      signInWithOAuth: (input) => supabase.auth.signInWithOAuth(input),
      setSession: (input) => supabase.auth.setSession(input),
      openAuthSessionAsync: WebBrowser.openAuthSessionAsync,
      getQueryParams: QueryParams.getQueryParams,
    })
  );
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
