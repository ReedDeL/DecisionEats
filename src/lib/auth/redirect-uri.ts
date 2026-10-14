import { makeRedirectUri } from 'expo-auth-session';
import { Platform } from 'react-native';

export const AUTH_CALLBACK_PATH = '/auth/callback' as const;
export const PASSWORD_RESET_PATH = '/auth/reset-password' as const;

export type AuthRedirectPath = typeof AUTH_CALLBACK_PATH | typeof PASSWORD_RESET_PATH;

/**
 * Keep browser auth returns on the origin that started the flow. Supabase
 * stores web sessions by origin, so returning to a canonical host from a
 * preview or localhost can look like a successful callback with no session.
 */
export function resolveWebAuthRedirectUri(
  currentOrigin: string,
  path: AuthRedirectPath,
  configuredOrigin = process.env.EXPO_PUBLIC_SITE_URL
): string {
  const browserUrl = new URL(currentOrigin);
  if (browserUrl.protocol !== 'http:' && browserUrl.protocol !== 'https:') {
    throw new Error('Authentication requires an HTTP or HTTPS browser origin.');
  }

  let configuredBrowserOrigin: string | null = null;
  if (configuredOrigin?.trim()) {
    try {
      configuredBrowserOrigin = new URL(configuredOrigin.trim()).origin;
    } catch {
      configuredBrowserOrigin = null;
    }
  }

  const redirectOrigin =
    configuredBrowserOrigin === browserUrl.origin ? configuredBrowserOrigin : browserUrl.origin;
  return redirectOrigin + path;
}

export function resolveAuthRedirectUri(path: AuthRedirectPath): string {
  if (Platform.OS === 'web') {
    return resolveWebAuthRedirectUri(
      globalThis.location.origin,
      path,
      process.env.EXPO_PUBLIC_SITE_URL
    );
  }
  return makeRedirectUri({ path: path.slice(1) });
}
