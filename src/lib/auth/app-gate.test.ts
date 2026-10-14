import { describe, expect, it } from 'vitest';

import { appGatePhase, needsRouteReplacement, rootRouteIsAvailable } from '@/lib/auth/app-gate';

const CURRENT_DYNAMIC_APP_ROUTES = ['recipe/[id]', 'kitchen-setup', 'reminders'] as const;

describe('app gate routing', () => {
  it('keeps login and callback routes public while a session is restored', () => {
    expect(rootRouteIsAvailable('login', 'loading', '/login')).toBe(true);
    expect(rootRouteIsAvailable('auth/callback', 'loading', '/login')).toBe(true);
    expect(rootRouteIsAvailable('auth/reset-password', 'loading', '/login')).toBe(true);
    expect(needsRouteReplacement('auth', '/login')).toBe(false);
  });

  it('routes a first-time visitor to login without exposing the kitchen', () => {
    expect(needsRouteReplacement(undefined, '/login')).toBe(true);
    expect(rootRouteIsAvailable('login', 'ready', '/login')).toBe(true);
    expect(rootRouteIsAvailable('(tabs)', 'ready', '/login')).toBe(false);
  });

  it('keeps an intentional account entry open for a guest', () => {
    expect(needsRouteReplacement('login', '/(onboarding)/equipment', true)).toBe(false);
    expect(appGatePhase(true, 'login', '/(onboarding)/equipment', true)).toBe('ready');
    expect(rootRouteIsAvailable('login', 'ready', '/(onboarding)/equipment')).toBe(true);
  });

  it('returns an incidental login route to an existing local kitchen', () => {
    expect(needsRouteReplacement('login', '/')).toBe(true);
    expect(needsRouteReplacement('login', '/(onboarding)/equipment')).toBe(true);
  });

  it('replaces an app route with onboarding for a new local user', () => {
    expect(needsRouteReplacement(undefined, '/(onboarding)/equipment')).toBe(true);
    expect(needsRouteReplacement('(tabs)', '/(onboarding)/equipment')).toBe(true);
    expect(needsRouteReplacement('(onboarding)', '/(onboarding)/equipment')).toBe(false);
    expect(needsRouteReplacement('scan', '/(onboarding)/equipment')).toBe(false);
  });

  it('shows only the neutral route while the local store is hydrating', () => {
    expect(appGatePhase(false, undefined, '/')).toBe('loading');
    expect(appGatePhase(false, '(onboarding)', '/(onboarding)/equipment')).toBe('loading');
  });

  it('withholds the current route until its segment matches the target', () => {
    expect(appGatePhase(true, undefined, '/(onboarding)/equipment')).toBe('redirecting');
    expect(appGatePhase(true, '(onboarding)', '/(onboarding)/equipment')).toBe('ready');
    expect(appGatePhase(true, 'scan', '/(onboarding)/equipment')).toBe('ready');
    expect(appGatePhase(true, undefined, '/')).toBe('ready');
    expect(appGatePhase(true, '(onboarding)', '/')).toBe('redirecting');
    expect(appGatePhase(true, 'scan', '/')).toBe('ready');
  });

  it.each(CURRENT_DYNAMIC_APP_ROUTES)(
    'protects the %s route during onboarding but exposes it for a returning local user',
    (routeName) => {
      expect(rootRouteIsAvailable(routeName, 'loading', '/')).toBe(false);
      expect(rootRouteIsAvailable(routeName, 'redirecting', '/(onboarding)/equipment')).toBe(false);
      expect(rootRouteIsAvailable(routeName, 'redirecting', '/')).toBe(true);
      expect(rootRouteIsAvailable(routeName, 'ready', '/')).toBe(true);
    }
  );

  it('protects the legacy cook redirect during onboarding and exposes it after setup', () => {
    expect(rootRouteIsAvailable('cook/[id]', 'loading', '/')).toBe(false);
    expect(rootRouteIsAvailable('cook/[id]', 'redirecting', '/(onboarding)/equipment')).toBe(false);
    expect(rootRouteIsAvailable('cook/[id]', 'ready', '/')).toBe(true);
  });

  it('exposes onboarding and scan without exposing restricted app routes before setup is complete', () => {
    expect(rootRouteIsAvailable('(onboarding)', 'ready', '/(onboarding)/equipment')).toBe(true);
    expect(rootRouteIsAvailable('scan', 'ready', '/(onboarding)/equipment')).toBe(true);
    expect(rootRouteIsAvailable('(tabs)', 'ready', '/(onboarding)/equipment')).toBe(false);
    expect(rootRouteIsAvailable('settings', 'ready', '/(onboarding)/equipment')).toBe(false);
  });
});
