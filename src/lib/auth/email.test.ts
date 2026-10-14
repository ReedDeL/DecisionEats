import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
    },
  },
}));
vi.mock('expo-auth-session', () => ({ makeRedirectUri: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

import { supabase } from '@/lib/supabase';

import {
  emailAuthErrorMessage,
  requestPasswordReset,
  signInWithEmail,
  signUpWithEmail,
  updatePassword,
} from './email';

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('email auth actions', () => {
  it('normalizes email and sends signup confirmation to the same-origin callback', async () => {
    vi.stubGlobal('location', { origin: 'http://localhost' });
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    } as never);

    await expect(signUpWithEmail('  USER@Example.com ', 'long-password')).resolves.toBe(true);
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'long-password',
      options: { emailRedirectTo: 'http://localhost/auth/callback' },
    });
  });

  it('signs in with an email and password', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    } as never);

    await signInWithEmail('USER@Example.com', 'secret');
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'secret',
    });
  });

  it('sends password-reset links to the same-origin reset route', async () => {
    vi.stubGlobal('location', { origin: 'http://localhost' });
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({ data: {}, error: null });

    await requestPasswordReset('USER@Example.com');
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
      redirectTo: 'http://localhost/auth/reset-password',
    });
  });

  it('updates the password for the active recovery session', async () => {
    vi.mocked(supabase.auth.updateUser).mockResolvedValue({
      data: { user: null },
      error: null,
    } as never);

    await updatePassword('new-password');
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'new-password' });
  });

  it('maps common provider errors to clear and safe copy', () => {
    expect(emailAuthErrorMessage(new Error('Invalid login credentials'))).toContain(
      'Check your details'
    );
    expect(emailAuthErrorMessage(new Error('User already registered'))).toContain(
      'Sign in or reset'
    );
  });
});
