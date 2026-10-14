import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useGlobalSearchParams, usePathname, useRouter, useSegments } from 'expo-router';
import { PostHogProvider } from 'posthog-react-native';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppState, Platform } from 'react-native';

import { AnalyticsObserver } from '@/components/AnalyticsObserver';
import { ContinuousOnboardingPrompt } from '@/components/ContinuousOnboardingPrompt';
import { MobileViewport } from '@/components/MobileViewport';
import { isAnalyticsConfigured, isApprovedAnalyticsEvent } from '@/lib/analytics';
import {
  appGatePhase,
  authRoute,
  ROOT_ROUTE_NAMES,
  rootRouteIsAvailable,
} from '@/lib/auth/app-gate';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import { useGuestChoice } from '@/lib/auth/guest-access';
import { getJSON } from '@/lib/storage';
import { configureMealPrepNotifications } from '@/lib/meal-prep-notifications';
import { pantrySync } from '@/lib/pantry-sync-live';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { GUEST_PANTRY_KEY, useKitchenStore } from '@/store/kitchen';
import { useTheme } from '@/theme/useTheme';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import LoadingScreen from './loading';

const posthogApiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? '';
const posthogHost = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

const posthogOptions = {
  host: posthogHost,
  captureAppLifecycleEvents: false,
  enableSessionReplay: false,
  preloadFeatureFlags: false,
  disableRemoteFeatureFlags: true,
  disableGeoip: true,
  errorTracking: { autocapture: false },
  before_send: (event: { event: string } | null) => {
    if (!event) return null;
    return event.event === '$identify' || isApprovedAnalyticsEvent(event.event) ? event : null;
  },
};

export default function RootLayout() {
  const { isDark } = useTheme();

  useEffect(() => {
    configureMealPrepNotifications().catch((error: unknown) => {
      console.warn('[notifications] Unable to configure', error);
    });
  }, []);

  return (
    <AnalyticsProvider>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <PantryAuthObserver />
          <MobileViewport>
            <AppGate />
          </MobileViewport>
        </SafeAreaProvider>
      </QueryClientProvider>
    </AnalyticsProvider>
  );
}

function PantryAuthObserver() {
  useEffect(() => {
    let mounted = true;
    let authEventSeen = false;
    let active =
      Platform.OS === 'web'
        ? document.visibilityState === 'visible'
        : AppState.currentState === 'active';
    const refresh = (reconnected = false) => {
      if (!mounted || !active || !pantrySync.getState().userId) return;
      if (pantrySync.getState().phase === 'error') {
        if (reconnected) void pantrySync.retry();
      } else void pantrySync.refresh();
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventSeen = true;
      if (mounted) void pantrySync.setIdentity(session?.user.id ?? null);
    });
    void supabase.auth.getSession().then(({ data: sessionData, error }) => {
      if (mounted && !authEventSeen) {
        void pantrySync.setIdentity(error ? null : (sessionData.session?.user.id ?? null));
      }
    });
    const appSubscription = AppState.addEventListener('change', (status) => {
      active = status === 'active';
      if (active) refresh(true);
    });
    const interval = setInterval(refresh, 30_000);
    const onOnline = () => refresh(true);
    const onVisibility = () => {
      if (Platform.OS !== 'web') return;
      active = document.visibilityState === 'visible';
      if (active) refresh(true);
    };
    if (Platform.OS === 'web') {
      window.addEventListener('online', onOnline);
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      mounted = false;
      clearInterval(interval);
      appSubscription.remove();
      if (Platform.OS === 'web') {
        window.removeEventListener('online', onOnline);
        document.removeEventListener('visibilitychange', onVisibility);
      }
      data.subscription.unsubscribe();
      void pantrySync.setIdentity(null);
    };
  }, []);
  return null;
}

function AnalyticsProvider({ children }: { children: ReactNode }) {
  if (!isAnalyticsConfigured(posthogApiKey)) return children;

  return (
    <PostHogProvider apiKey={posthogApiKey} options={posthogOptions} autocapture={false}>
      <AnalyticsObserver />
      {children}
    </PostHogProvider>
  );
}

/**
 * Sends a first-run local user through onboarding and keeps a returning one
 * out of it. Until storage and auth load, a neutral loading screen withholds
 * the navigator; after that, only the destination group can mount while an
 * explicit replacement finishes. Account and sync controls live in Settings.
 *
 * The equipment tier and allergen list are hard constraints the engine cannot
 * do without, so this is a gate rather than a prompt: there is no "skip"
 * through the equipment screen, only through the optional restrictions one.
 */
function AppGate() {
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ intent?: string }>();
  const kitchen = useKitchenStore();
  const { isLoading: isAuthLoading, isAuthenticated } = useAuthSession();
  const hasGuestChoice = useGuestChoice();
  const hydrated = useStoreHydrated();
  const [visitedFirstRunThisSession, setVisitedFirstRunThisSession] = useState(false);
  const guestPantry = getJSON<string[]>(GUEST_PANTRY_KEY) ?? [];
  const hasExistingLocalKitchen =
    kitchen.onboardingDone ||
    kitchen.equipment.length > 0 ||
    kitchen.allergens.length > 0 ||
    kitchen.dietary.length > 0 ||
    kitchen.pantry.length > 0 ||
    guestPantry.length > 0 ||
    kitchen.weeklyPlan !== null ||
    kitchen.bodyGoal !== null ||
    kitchen.bodyMetrics.heightCentimeters !== null ||
    kitchen.bodyMetrics.weightKilograms !== null ||
    kitchen.dislikedRecipes.length > 0 ||
    kitchen.skippedRecipes.length > 0;
  const target = authRoute({
    onboardingDone: kitchen.onboardingDone,
    hasExistingLocalKitchen,
    hasGuestChoice,
    isAuthenticated,
  });
  const currentSegment = segments[0];
  const preserveLogin = currentSegment === 'login' && params.intent === 'account';
  const phase = appGatePhase(hydrated && !isAuthLoading, currentSegment, target, preserveLogin);

  useEffect(() => {
    if (hydrated && currentSegment === '(onboarding)') setVisitedFirstRunThisSession(true);
  }, [hydrated, currentSegment]);

  useEffect(() => {
    if (phase === 'redirecting') router.replace(target);
  }, [phase, router, target]);

  // A protected route removed during hydration is discarded by the navigator.
  // Wait before mounting it so an authorized deep link keeps its destination.
  if (phase === 'loading') return <LoadingScreen />;

  return (
    <>
      <Stack screenOptions={{ headerShown: false, animation: reducedMotion ? 'none' : 'fade' }}>
        {ROOT_ROUTE_NAMES.map((routeName) => (
          <Stack.Protected key={routeName} guard={rootRouteIsAvailable(routeName, phase, target)}>
            <Stack.Screen name={routeName} />
          </Stack.Protected>
        ))}
      </Stack>
      <ContinuousOnboardingPrompt
        enabled={
          phase === 'ready' &&
          !visitedFirstRunThisSession &&
          target === '/' &&
          currentSegment === '(tabs)' &&
          (pathname === '/' || pathname === '/plan')
        }
        journey={pathname === '/plan' ? 'week' : 'now'}
      />
    </>
  );
}

/**
 * Both storage backends are synchronous, so hydration completes almost
 * immediately — but `persist` still resolves it through a promise, and acting
 * one render too early is what makes a gate flicker.
 */
function useStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useKitchenStore.persist.hasHydrated());

  useEffect(() => {
    const unsubscribe = useKitchenStore.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(useKitchenStore.persist.hasHydrated());
    return unsubscribe;
  }, []);

  return hydrated;
}
