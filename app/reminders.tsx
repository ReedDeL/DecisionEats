import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Header } from '@/components/ui/Header';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { BUNDLED_CATALOG } from '@/data/catalog';
import {
  getMealPrepReminderPermission,
  requestMealPrepReminderPermission,
  syncMealPrepReminders,
  type MealPrepReminderPermission,
} from '@/lib/meal-prep-notifications';
import {
  getUpcomingMealPrepReminders,
  toMealPrepReminderEntries,
} from '@/lib/meal-prep-reminder-view';
import {
  MEAL_PREP_REMINDER_LEAD_MINUTES,
  type MealPrepReminderLeadMinutes,
} from '@/lib/meal-prep-reminder';
import { useKitchenStore } from '@/store/kitchen';
import { space } from '@/theme/tokens';

const REMINDER_LEAD_LABELS: Record<MealPrepReminderLeadMinutes, string> = {
  0: 'At cook time',
  10: '10 min early',
  15: '15 min early',
  30: '30 min early',
  60: '60 min early',
};

type OnboardingStep = 'explain' | 'permission' | 'timing' | 'complete';

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export default function RemindersScreen() {
  const router = useRouter();
  const enabled = useKitchenStore((state) => state.mealPrepRemindersEnabled);
  const leadMinutes = useKitchenStore((state) => state.mealPrepReminderLeadMinutes);
  const onboardingComplete = useKitchenStore((state) => state.mealPrepReminderOnboardingComplete);
  const weeklyPlan = useKitchenStore((state) => state.weeklyPlan);
  const setEnabled = useKitchenStore((state) => state.setMealPrepRemindersEnabled);
  const setLeadMinutes = useKitchenStore((state) => state.setMealPrepReminderLeadMinutes);
  const setOnboardingComplete = useKitchenStore(
    (state) => state.setMealPrepReminderOnboardingComplete
  );
  const [step, setStep] = useState<OnboardingStep>(() =>
    onboardingComplete ? 'complete' : 'explain'
  );
  const [permission, setPermission] = useState<MealPrepReminderPermission>(
    Platform.OS === 'web' ? 'unsupported' : 'undetermined'
  );
  const [permissionError, setPermissionError] = useState(false);

  const entries = useMemo(
    () => toMealPrepReminderEntries(weeklyPlan, BUNDLED_CATALOG),
    [weeklyPlan]
  );

  useEffect(() => {
    let active = true;
    void getMealPrepReminderPermission().then((next) => {
      if (active) setPermission(next);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void syncMealPrepReminders(entries, { enabled, leadMinutes }).catch((error: unknown) => {
      console.warn('[reminders] Unable to sync reminders', error);
    });
  }, [entries, enabled, leadMinutes]);

  const upcoming =
    enabled && permission === 'granted'
      ? getUpcomingMealPrepReminders(entries, leadMinutes, new Date())
      : [];

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  };

  const requestPermission = async () => {
    setPermissionError(false);
    if (Platform.OS === 'web') {
      setPermission('unsupported');
      setStep('timing');
      return;
    }
    try {
      const granted = await requestMealPrepReminderPermission();
      const next = granted ? 'granted' : 'denied';
      setPermission(next);
      if (granted) {
        setEnabled(true);
        setStep('timing');
      } else setPermissionError(true);
    } catch (error: unknown) {
      console.warn('[reminders] Unable to request permission', error);
      setPermission('denied');
      setPermissionError(true);
    }
  };

  const completeTiming = (minutes: MealPrepReminderLeadMinutes) => {
    setLeadMinutes(minutes);
    setOnboardingComplete(true);
    setStep('complete');
  };

  const handleToggle = async (nextEnabled: boolean) => {
    setPermissionError(false);
    if (!nextEnabled) {
      setEnabled(false);
      return;
    }
    if (Platform.OS === 'web') return;
    try {
      const granted = await requestMealPrepReminderPermission();
      if (granted) {
        setPermission('granted');
        setEnabled(true);
      } else {
        setPermission('denied');
        setEnabled(false);
        setPermissionError(true);
      }
    } catch (error: unknown) {
      console.warn('[reminders] Unable to request permission', error);
      setPermission('denied');
      setEnabled(false);
      setPermissionError(true);
    }
  };

  const openPlatformSettings = () => {
    if (Platform.OS !== 'web') {
      void Linking.openSettings().catch((error: unknown) => {
        console.warn('[reminders] Unable to open platform settings', error);
      });
    }
  };

  if (step === 'explain') {
    return (
      <Screen
        header={
          <Header
            onBack={handleBack}
            backLabel="Back"
            backAccessibilityLabel="Back"
            backHint="Returns to the previous screen"
            fallbackHref="/settings"
          />
        }
      >
        <View style={styles.header}>
          <Text variant="display">Cooking reminders</Text>
          <Text variant="body" tone="muted">
            A small nudge before it is time to start.
          </Text>
        </View>
        <Card variant="alt">
          <Text variant="heading">How reminders work</Text>
          <Text variant="body">
            DecisionEats creates reminders only for concrete meals in a confirmed weekly plan.
            Drafts, one-off Now choices, and “Decide that day” entries never create a reminder.
          </Text>
        </Card>
        <PrimaryButton
          label="Continue"
          onPress={() => setStep('permission')}
          accessibilityHint="Continues to notification permission choices"
        />
      </Screen>
    );
  }

  if (step === 'permission') {
    return (
      <Screen
        header={
          <Header
            onBack={() => setStep('explain')}
            backLabel="Back"
            backAccessibilityLabel="Back to reminder explanation"
            backHint="Returns to how reminders work"
            fallbackHref="/settings"
          />
        }
      >
        <View style={styles.header}>
          <Text variant="display">Allow notifications?</Text>
          <Text variant="body" tone="muted">
            We only use local notifications for your confirmed meal plan. You can change this
            anytime.
          </Text>
        </View>
        {permission === 'unsupported' ? (
          <Card variant="alt">
            <Text variant="heading">Reminders are unavailable on the web</Text>
            <Text variant="body" tone="muted">
              Your plan still works and stays saved. Use the DecisionEats mobile app for local
              cooking reminders.
            </Text>
          </Card>
        ) : permission === 'granted' ? (
          <Card variant="alt">
            <Text variant="heading">Notifications are already allowed</Text>
            <Text variant="body" tone="muted">
              Choose how early you want your cooking prompts.
            </Text>
          </Card>
        ) : (
          <>
            <PrimaryButton
              label="Allow reminders"
              onPress={requestPermission}
              accessibilityHint="Asks your device for local notification permission"
            />
            {permissionError ? (
              <Card variant="alt">
                <Text variant="body">
                  Notifications are off, but this never blocks your plan. Turn them on in device
                  settings when you are ready.
                </Text>
                <PrimaryButton
                  label="Open device settings"
                  variant="ghost"
                  onPress={openPlatformSettings}
                  accessibilityHint="Opens device settings for DecisionEats notifications"
                />
              </Card>
            ) : null}
            <PrimaryButton
              label="Not now"
              variant="ghost"
              onPress={() => setStep('timing')}
              accessibilityHint="Skips notification permission without blocking planning"
            />
          </>
        )}
        {permission === 'unsupported' ? (
          <PrimaryButton
            label="Continue"
            onPress={() => setStep('timing')}
            accessibilityHint="Continues without browser reminders"
          />
        ) : permission === 'granted' ? (
          <PrimaryButton
            label="Continue"
            onPress={() => setStep('timing')}
            accessibilityHint="Continues to reminder timing"
          />
        ) : null}
      </Screen>
    );
  }

  if (step === 'timing') {
    return (
      <Screen
        header={
          <Header
            onBack={() => setStep('permission')}
            backLabel="Back"
            backAccessibilityLabel="Back to notification permission"
            backHint="Returns to notification permission"
            fallbackHref="/settings"
          />
        }
      >
        <View style={styles.header}>
          <Text variant="display">When should we remind you?</Text>
          <Text variant="body" tone="muted">
            DecisionEats uses the longer of the recipe time and your chosen lead time, so you are
            never prompted after cooking needs to start.
          </Text>
        </View>
        <View
          style={styles.group}
          accessibilityRole="radiogroup"
          accessibilityLabel="Reminder lead time"
          accessibilityHint="Choose how early cooking reminders arrive"
        >
          {MEAL_PREP_REMINDER_LEAD_MINUTES.map((minutes) => (
            <Chip
              key={minutes}
              label={REMINDER_LEAD_LABELS[minutes]}
              selected={leadMinutes === minutes}
              onPress={() => completeTiming(minutes)}
              accessibilityLabel={REMINDER_LEAD_LABELS[minutes]}
              accessibilityHint="Saves this reminder lead time"
            />
          ))}
        </View>
        <PrimaryButton
          label="Use this timing"
          onPress={() => completeTiming(leadMinutes)}
          accessibilityHint="Saves your reminder timing and finishes setup"
        />
      </Screen>
    );
  }

  return (
    <Screen
      header={
        <Header
          onBack={handleBack}
          backLabel="Back"
          backAccessibilityLabel="Back"
          backHint="Returns to the previous screen"
          fallbackHref="/settings"
        />
      }
    >
      <View style={styles.header}>
        <Text variant="display">Cooking reminders</Text>
        <Text variant="body" tone="muted">
          Plan-linked prompts that stay under your control.
        </Text>
      </View>

      {permission === 'unsupported' ? (
        <Card variant="alt">
          <Text variant="heading">Unavailable on the web</Text>
          <Text variant="body" tone="muted">
            Local cooking reminders work in the DecisionEats mobile app. Your weekly plan is still
            saved here.
          </Text>
        </Card>
      ) : (
        <Card variant="alt">
          <View style={styles.statusRow}>
            <View style={styles.statusCopy}>
              <Text variant="heading">Reminder status</Text>
              <Text variant="body" tone={enabled && permission === 'granted' ? 'ready' : 'muted'}>
                {enabled && permission === 'granted'
                  ? 'On for future confirmed-plan meals'
                  : permission === 'denied'
                    ? 'Off — notifications are blocked'
                    : 'Off'}
              </Text>
            </View>
            <Switch
              accessible
              accessibilityRole="switch"
              accessibilityLabel="Meal-prep reminders"
              accessibilityHint="Turns local reminders on for future confirmed-plan meals"
              accessibilityState={{ checked: enabled, disabled: permission === 'denied' }}
              value={enabled}
              onValueChange={handleToggle}
              disabled={permission === 'denied'}
            />
          </View>
          {permission === 'denied' ? (
            <PrimaryButton
              label="Open device settings"
              variant="ghost"
              onPress={openPlatformSettings}
              accessibilityHint="Opens device settings for DecisionEats notifications"
            />
          ) : null}
        </Card>
      )}

      <View style={styles.group}>
        <Text variant="heading">Remind me</Text>
        <Text variant="caption" tone="muted">
          {REMINDER_LEAD_LABELS[leadMinutes]} · applied per meal
        </Text>
        <View
          style={styles.chipGroup}
          accessibilityRole="radiogroup"
          accessibilityLabel="Reminder lead time"
          accessibilityHint="Choose how early cooking reminders arrive"
        >
          {MEAL_PREP_REMINDER_LEAD_MINUTES.map((minutes) => (
            <Chip
              key={minutes}
              label={REMINDER_LEAD_LABELS[minutes]}
              selected={leadMinutes === minutes}
              onPress={() => setLeadMinutes(minutes)}
              accessibilityLabel={REMINDER_LEAD_LABELS[minutes]}
              accessibilityHint="Changes how early reminders arrive"
            />
          ))}
        </View>
      </View>

      {upcoming.length > 0 ? (
        <View style={styles.group}>
          <Text variant="heading">Upcoming reminders</Text>
          {upcoming.map((reminder) => (
            <Card key={reminder.id} variant="alt">
              <Text variant="bodyStrong">{reminder.recipeTitle}</Text>
              <Text variant="caption" tone="muted">
                Start cooking {formatDateTime(reminder.notificationTime)}
              </Text>
              <Text variant="caption" tone="muted">
                Meal time {formatDateTime(reminder.plannedMealTime)}
              </Text>
            </Card>
          ))}
        </View>
      ) : (
        <Card variant="alt">
          <Text variant="bodyStrong">No upcoming reminders</Text>
          <Text variant="caption" tone="muted">
            {weeklyPlan?.status === 'confirmed'
              ? enabled && permission === 'granted'
                ? 'Your confirmed plan has no future concrete cooking reminders.'
                : 'Turn reminders on to see prompts for future concrete meals.'
              : 'Confirm a weekly plan with concrete meal times to create reminders.'}
          </Text>
        </Card>
      )}

      <PrimaryButton
        label="Review reminder setup"
        variant="ghost"
        onPress={() => {
          setStep('explain');
          setOnboardingComplete(false);
        }}
        accessibilityHint="Reopens the reminder explanation and setup guidance"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.xs },
  group: { gap: space.sm },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusCopy: { flex: 1, gap: space.xs },
});
