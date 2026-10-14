import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { completeNativeAuthCallback } from '@/lib/auth/callback';
import { updatePassword } from '@/lib/auth/email';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const incomingUrl = Linking.useURL();
  const { color } = useTheme();
  const { isAuthenticated, isLoading } = useAuthSession();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [nativeLinkChecked, setNativeLinkChecked] = useState(Platform.OS === 'web');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    const completeLink = async () => {
      const url = incomingUrl ?? (await Linking.getInitialURL());
      if (!url) {
        if (active) setError('Open the newest password reset link on this device.');
        if (active) setNativeLinkChecked(true);
        return;
      }
      try {
        await completeNativeAuthCallback(url);
      } catch {
        if (active) setError('This reset link is invalid or expired. Request a new one.');
      } finally {
        if (active) setNativeLinkChecked(true);
      }
    };
    void completeLink();
    return () => {
      active = false;
    };
  }, [incomingUrl]);

  const handleUpdate = async () => {
    setError(null);
    setMessage(null);
    if (password.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setIsWorking(true);
    try {
      await updatePassword(password);
      setMessage('Your password has been updated.');
      router.replace('/');
    } catch {
      setError('We could not update the password. Request a new reset link and try again.');
    } finally {
      setIsWorking(false);
    }
  };

  const canUpdate = isAuthenticated && !isLoading && nativeLinkChecked;

  return (
    <Screen>
      <View style={styles.content}>
        <Text variant="display">Reset password</Text>
        {canUpdate ? (
          <>
            <Text variant="body" tone="muted">
              Choose a new password for your account.
            </Text>
            <TextInput
              accessibilityLabel="New password"
              accessibilityHint="Enter a new password with at least 8 characters"
              autoCapitalize="none"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              placeholderTextColor={color.textMuted}
              secureTextEntry
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
              style={[
                styles.input,
                { color: color.text, borderColor: color.border, backgroundColor: color.surface },
              ]}
            />
            <TextInput
              accessibilityLabel="Confirm new password"
              accessibilityHint="Enter the new password again to confirm"
              autoCapitalize="none"
              autoComplete="new-password"
              placeholder="Enter it again"
              placeholderTextColor={color.textMuted}
              secureTextEntry
              textContentType="newPassword"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              style={[
                styles.input,
                { color: color.text, borderColor: color.border, backgroundColor: color.surface },
              ]}
            />
            {error ? (
              <Text accessibilityLiveRegion="polite" tone="default">
                {error}
              </Text>
            ) : null}
            {message ? (
              <Text accessibilityLiveRegion="polite" tone="muted">
                {message}
              </Text>
            ) : null}
            <PrimaryButton
              label={isWorking ? 'Updating…' : 'Update password'}
              onPress={() => void handleUpdate()}
              accessibilityHint="Saves the new password for your account"
              disabled={isWorking}
              loading={isWorking}
            />
          </>
        ) : isLoading || !nativeLinkChecked ? (
          <>
            <ActivityIndicator color={color.accent} />
            <Text variant="body" tone="muted">
              Checking your reset link…
            </Text>
          </>
        ) : (
          <>
            <Text variant="body" tone="muted">
              {error ?? 'Open the newest reset link in the same browser where you requested it.'}
            </Text>
            <PrimaryButton
              label="Return to sign in"
              onPress={() => router.replace('/login')}
              accessibilityHint="Returns to sign in so you can request another reset link"
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: space.md },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: space.md,
    fontSize: 16,
  },
});
