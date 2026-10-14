import * as QueryParams from 'expo-auth-session/build/QueryParams';

import { supabase } from '@/lib/supabase';

export type AuthCallbackResult = 'signed-in' | 'cancelled';

/** Handles native deep links. Web callbacks are parsed by Supabase at startup. */
export async function completeNativeAuthCallback(url: string): Promise<AuthCallbackResult> {
  const { errorCode, params } = QueryParams.getQueryParams(url);
  const errorCodeValue = errorCode ?? params.error ?? params.error_code;
  if (errorCodeValue === 'access_denied') return 'cancelled';
  if (errorCodeValue) throw new Error('Authentication was not completed.');

  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw new Error('The sign-in link could not be verified.');
    return 'signed-in';
  }

  if (params.access_token && params.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) throw new Error('The sign-in link could not be verified.');
    return 'signed-in';
  }

  throw new Error('The sign-in link did not contain a session.');
}

export function webAuthCallbackHasError(url: string): boolean {
  try {
    const parsed = new URL(url);
    const params = new URLSearchParams(parsed.search);
    const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
    const hashParams = new URLSearchParams(hash);
    return Boolean(
      params.get('error') ||
      params.get('error_code') ||
      hashParams.get('error') ||
      hashParams.get('error_code')
    );
  } catch {
    return true;
  }
}
