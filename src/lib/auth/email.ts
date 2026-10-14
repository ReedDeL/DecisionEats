import { supabase } from '@/lib/supabase';

import { AUTH_CALLBACK_PATH, PASSWORD_RESET_PATH, resolveAuthRedirectUri } from './redirect-uri';

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function signUpWithEmail(email: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail(email),
    password,
    options: { emailRedirectTo: resolveAuthRedirectUri(AUTH_CALLBACK_PATH) },
  });
  if (error) throw error;
  return data.session === null;
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail(email),
    password,
  });
  if (error) throw error;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail(email), {
    redirectTo: resolveAuthRedirectUri(PASSWORD_RESET_PATH),
  });
  if (error) throw error;
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export function emailAuthErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('already registered') || message.includes('already exists')) {
    return 'An account may already use this email. Sign in or reset your password.';
  }
  if (message.includes('password') && (message.includes('length') || message.includes('short'))) {
    return 'Use a longer password and try again.';
  }
  if (message.includes('email') && message.includes('valid')) {
    return 'Enter a valid email address.';
  }
  if (message.includes('rate limit') || message.includes('too many')) {
    return 'Too many attempts. Wait a little and try again.';
  }
  return 'We could not complete that request. Check your details and connection, then try again.';
}
