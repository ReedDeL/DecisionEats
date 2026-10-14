import { describe, expect, it } from 'vitest';

import { authRoute } from '@/lib/auth/session-route';

describe('authRoute', () => {
  it('sends a first-time visitor to the login choices', () => {
    expect(authRoute({ onboardingDone: false })).toBe('/login');
  });

  it('lets a new guest continue to onboarding', () => {
    expect(authRoute({ onboardingDone: false, hasGuestChoice: true })).toBe(
      '/(onboarding)/equipment'
    );
  });

  it('keeps an existing local kitchen available before onboarding is complete', () => {
    expect(authRoute({ onboardingDone: false, hasExistingLocalKitchen: true })).toBe(
      '/(onboarding)/equipment'
    );
  });

  it('sends a returning local user home', () => {
    expect(authRoute({ onboardingDone: true })).toBe('/');
  });

  it('sends an authenticated first-time account through onboarding', () => {
    expect(authRoute({ onboardingDone: false, isAuthenticated: true })).toBe(
      '/(onboarding)/equipment'
    );
  });
});
