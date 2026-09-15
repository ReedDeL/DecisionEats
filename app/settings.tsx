import { useRouter } from 'expo-router';
import appConfig from '../app.json';
import { useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';

import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Header } from '@/components/ui/Header';
import {
  clearMealPrepReminders,
  requestMealPrepReminderPermission,
} from '@/lib/meal-prep-notifications';
import {
  MEAL_PREP_REMINDER_LEAD_MINUTES,
  type MealPrepReminderLeadMinutes,
} from '@/lib/meal-prep-reminder';
import { trackSettingsUpdated } from '@/lib/analytics';
import type { BodyGoal } from '@/contracts/meal-journeys';
import {
  formatMeasurement,
  centimetersToFeetInches,
  heightToCentimeters,
  isValidInches,
  kilogramsToWeight,
  parseOptionalMeasurement,
  weightToKilograms,
  type HeightUnit,
  type WeightUnit,
} from '@/lib/body-profile';
import { signInWithGoogle, signOut } from '@/lib/auth/google';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import { isHttpsUrl, mergeAttributions, type CatalogAttribution } from '@/lib/catalog';
import { useCatalogAttributions } from '@/lib/queries/catalog';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { Text } from '@/components/ui/Text';
import { BUNDLED_CATALOG_ATTRIBUTIONS } from '@/data/catalog';
import {
  COMMON_ALLERGENS,
  DIETARY_PRESETS,
  useKitchenStore,
  type ThemeMode,
} from '@/store/kitchen';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const REMINDER_LEAD_LABELS: Record<MealPrepReminderLeadMinutes, string> = {
  0: 'At cook time',
  10: '10 min early',
  15: '15 min early',
  30: '30 min early',
  60: '60 min early',
};

const THEME_OPTIONS: readonly {
  id: ThemeMode;
  label: string;
  subtitle: string;
  icon: string;
}[] = [
  {
    id: 'light',
    label: 'Light mode',
    subtitle: 'Warm background with high-contrast text',
    icon: '☀️',
  },
  {
    id: 'dark',
    label: 'Dark mode',
    subtitle: 'Sleek dark surface with vibrant accents',
    icon: '🌙',
  },
  {
    id: 'system',
    label: 'System default',
    subtitle: 'Automatically matches your device settings',
    icon: '⚙️',
  },
];

const GOAL_OPTIONS: readonly { id: BodyGoal; label: string; subtitle: string }[] = [
  { id: 'lose', label: 'Lose weight', subtitle: 'Prioritize lighter choices' },
  {
    id: 'maintain',
    label: 'Maintain weight',
    subtitle: 'Use balanced recommendations',
  },
  { id: 'gain', label: 'Gain weight', subtitle: 'Prioritize nutrient-dense choices' },
];
const DEFAULT_ATTRIBUTIONS: readonly CatalogAttribution[] = BUNDLED_CATALOG_ATTRIBUTIONS.map(
  ({ sourceId, sourceVersion, attribution, url }) => ({
    sourceId,
    sourceVersion,
    attribution,
    url,
  })
);

/**
 * Settings Screen / Window.
 *
 * Allows users to switch theme (Light / Dark / System), customize kitchen
 * equipment, edit safety allergens and dietary restrictions, and view source
 * attributions.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const { color } = useTheme();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthSession();

  const attributionsQuery = useCatalogAttributions();
  const attributions = mergeAttributions(attributionsQuery.data ?? [], DEFAULT_ATTRIBUTIONS);

  const themeMode = useKitchenStore((state) => state.themeMode);
  const setThemeMode = useKitchenStore((state) => state.setThemeMode);

  const allergens = useKitchenStore((state) => state.allergens);
  const dietary = useKitchenStore((state) => state.dietary);
  const toggleAllergen = useKitchenStore((state) => state.toggleAllergen);
  const toggleDietary = useKitchenStore((state) => state.toggleDietary);

  const bodyGoal = useKitchenStore((state) => state.bodyGoal);
  const bodyMetrics = useKitchenStore((state) => state.bodyMetrics);
  const setBodyGoal = useKitchenStore((state) => state.setBodyGoal);
  const setBodyMetrics = useKitchenStore((state) => state.setBodyMetrics);
  const clearBodyData = useKitchenStore((state) => state.clearBodyData);

  const mealPrepRemindersEnabled = useKitchenStore((state) => state.mealPrepRemindersEnabled);
  const mealPrepReminderLeadMinutes = useKitchenStore((state) => state.mealPrepReminderLeadMinutes);
  const setMealPrepRemindersEnabled = useKitchenStore((state) => state.setMealPrepRemindersEnabled);
  const setMealPrepReminderLeadMinutes = useKitchenStore(
    (state) => state.setMealPrepReminderLeadMinutes
  );

  const dislikedRecipes = useKitchenStore((state) => state.dislikedRecipes);
  const resetDislikes = useKitchenStore((state) => state.resetDislikes);
  const reset = useKitchenStore((state) => state.reset);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [resetConfirming, setResetConfirming] = useState(false);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [heightUnit, setHeightUnit] = useState<HeightUnit>('cm');
  const [weightDraft, setWeightDraft] = useState(() =>
    formatMeasurement(bodyMetrics.weightKilograms)
  );
  const [heightDraft, setHeightDraft] = useState(() =>
    formatMeasurement(bodyMetrics.heightCentimeters)
  );
  const [heightInchesDraft, setHeightInchesDraft] = useState('');
  const [bodyMetricsError, setBodyMetricsError] = useState<string | null>(null);

  const changeWeightUnit = (nextUnit: WeightUnit) => {
    if (nextUnit === weightUnit) return;
    const input = parseOptionalMeasurement(weightDraft);
    if (input !== null) {
      setWeightDraft(
        formatMeasurement(kilogramsToWeight(weightToKilograms(input, weightUnit), nextUnit))
      );
    }
    setWeightUnit(nextUnit);
  };

  const changeHeightUnit = (nextUnit: HeightUnit) => {
    if (nextUnit === heightUnit) return;
    const value = parseOptionalMeasurement(heightDraft);
    const inches = parseOptionalMeasurement(heightInchesDraft);
    if (heightUnit === 'ft-in' && inches !== null && !isValidInches(inches)) {
      setBodyMetricsError('Enter inches from 0 up to 11.9.');
      return;
    }
    if (value !== null) {
      if (nextUnit === 'ft-in') {
        const converted = centimetersToFeetInches(
          heightToCentimeters(value, heightUnit, inches ?? 0)
        );
        setHeightDraft(String(converted.feet));
        setHeightInchesDraft(formatMeasurement(converted.inches));
      } else {
        setHeightDraft(formatMeasurement(heightToCentimeters(value, heightUnit, inches ?? 0)));
      }
    }
    if (nextUnit === 'cm') setHeightInchesDraft('');
    setHeightUnit(nextUnit);
    setBodyMetricsError(null);
  };

  const commitBodyMetrics = () => {
    const weightInput = parseOptionalMeasurement(weightDraft);
    const heightInput = parseOptionalMeasurement(heightDraft);
    const inchesInput = parseOptionalMeasurement(heightInchesDraft);
    const weightKilograms =
      weightInput === null ? null : weightToKilograms(weightInput, weightUnit);
    const heightCentimeters =
      heightInput === null ? null : heightToCentimeters(heightInput, heightUnit, inchesInput ?? 0);
    if (
      (weightDraft.trim().length > 0 && weightInput === null) ||
      (heightDraft.trim().length > 0 && heightInput === null) ||
      (heightUnit === 'ft-in' && heightInchesDraft.trim().length > 0 && inchesInput === null) ||
      (heightUnit === 'ft-in' && inchesInput !== null && !isValidInches(inchesInput)) ||
      (heightUnit === 'ft-in' &&
        heightDraft.trim().length === 0 &&
        heightInchesDraft.trim().length > 0) ||
      (weightKilograms !== null && (weightKilograms < 35 || weightKilograms > 300)) ||
      (heightCentimeters !== null && (heightCentimeters < 120 || heightCentimeters > 230))
    ) {
      setBodyMetricsError(
        'Enter a weight between 35 and 300 kg and a height between 120 and 230 cm.'
      );
      return;
    }
    setBodyMetricsError(null);
    setBodyMetrics({ heightCentimeters, weightKilograms });
  };
  const updateTheme = (value: ThemeMode) => {
    setThemeMode(value);
    trackSettingsUpdated({ setting: 'theme', value });
  };

  const updateAllergen = (value: string) => {
    const enabled = !allergens.includes(value);
    toggleAllergen(value);
    trackSettingsUpdated({ setting: 'allergen_filter_enabled', value: enabled });
  };

  const updateDietary = (value: (typeof dietary)[number]) => {
    const enabled = !dietary.includes(value);
    toggleDietary(value);
    trackSettingsUpdated({ setting: 'dietary_filter_enabled', value: enabled });
  };

  const handleSignIn = async () => {
    setSignInError(null);
    setIsSigningIn(true);

    try {
      await signInWithGoogle();
    } catch {
      setSignInError("Couldn't sign you in. Check your connection and try again.");
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);

    try {
      await signOut();
    } catch (error: unknown) {
      console.warn('[auth] Unable to sign out', error);
      Alert.alert(
        "Couldn't sign out",
        'Your local kitchen data is still safe on this device. Please try again.'
      );
    } finally {
      setIsSigningOut(false);
    }
  };

  const clearReminders = () => {
    clearMealPrepReminders().catch((error: unknown) => {
      console.warn('[notifications] Unable to clear meal-prep reminders', error);
    });
  };

  const confirmReset = () => {
    clearReminders();
    trackSettingsUpdated({ setting: 'reset', value: 'confirmed' });
    reset();
    router.replace('/(onboarding)/equipment');
  };

  const handleReminderToggle = async (enabled: boolean) => {
    if (!enabled) {
      setMealPrepRemindersEnabled(false);
      clearReminders();
      return;
    }

    try {
      const granted = await requestMealPrepReminderPermission();
      if (granted) {
        setMealPrepRemindersEnabled(true);
        return;
      }
    } catch (error: unknown) {
      console.warn('[notifications] Unable to request permission', error);
    }

    setMealPrepRemindersEnabled(false);
    clearReminders();
    Alert.alert(
      'Reminders are off',
      'You can enable notifications for DecisionEats in your device settings.'
    );
  };

  const handleReset = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Reset all pantry items and onboarding preferences?')) {
        confirmReset();
      }
    } else {
      Alert.alert(
        'Reset DecisionEats',
        'This will clear your pantry items, kitchen setup, and preferences, and restart onboarding.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reset All',
            style: 'destructive',
            onPress: confirmReset,
          },
        ]
      );
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <Screen
      header={
        <Header
          backLabel="Back"
          backAccessibilityLabel="Back"
          backHint="Returns to the previous screen"
          onBack={handleBack}
          fallbackHref="/"
        />
      }
    >
      <View style={styles.header}>
        <Text variant="display">Settings</Text>
        <Text variant="body" tone="muted">
          Manage your appearance, kitchen setup, and dietary preferences.
        </Text>
      </View>

      <View style={styles.section}>
        <Text variant="heading">Account & Sync</Text>
        <Card variant="alt">
          {isAuthLoading ? (
            <Text variant="caption" tone="muted">
              Checking sync status…
            </Text>
          ) : isAuthenticated ? (
            <>
              <Text variant="bodyStrong">Sync account connected</Text>
              <Text variant="caption" tone="muted">
                Your local kitchen stays available on this device. Signing out stops sync without
                clearing your pantry or preferences here.
              </Text>
              <PrimaryButton
                label={isSigningOut ? 'Signing out…' : 'Sign out'}
                onPress={handleSignOut}
                accessibilityHint="Signs out without clearing local kitchen data"
                disabled={isSigningOut}
              />
            </>
          ) : (
            <>
              <Text variant="bodyStrong">Local account</Text>
              <Text variant="caption" tone="muted">
                Your pantry, kitchen setup, and preferences are stored on this device. Sign in only
                if you want them synced across devices.
              </Text>
              {signInError ? <Text accessibilityLiveRegion="polite">{signInError}</Text> : null}
              <PrimaryButton
                label={isSigningIn ? 'Signing in…' : 'Sync across devices'}
                onPress={handleSignIn}
                accessibilityHint="Opens optional sign-in for cross-device sync"
                disabled={isSigningIn}
              />
            </>
          )}
        </Card>
      </View>

      {/* Theme / Appearance Section */}
      <View style={styles.section}>
        <Text variant="heading">Appearance</Text>
        <Text variant="caption" tone="muted">
          Choose how DecisionEats looks on your screen.
        </Text>

        <View
          style={styles.group}
          accessibilityRole="radiogroup"
          accessibilityLabel="Appearance theme options"
          accessibilityHint="Choose light, dark, or follow your system setting"
        >
          {THEME_OPTIONS.map((opt) => (
            <SelectableCard
              key={opt.id}
              title={`${opt.icon}  ${opt.label}`}
              subtitle={opt.subtitle}
              selected={themeMode === opt.id}
              onPress={() => updateTheme(opt.id)}
              accessibilityHint={`Switches app appearance to ${opt.label}`}
            />
          ))}
        </View>
      </View>

      {/* Kitchen Setup Section */}
      <View style={styles.section}>
        <Text variant="heading">Kitchen setup</Text>
        <Text variant="caption" tone="muted">
          Choose the individual appliances you can cook with.
        </Text>

        <PrimaryButton
          label="Open Kitchen Setup"
          variant="ghost"
          onPress={() => router.push('/kitchen-setup')}
          accessibilityHint="Opens the dedicated Kitchen Setup screen without changing your pantry"
        />
      </View>

      {/* Allergies and Diet Section */}
      <View style={styles.section}>
        <Text variant="heading">Allergies & Dietary Restrictions</Text>
        <Text variant="caption" tone="muted">
          Select anything DecisionEats should always exclude from recommendations.
        </Text>

        <Text variant="bodyStrong">Allergens</Text>
        <View style={styles.chipRow}>
          {COMMON_ALLERGENS.map((allergen) => (
            <Chip
              key={allergen.id}
              label={allergen.label}
              selected={allergens.includes(allergen.id)}
              onPress={() => updateAllergen(allergen.id)}
              accessibilityLabel={allergen.label}
              accessibilityHint="Recipes containing this are excluded"
            />
          ))}
        </View>

        <Text variant="bodyStrong">Dietary Presets</Text>
        <Text variant="caption" tone="muted">
          Select the eating patterns you want DecisionEats to use when choosing recipes.
        </Text>
        <View style={styles.chipRow}>
          {DIETARY_PRESETS.map((preset) => (
            <Chip
              key={preset.id}
              label={preset.label}
              selected={dietary.includes(preset.id)}
              onPress={() => updateDietary(preset.id)}
              accessibilityLabel={preset.label}
              accessibilityHint="Filters recipes for this diet"
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text variant="heading">Goals & portions</Text>
        <Text variant="caption" tone="muted">
          Choose a goal to guide meal recommendations. Height and weight are optional and stay on
          this device for portion estimates.
        </Text>
        <View
          style={styles.group}
          accessibilityRole="radiogroup"
          accessibilityLabel="Weight goal"
          accessibilityHint="Choose a goal to adjust meal recommendations"
        >
          {GOAL_OPTIONS.map((option) => (
            <SelectableCard
              key={option.id}
              title={option.label}
              subtitle={option.subtitle}
              selected={bodyGoal === option.id}
              onPress={() => setBodyGoal(option.id)}
              accessibilityHint={`Selects ${option.label.toLowerCase()} recommendations`}
            />
          ))}
        </View>
        <PrimaryButton
          label="Not now / Skip"
          variant="ghost"
          onPress={() => setBodyGoal(null)}
          accessibilityHint="Uses standard balanced recommendations"
        />
        <View style={styles.bodyFields}>
          <Text variant="bodyStrong">Optional body details</Text>
          <View style={styles.metricRow}>
            <TextInput
              value={weightDraft}
              onChangeText={setWeightDraft}
              onBlur={commitBodyMetrics}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder="Weight"
              placeholderTextColor={color.textMuted}
              accessibilityLabel="Current weight"
              accessibilityHint="Optional current weight used only for portion estimates"
              style={[styles.metricInput, { color: color.text, borderColor: color.border }]}
            />
            <View
              style={styles.chipRow}
              accessibilityRole="radiogroup"
              accessibilityLabel="Weight unit"
              accessibilityHint="Choose kilograms or pounds; the value is converted"
            >
              <Chip
                label="kg"
                selected={weightUnit === 'kg'}
                onPress={() => changeWeightUnit('kg')}
                accessibilityLabel="Kilograms"
                accessibilityHint="Uses kilograms"
              />
              <Chip
                label="lb"
                selected={weightUnit === 'lb'}
                onPress={() => changeWeightUnit('lb')}
                accessibilityLabel="Pounds"
                accessibilityHint="Uses pounds"
              />
            </View>
          </View>
          <View style={styles.metricRow}>
            <TextInput
              value={heightDraft}
              onChangeText={setHeightDraft}
              onBlur={commitBodyMetrics}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder={heightUnit === 'cm' ? 'Height' : 'Feet'}
              placeholderTextColor={color.textMuted}
              accessibilityLabel={heightUnit === 'cm' ? 'Height in centimeters' : 'Height in feet'}
              accessibilityHint="Optional height used only for portion estimates"
              style={[styles.metricInput, { color: color.text, borderColor: color.border }]}
            />
            {heightUnit === 'ft-in' ? (
              <TextInput
                value={heightInchesDraft}
                onChangeText={setHeightInchesDraft}
                onBlur={commitBodyMetrics}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder="Inches"
                placeholderTextColor={color.textMuted}
                accessibilityLabel="Height in inches"
                accessibilityHint="Optional inches portion of height"
                style={[styles.metricInput, { color: color.text, borderColor: color.border }]}
              />
            ) : null}
            <View
              style={styles.chipRow}
              accessibilityRole="radiogroup"
              accessibilityLabel="Height unit"
              accessibilityHint="Choose centimeters or feet and inches; the value is converted"
            >
              <Chip
                label="cm"
                selected={heightUnit === 'cm'}
                onPress={() => changeHeightUnit('cm')}
                accessibilityLabel="Centimeters"
                accessibilityHint="Uses centimeters"
              />
              <Chip
                label="ft-in"
                selected={heightUnit === 'ft-in'}
                onPress={() => changeHeightUnit('ft-in')}
                accessibilityLabel="Feet and inches"
                accessibilityHint="Uses feet and inches"
              />
            </View>
          </View>
          <Text variant="caption" tone="muted">
            Used only to personalize portion estimates on this device. Estimate only—adjust to your
            hunger.
          </Text>
          {bodyMetricsError ? (
            <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
              {bodyMetricsError}
            </Text>
          ) : null}
          <PrimaryButton
            label="Clear body data"
            variant="ghost"
            onPress={() => {
              clearBodyData();
              setWeightDraft('');
              setHeightDraft('');
              setHeightInchesDraft('');
              setBodyMetricsError(null);
            }}
            accessibilityHint="Permanently removes your goal, height, and weight from this device"
          />
        </View>
      </View>
      <View style={styles.section}>
        <Text variant="heading">Meal-prep reminders</Text>
        <Text variant="caption" tone="muted">
          Get a reminder when a future weekly meal-prep plan needs you to start cooking.
        </Text>
        <PrimaryButton
          label="Open Reminders"
          variant="ghost"
          onPress={() => router.push('/reminders')}
          accessibilityHint="Opens the dedicated reminder setup and upcoming reminders screen"
        />
        <View style={styles.reminderToggle}>
          <Text variant="bodyStrong">Start-cooking reminders</Text>
          <Switch
            accessible
            accessibilityRole="switch"
            accessibilityLabel="Meal-prep reminders"
            accessibilityHint="Turns reminders on only for future weekly meal-prep plans"
            accessibilityState={{ checked: mealPrepRemindersEnabled }}
            value={mealPrepRemindersEnabled}
            onValueChange={handleReminderToggle}
          />
        </View>

        {mealPrepRemindersEnabled ? (
          <View
            style={styles.group}
            accessibilityRole="radiogroup"
            accessibilityLabel="How early should meal-prep reminders arrive"
            accessibilityHint="Choose when meal-prep reminders arrive before cooking"
          >
            <Text variant="bodyStrong">Remind me</Text>
            <View style={styles.chipRow}>
              {MEAL_PREP_REMINDER_LEAD_MINUTES.map((minutes) => (
                <Chip
                  key={minutes}
                  label={REMINDER_LEAD_LABELS[minutes]}
                  selected={mealPrepReminderLeadMinutes === minutes}
                  onPress={() => setMealPrepReminderLeadMinutes(minutes)}
                  accessibilityLabel={REMINDER_LEAD_LABELS[minutes]}
                  accessibilityHint="Sets how early meal-prep reminders arrive"
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>

      {/* Attribution & About Section */}
      <Card>
        <Text
          variant="bodyStrong"
          tone="accent"
          accessibilityRole="link"
          onPress={() => router.push('/image-credits')}
          style={{ minHeight: 44, paddingVertical: 12 }}
        >
          Image credits
        </Text>
        <Text variant="caption" tone="muted">
          Photographers, image sources, and licenses.
        </Text>
      </Card>
      <View style={styles.section}>
        <Text variant="heading">About & Attribution</Text>
        <Card variant="alt">
          <Text variant="bodyStrong">DecisionEats</Text>
          <Text variant="caption" tone="muted">
            Photo-based meal decision engine. Version {appConfig.expo.version}
          </Text>
          <Text variant="bodyStrong">Safety & privacy</Text>
          <Text variant="caption" tone="muted">
            DecisionEats is a meal-planning tool, not medical advice. Check every ingredient
            yourself, especially for allergies or dietary restrictions. Photo scanning is intended
            for adults; do not include people, documents, or personal details in a photo.
          </Text>
          <Text variant="caption" tone="muted">
            Photo results are suggestions. DecisionEats does not save scan photos after the request,
            but its third-party photo-recognition provider&apos;s data-handling terms apply.
          </Text>
          {attributions.map((item) =>
            item.url && isHttpsUrl(item.url) ? (
              <Pressable
                key={`${item.sourceId}-${item.sourceVersion}`}
                accessible
                accessibilityRole="link"
                accessibilityLabel={item.attribution}
                accessibilityHint="Opens this catalog source in your browser"
                onPress={() => {
                  if (item.url && isHttpsUrl(item.url)) {
                    Linking.openURL(item.url);
                  }
                }}
                style={styles.attributionLink}
              >
                <Text variant="caption" tone="accent">
                  {item.attribution} ↗
                </Text>
              </Pressable>
            ) : (
              <Text key={`${item.sourceId}-${item.sourceVersion}`} variant="caption" tone="muted">
                {item.attribution}
              </Text>
            )
          )}
          <Text variant="caption" tone="muted">
            Each recipe keeps its source, version, license, and attribution metadata.
          </Text>
        </Card>
      </View>

      {/* Danger / Reset Zone */}
      <View style={styles.section}>
        <Text variant="heading">Data & Reset</Text>
        <Text variant="caption" tone="muted">
          Clear your pantry items, kitchen choices, and restart onboarding.
        </Text>

        {dislikedRecipes.length > 0 ? (
          <View style={styles.group}>
            <Text variant="bodyStrong">Hidden suggestions</Text>
            <Text variant="caption" tone="muted">
              You have hidden {dislikedRecipes.length}{' '}
              {dislikedRecipes.length === 1 ? 'recipe' : 'recipes'} with &ldquo;I don&apos;t like
              this&rdquo;.
            </Text>
            <PrimaryButton
              label="Restore all hidden suggestions"
              variant="ghost"
              onPress={() => resetDislikes()}
              accessibilityHint="Restores all hidden recipes back to your recommendations"
            />
          </View>
        ) : null}

        {resetConfirming ? (
          <View style={styles.confirmRow}>
            <PrimaryButton
              label="Yes, reset everything"
              onPress={handleReset}
              accessibilityHint="Confirms resetting all data"
            />
            <PrimaryButton
              label="Cancel"
              variant="ghost"
              onPress={() => setResetConfirming(false)}
              accessibilityHint="Cancels reset"
            />
          </View>
        ) : (
          <PrimaryButton
            label="Reset all data and onboarding"
            variant="ghost"
            onPress={() => setResetConfirming(true)}
            accessibilityHint="Asks for confirmation to reset all data"
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.xs },
  section: { gap: space.sm, marginTop: space.sm },
  group: { gap: space.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  bodyFields: { gap: space.sm },
  metricRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs },
  metricInput: {
    minHeight: 44,
    minWidth: 100,
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: space.md,
    fontSize: 17,
  },
  reminderToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  attributionLink: { minHeight: 32, justifyContent: 'center', marginTop: space.xs },
  confirmRow: { gap: space.sm },
});
