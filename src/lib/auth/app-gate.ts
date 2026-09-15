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

export const ROOT_ROUTE_NAMES = ['loading', '(onboarding)', ...APP_ROUTE_NAMES] as const;

export type RootRouteName = (typeof ROOT_ROUTE_NAMES)[number];

export function needsRouteReplacement(
  currentSegment: string | undefined,
  target: AuthRoute
): boolean {
  if (target === '/(onboarding)/equipment') {
    return currentSegment !== '(onboarding)' && currentSegment !== 'scan';
  }
  return currentSegment === '(onboarding)';
}

export function appGatePhase(
  hydrated: boolean,
  currentSegment: string | undefined,
  target: AuthRoute
): AppGatePhase {
  if (!hydrated) return 'loading';
  return needsRouteReplacement(currentSegment, target) ? 'redirecting' : 'ready';
}

export function rootRouteIsAvailable(
  routeName: RootRouteName,
  phase: AppGatePhase,
  target: AuthRoute
): boolean {
  if (phase === 'loading') return routeName === 'loading';
  if (target === '/(onboarding)/equipment') {
    return routeName === '(onboarding)' || routeName === 'scan';
  }
  return APP_ROUTE_NAMES.some((appRouteName) => appRouteName === routeName);
}
