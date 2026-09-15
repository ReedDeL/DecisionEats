import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, StyleSheet, TextInput, View } from 'react-native';

import { Chip } from '@/components/ui/Chip';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { StepFooter } from '@/components/ui/StepFooter';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { Text } from '@/components/ui/Text';
import type { BodyGoal } from '@/contracts/meal-journeys';
import {
  formatMeasurement,
  heightToCentimeters,
  isValidBodyMetrics,
  isValidInches,
  parseOptionalMeasurement,
  type HeightUnit,
  type WeightUnit,
  weightToKilograms,
} from '@/lib/body-profile';
import { useKitchenStore } from '@/store/kitchen';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const GOAL_OPTIONS: readonly { id: BodyGoal; label: string; subtitle: string }[] = [
  { id: 'lose', label: 'Lose weight', subtitle: 'Prioritize lighter choices' },
  {
    id: 'maintain',
    label: 'Maintain weight',
    subtitle: 'Use balanced recommendations',
  },
  { id: 'gain', label: 'Gain weight', subtitle: 'Prioritize nutrient-dense choices' },
];

/** Step 3 of 4: an optional, local-only goal and body-metric preference. */
export default function GoalsScreen() {
  const router = useRouter();
  const { color } = useTheme();
  const bodyGoal = useKitchenStore((state) => state.bodyGoal);
  const bodyMetrics = useKitchenStore((state) => state.bodyMetrics);
  const setBodyGoal = useKitchenStore((state) => state.setBodyGoal);
  const setBodyMetrics = useKitchenStore((state) => state.setBodyMetrics);
  const clearBodyData = useKitchenStore((state) => state.clearBodyData);

  const [goal, setGoal] = useState<BodyGoal | null>(bodyGoal);
  const [detailsOpen, setDetailsOpen] = useState(
    bodyMetrics.heightCentimeters !== null || bodyMetrics.weightKilograms !== null
  );
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [heightUnit, setHeightUnit] = useState<HeightUnit>('cm');
  const [weightDraft, setWeightDraft] = useState('');
  const [heightDraft, setHeightDraft] = useState('');
  const [heightInchesDraft, setHeightInchesDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const weight =
      bodyMetrics.weightKilograms === null
        ? ''
        : formatMeasurement(
            weightUnit === 'lb'
              ? bodyMetrics.weightKilograms * 2.2046226218
              : bodyMetrics.weightKilograms
          );
    const height =
      bodyMetrics.heightCentimeters === null
        ? ''
        : heightUnit === 'cm'
          ? formatMeasurement(bodyMetrics.heightCentimeters)
          : Math.floor(bodyMetrics.heightCentimeters / 30.48).toString();
    const inches =
      bodyMetrics.heightCentimeters === null || heightUnit === 'cm'
        ? ''
        : formatMeasurement((bodyMetrics.heightCentimeters / 2.54) % 12);
    setWeightDraft(weight);
    setHeightDraft(height);
    setHeightInchesDraft(inches);
  }, [bodyMetrics.heightCentimeters, bodyMetrics.weightKilograms, heightUnit, weightUnit]);

  const commitMetrics = (): boolean => {
    const weightInput = parseOptionalMeasurement(weightDraft);
    const heightInput = parseOptionalMeasurement(heightDraft);
    const inchesInput = parseOptionalMeasurement(heightInchesDraft);
    const weightKilograms =
      weightInput === null ? null : weightToKilograms(weightInput, weightUnit);
    const heightCentimeters =
      heightInput === null ? null : heightToCentimeters(heightInput, heightUnit, inchesInput ?? 0);

    const metrics = { heightCentimeters, weightKilograms };
    const hasInvalidInput =
      (weightDraft.trim().length > 0 && weightInput === null) ||
      (heightDraft.trim().length > 0 && heightInput === null) ||
      (heightUnit === 'ft-in' && heightInchesDraft.trim().length > 0 && inchesInput === null) ||
      (heightUnit === 'ft-in' && inchesInput !== null && !isValidInches(inchesInput)) ||
      (heightUnit === 'ft-in' &&
        heightDraft.trim().length === 0 &&
        heightInchesDraft.trim().length > 0) ||
      !isValidBodyMetrics(metrics);

    if (hasInvalidInput) {
      setError('Enter a weight between 35 and 300 kg and a height between 120 and 230 cm.');
      return false;
    }

    setError(null);
    setBodyMetrics(metrics);
    Keyboard.dismiss();
    return true;
  };

  const continueToPantry = () => {
    if (!commitMetrics()) return;
    setBodyGoal(goal);
    router.push('/(onboarding)/staples');
  };

  const skip = () => {
    clearBodyData();
    router.push('/(onboarding)/staples');
  };

  return (
    <Screen
      header={
        <Header
          onBack={() => router.back()}
          backLabel="Restrictions"
          backHint="Returns to allergies and diet (Step 2)"
          fallbackHref="/(onboarding)/restrictions"
        />
      }
      footer={
        <StepFooter
          onBack={() => router.back()}
          backLabel="Back"
          backHint="Returns to allergies and diet (Step 2)"
          onForward={continueToPantry}
          forwardLabel="Continue ›"
          forwardHint="Goes to pantry starter (Step 4)"
          secondaryAction={{
            label: 'Not now / Skip',
            onPress: skip,
            accessibilityHint: 'Skips goals and keeps standard recommendations',
          }}
        />
      }
    >
      <StepIndicator currentStep={3} totalSteps={4} label="Goals & Caloric Preferences" />

      <View style={styles.intro}>
        <Text variant="display">What&apos;s your goal?</Text>
        <Text variant="body" tone="muted">
          This helps DecisionEats choose meals that fit what you want right now. It never changes
          your allergies, dietary needs, or kitchen constraints.
        </Text>
      </View>

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
            selected={goal === option.id}
            onPress={() => setGoal(option.id)}
            accessibilityHint={`Selects ${option.label.toLowerCase()} recommendations`}
          />
        ))}
      </View>

      <View style={styles.group}>
        <Chip
          label={detailsOpen ? 'Hide optional details' : 'Add optional details'}
          selected={detailsOpen}
          onPress={() => setDetailsOpen((open) => !open)}
          accessibilityLabel={
            detailsOpen ? 'Hide optional body details' : 'Add optional body details'
          }
          accessibilityHint="Shows optional height and weight fields used only on this device"
        />
        <Text variant="caption" tone="muted">
          Stored on this device and used for portion estimates.
        </Text>
      </View>

      {detailsOpen ? (
        <View style={styles.details}>
          <View style={styles.fieldGroup}>
            <Text variant="bodyStrong">Current weight</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={weightDraft}
                onChangeText={setWeightDraft}
                onBlur={commitMetrics}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder="Optional"
                placeholderTextColor={color.textMuted}
                accessibilityLabel="Current weight"
                accessibilityHint="Optional current weight used only for portion estimates"
                style={[styles.input, { color: color.text, borderColor: color.border }]}
              />
              <View
                style={styles.unitRow}
                accessibilityRole="radiogroup"
                accessibilityLabel="Weight unit"
                accessibilityHint="Choose kilograms or pounds; the value is converted"
              >
                <Chip
                  label="kg"
                  selected={weightUnit === 'kg'}
                  onPress={() => setWeightUnit('kg')}
                  accessibilityLabel="Kilograms"
                  accessibilityHint="Uses kilograms for weight"
                />
                <Chip
                  label="lb"
                  selected={weightUnit === 'lb'}
                  onPress={() => setWeightUnit('lb')}
                  accessibilityLabel="Pounds"
                  accessibilityHint="Uses pounds for weight"
                />
              </View>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text variant="bodyStrong">Height</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={heightDraft}
                onChangeText={setHeightDraft}
                onBlur={commitMetrics}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder="Optional"
                placeholderTextColor={color.textMuted}
                accessibilityLabel={
                  heightUnit === 'cm' ? 'Height in centimeters' : 'Height in feet'
                }
                accessibilityHint="Optional height used only for portion estimates"
                style={[styles.input, { color: color.text, borderColor: color.border }]}
              />
              {heightUnit === 'ft-in' ? (
                <TextInput
                  value={heightInchesDraft}
                  onChangeText={setHeightInchesDraft}
                  onBlur={commitMetrics}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  placeholder="in"
                  placeholderTextColor={color.textMuted}
                  accessibilityLabel="Height in inches"
                  accessibilityHint="Optional inches portion of height"
                  style={[
                    styles.input,
                    styles.inchesInput,
                    { color: color.text, borderColor: color.border },
                  ]}
                />
              ) : null}
              <View
                style={styles.unitRow}
                accessibilityRole="radiogroup"
                accessibilityLabel="Height unit"
                accessibilityHint="Choose centimeters or feet and inches; the value is converted"
              >
                <Chip
                  label="cm"
                  selected={heightUnit === 'cm'}
                  onPress={() => setHeightUnit('cm')}
                  accessibilityLabel="Centimeters"
                  accessibilityHint="Uses centimeters for height"
                />
                <Chip
                  label="ft-in"
                  selected={heightUnit === 'ft-in'}
                  onPress={() => setHeightUnit('ft-in')}
                  accessibilityLabel="Feet and inches"
                  accessibilityHint="Uses feet and inches for height"
                />
              </View>
            </View>
          </View>
          {error ? (
            <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.sm },
  group: { gap: space.sm },
  details: { gap: space.lg },
  fieldGroup: { gap: space.sm },
  inputRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  input: {
    minHeight: 44,
    minWidth: 110,
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: space.md,
    fontSize: 17,
  },
  inchesInput: { minWidth: 76, flex: 0 },
  unitRow: { flexDirection: 'row', gap: space.xs },
});
