import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { PhotoTastePicker, usePhotoTasteOptions } from '@/components/PhotoTastePicker';

import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Text } from '@/components/ui/Text';
import type {
  ContinuousOnboardingProgress,
  ContinuousOnboardingPromptKind,
  ContinuousOnboardingPromptState,
  MealJourney,
} from '@/contracts/meal-journeys';
import {
  chooseContinuousOnboardingPrompt,
  resolveContinuousOnboardingPrompt,
} from '@/engine/onboarding-prompt';
import { useKitchenStore } from '@/store/kitchen';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { useReducedMotion } from '@/lib/use-reduced-motion';

const INITIAL_STATE: ContinuousOnboardingPromptState = {
  shownThisSession: false,
  activePrompt: null,
};

const COPY = {
  photo_taste: {
    title: 'Which meals appeal to you?',
    detail: 'Choose optional meal preferences for Now.',
    action: 'Choose meal photos',
  },
  week_preference: {
    title: 'Make this week fit you',
    detail: 'Choose the days, meals, cooking style, and variety you want for your plan.',
    action: 'Choose week preferences',
  },
  body_profile: {
    title: 'Want to personalize your meals?',
    detail:
      'A goal and optional height and weight can guide your choices. Body details stay on this device.',
    action: 'Open goals',
  },
  reminder: {
    title: 'Want a cooking reminder?',
    detail: 'Choose whether to get a nudge before a meal in your confirmed weekly plan.',
    action: 'Set reminders',
  },
} as const;

type AvailableKind = keyof typeof COPY;

interface Props {
  enabled: boolean;
  journey: MealJourney;
}

/** One session slot shared by Now and Plan, with completion borrowed from existing local controls. */
export function ContinuousOnboardingPrompt({ enabled, journey }: Props) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { color } = useTheme();
  const bodyGoal = useKitchenStore((state) => state.bodyGoal);
  const bodyMetrics = useKitchenStore((state) => state.bodyMetrics);
  const weeklyPlan = useKitchenStore((state) => state.weeklyPlan);
  const reminderComplete = useKitchenStore((state) => state.mealPrepReminderOnboardingComplete);
  const photoTasteSignals = useKitchenStore((state) => state.photoTasteSignals);
  const photoOptions = usePhotoTasteOptions();
  const [state, setState] = useState<ContinuousOnboardingPromptState>(INITIAL_STATE);

  const progress: ContinuousOnboardingProgress = {
    // The first-run flow already presented restrictions before the app journey opened.
    safetyCompleted: true,
    weekPreferenceCompleted: weeklyPlan?.status === 'confirmed',
    photoTasteCompleted: photoTasteSignals.length > 0,
    bodyProfileCompleted:
      bodyGoal !== null ||
      bodyMetrics.heightCentimeters !== null ||
      bodyMetrics.weightKilograms !== null,
    reminderCompleted: reminderComplete,
    updatedAt: new Date().toISOString(),
  };

  useEffect(() => {
    if (!enabled || state.shownThisSession) return;
    const availablePrompts: ContinuousOnboardingPromptKind[] = [
      ...(journey === 'week' ? (['week_preference'] as const) : []),
      ...(journey === 'now' && photoOptions.length > 0 ? (['photo_taste'] as const) : []),
      'body_profile',
      ...(Platform.OS !== 'web' && weeklyPlan?.status === 'confirmed'
        ? (['reminder'] as const)
        : []),
    ];
    const next = chooseContinuousOnboardingPrompt({
      journey,
      progress,
      state,
      availablePrompts,
    });
    if (next) setState(next.state);
  }, [
    enabled,
    journey,
    state,
    bodyGoal,
    bodyMetrics.heightCentimeters,
    bodyMetrics.weightKilograms,
    weeklyPlan?.status,
    reminderComplete,
    photoTasteSignals.length,
    photoOptions.length,
  ]);

  const kind = state.activePrompt as AvailableKind | null;
  const close = () => {
    setState(resolveContinuousOnboardingPrompt({ outcome: 'skipped', progress, state }).state);
  };
  const openControls = () => {
    if (!kind) return;
    close(); // Opening a screen is not an answer; the existing control supplies completion.
    if (kind === 'body_profile') router.push('/settings');
    if (kind === 'reminder') router.push('/reminders');
    // Week preferences are already on the current Plan screen.
  };

  return (
    <Modal
      visible={enabled && kind !== null}
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={close}
      accessibilityViewIsModal
    >
      <View style={[styles.frame, { backgroundColor: color.bg }]}>
        {kind === 'photo_taste' ? (
          <ScrollView contentContainerStyle={styles.content}>
            <PhotoTastePicker
              onDone={() =>
                setState(
                  resolveContinuousOnboardingPrompt({ outcome: 'answered', progress, state }).state
                )
              }
              onSkip={close}
            />
          </ScrollView>
        ) : kind ? (
          <Card variant="alt">
            <View style={styles.content}>
              <Text variant="heading">{COPY[kind].title}</Text>
              <Text variant="body" tone="muted">
                {COPY[kind].detail}
              </Text>
              <PrimaryButton
                label={COPY[kind].action}
                onPress={openControls}
                accessibilityHint="Opens the existing controls for this preference"
              />
              <PrimaryButton
                label="Not now"
                variant="ghost"
                onPress={close}
                accessibilityHint="Skips this prompt for this app session without saving a choice"
              />
            </View>
          </Card>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    justifyContent: 'center',
    padding: space.lg,
  },
  content: {
    gap: space.md,
    borderRadius: radius.lg,
  },
});
