import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { signInWithGoogle } from '@/lib/auth/google';
import {
  emailAuthErrorMessage,
  requestPasswordReset,
  signInWithEmail,
  signUpWithEmail,
} from '@/lib/auth/email';
import { continueAsGuest } from '@/lib/auth/guest-access';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import { useKitchenStore } from '@/store/kitchen';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type LoginMode = 'sign-in' | 'sign-up' | 'reset';

export default function LoginScreen() {
  const router = useRouter();
  const { color } = useTheme();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthSession();
  const onboardingDone = useKitchenStore((state) => state.onboardingDone);
  const [mode, setMode] = useState<LoginMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) router.replace('/');
  }, [isAuthenticated, isAuthLoading, router]);

  const switchMode = (nextMode: LoginMode) => {
    setMode(nextMode);
    setError(null);
    setMessage(null);
  };

  const handleGoogle = async () => {
    setError(null);
    setMessage(null);
    setIsWorking(true);
    try {
      const result = await signInWithGoogle();
      if (result.type === 'cancelled') {
        setMessage('Google sign-in was cancelled.');
      } else if (result.type === 'signed-in') {
        router.replace('/');
      }
    } catch {
      setError('We could not start Google sign-in. Try again or use email.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleEmail = async () => {
    setError(null);
    setMessage(null);
    if (!email.trim() || !email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (mode !== 'reset' && password.length === 0) {
      setError('Enter your password.');
      return;
    }
    if (mode === 'sign-up' && password.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    if (mode === 'sign-up' && password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setIsWorking(true);
    try {
      if (mode === 'reset') {
        await requestPasswordReset(email);
        setMessage('If an account uses this email, a password reset link is on its way.');
      } else if (mode === 'sign-up') {
        const confirmationRequired = await signUpWithEmail(email, password);
        if (confirmationRequired) {
          setMessage('Check your email for a link to confirm your account.');
        } else {
          router.replace('/');
        }
      } else {
        await signInWithEmail(email, password);
        router.replace('/');
      }
    } catch (requestError: unknown) {
      setError(emailAuthErrorMessage(requestError));
    } finally {
      setIsWorking(false);
    }
  };

  const handleContinueAsGuest = () => {
    continueAsGuest();
    router.replace(onboardingDone ? '/' : '/(onboarding)/equipment');
  };

  const title =
    mode === 'sign-up'
      ? 'Create your account'
      : mode === 'reset'
        ? 'Reset your password'
        : 'Welcome back';

  return (
    <Screen>
      <View style={styles.content}>
        <View style={styles.intro}>
          <Text variant="display">DecisionEats</Text>
          <Text variant="heading">{title}</Text>
          <Text variant="body" tone="muted">
            Sign in to your account, or continue with a kitchen saved on this device.
          </Text>
        </View>

        <Card variant="alt">
          <View style={styles.form}>
            {mode !== 'reset' ? (
              <PrimaryButton
                label="Continue with Google"
                onPress={() => void handleGoogle()}
                accessibilityHint="Continues to Google sign-in and returns to this browser"
                disabled={isWorking}
                loading={isWorking}
              />
            ) : null}

            {mode !== 'reset' ? (
              <Text variant="caption" tone="muted" style={styles.separator}>
                Or use email
              </Text>
            ) : null}

            <View style={styles.field}>
              <Text variant="caption">Email</Text>
              <TextInput
                accessibilityLabel="Email"
                accessibilityHint="Enter the email associated with your account"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor={color.textMuted}
                returnKeyType={mode === 'reset' ? 'done' : 'next'}
                textContentType="emailAddress"
                value={email}
                onChangeText={setEmail}
                style={[
                  styles.input,
                  { color: color.text, borderColor: color.border, backgroundColor: color.surface },
                ]}
              />
            </View>

            {mode !== 'reset' ? (
              <>
                <View style={styles.field}>
                  <Text variant="caption">Password</Text>
                  <TextInput
                    accessibilityLabel="Password"
                    accessibilityHint="Enter your account password"
                    autoCapitalize="none"
                    autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                    placeholder={mode === 'sign-up' ? 'At least 8 characters' : 'Your password'}
                    placeholderTextColor={color.textMuted}
                    secureTextEntry
                    textContentType={mode === 'sign-up' ? 'newPassword' : 'password'}
                    value={password}
                    onChangeText={setPassword}
                    style={[
                      styles.input,
                      {
                        color: color.text,
                        borderColor: color.border,
                        backgroundColor: color.surface,
                      },
                    ]}
                  />
                </View>
                {mode === 'sign-up' ? (
                  <View style={styles.field}>
                    <Text variant="caption">Confirm password</Text>
                    <TextInput
                      accessibilityLabel="Confirm password"
                      accessibilityHint="Enter the same password again to confirm"
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
                        {
                          color: color.text,
                          borderColor: color.border,
                          backgroundColor: color.surface,
                        },
                      ]}
                    />
                  </View>
                ) : null}
              </>
            ) : null}

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
              label={
                isWorking
                  ? 'Please wait…'
                  : mode === 'sign-up'
                    ? 'Create account'
                    : mode === 'reset'
                      ? 'Send reset link'
                      : 'Sign in'
              }
              onPress={() => void handleEmail()}
              accessibilityHint={
                mode === 'reset'
                  ? 'Emails a password reset link if an account matches'
                  : mode === 'sign-up'
                    ? 'Creates an account with this email and password'
                    : 'Signs in with this email and password'
              }
              disabled={isWorking}
              loading={isWorking}
            />

            <View style={styles.links}>
              {mode === 'sign-in' ? (
                <>
                  <Text variant="caption" tone="muted">
                    New here?
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Create an account"
                    accessibilityHint="Switches to account sign-up"
                    onPress={() => switchMode('sign-up')}
                  >
                    <Text variant="caption" tone="accent">
                      Create an account
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Forgot password"
                    accessibilityHint="Opens the password reset form"
                    onPress={() => switchMode('reset')}
                  >
                    <Text variant="caption" tone="accent">
                      Forgot password?
                    </Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back to sign in"
                  accessibilityHint="Returns to the sign-in form"
                  onPress={() => switchMode('sign-in')}
                >
                  <Text variant="caption" tone="accent">
                    Back to sign in
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </Card>

        <View style={styles.guest}>
          <Text variant="bodyStrong">Prefer not to sign in?</Text>
          <Text variant="caption" tone="muted">
            Continue as a guest. Your local kitchen stays on this device.
          </Text>
          <PrimaryButton
            label="Continue as guest"
            variant="secondary"
            onPress={handleContinueAsGuest}
            accessibilityHint="Saves your guest choice and opens your local kitchen"
            disabled={isWorking}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: space.lg },
  intro: { gap: space.xs },
  form: { gap: space.md },
  separator: { textAlign: 'center', paddingVertical: space.xs },
  field: { gap: space.xs },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: space.md,
    fontSize: 16,
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingTop: space.xs,
  },
  guest: { alignItems: 'center', gap: space.sm },
});
