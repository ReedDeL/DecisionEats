import type { AuthRoute } from './session-route';

export { authRoute, type AuthRoute, type AuthRouteInput } from './session-route';

export type AppGatePhase = 'loading' | 'redirecting' | 'ready';

const APP_ROUTE_NAMES = [
  '(tabs)',
  'recipe/[id]',
  'scan',
  'settings',
  'image-credits',
  'kitchen-setup',
  'reminders',
  // Saved cook-mode links remain gated like recipe links, then redirect.
  'cook/[id]',
] as const;

const PUBLIC_ROUTE_NAMES = ['login', 'auth/callback', 'auth/reset-password'] as const;

export const ROOT_ROUTE_NAMES = [
  'loading',
  ...PUBLIC_ROUTE_NAMES,
  '(onboarding)',
  ...APP_ROUTE_NAMES,
] as const;

export type RootRouteName = (typeof ROOT_ROUTE_NAMES)[number];

export function needsRouteReplacement(
  currentSegment: string | undefined,
  target: AuthRoute,
  preserveLogin = false
): boolean {
  if (currentSegment === 'auth') return false;
  if (target === '/login') return currentSegment !== 'login';
  if (currentSegment === 'login' && preserveLogin) return false;
  if (target === '/(onboarding)/equipment') {
    return currentSegment !== '(onboarding)' && currentSegment !== 'scan';
  }
  return currentSegment === '(onboarding)' || currentSegment === 'login';
}

export function appGatePhase(
  hydrated: boolean,
  currentSegment: string | undefined,
  target: AuthRoute,
  preserveLogin = false
): AppGatePhase {
  if (!hydrated) return 'loading';
  return needsRouteReplacement(currentSegment, target, preserveLogin) ? 'redirecting' : 'ready';
}

export function rootRouteIsAvailable(
  routeName: RootRouteName,
  phase: AppGatePhase,
  target: AuthRoute
): boolean {
  if ((PUBLIC_ROUTE_NAMES as readonly string[]).includes(routeName)) return true;
  if (phase === 'loading') return routeName === 'loading';
  if (target === '/login') return false;
  if (target === '/(onboarding)/equipment') {
    return routeName === '(onboarding)' || routeName === 'scan';
  }
  return APP_ROUTE_NAMES.some((appRouteName) => appRouteName === routeName);
}
