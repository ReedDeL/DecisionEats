import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { completeNativeAuthCallback, webAuthCallbackHasError } from '@/lib/auth/callback';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const incomingUrl = Linking.useURL();
  const { color } = useTheme();
  const { isAuthenticated, isLoading } = useAuthSession();
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || isLoading) return;
    if (isAuthenticated) {
      router.replace('/');
      return;
    }
    const callbackHasError =
      typeof window !== 'undefined' && webAuthCallbackHasError(window.location.href);
    setStatus(
      callbackHasError
        ? 'The sign-in was cancelled or could not be completed.'
        : 'We could not restore a session from this browser callback. Try again from this same site.'
    );
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    const finishNativeCallback = async () => {
      const url = incomingUrl ?? (await Linking.getInitialURL());
      if (!url) {
        if (active) setStatus('The sign-in link did not open DecisionEats.');
        return;
      }
      try {
        const result = await completeNativeAuthCallback(url);
        if (active && result === 'cancelled') {
          setStatus('Google sign-in was cancelled.');
        }
      } catch {
        if (active)
          setStatus('The sign-in link could not be verified. Open a new link and try again.');
      }
    };
    void finishNativeCallback();
    return () => {
      active = false;
    };
  }, [incomingUrl]);

  useEffect(() => {
    if (Platform.OS !== 'web' && !isLoading && isAuthenticated) router.replace('/');
  }, [isAuthenticated, isLoading, router]);

  return (
    <Screen>
      <View style={styles.content}>
        {status ? (
          <>
            <Text variant="heading">Sign-in didn’t finish</Text>
            <Text variant="body" tone="muted">
              {status}
            </Text>
            <PrimaryButton
              label="Return to sign in"
              onPress={() => router.replace('/login')}
              accessibilityHint="Returns to the account sign-in screen"
            />
          </>
        ) : (
          <>
            <ActivityIndicator color={color.accent} />
            <Text variant="body" tone="muted">
              Finishing sign-in…
            </Text>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
});
