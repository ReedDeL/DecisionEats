export type AuthRoute = '/login' | '/(onboarding)/equipment' | '/';

export interface AuthRouteInput {
  onboardingDone: boolean;
  hasExistingLocalKitchen?: boolean;
  hasGuestChoice?: boolean;
  isAuthenticated?: boolean;
}

export function authRoute(input: AuthRouteInput): AuthRoute {
  const hasLocalAccess =
    input.onboardingDone ||
    input.hasExistingLocalKitchen === true ||
    input.hasGuestChoice === true ||
    input.isAuthenticated === true;
  if (!hasLocalAccess) return '/login';
  return input.onboardingDone ? '/' : '/(onboarding)/equipment';
}
