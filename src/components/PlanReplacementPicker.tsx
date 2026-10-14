import { useEffect, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ActionButton } from '@/components/ui/ActionButton';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { Text } from '@/components/ui/Text';
import { MEAL_SLOT_LABELS, type MealSlot } from '@/contracts/meal-slots';
import { lookupIngredient } from '@/data/catalog';
import type { getPlanMealReplacements } from '@/engine/plan-week';
import { formatDuration, formatFriendlyDate } from '@/lib/format';
import { space } from '@/theme/tokens';

export function PlanReplacementPicker({
  date,
  mealSlot,
  replacements,
  errorMessage,
  onConfirm,
  onCancel,
}: {
  date: string;
  mealSlot: MealSlot;
  replacements: ReturnType<typeof getPlanMealReplacements>;
  errorMessage: string | null;
  onConfirm: (recipeId: string) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(8);
  const selected = replacements.find(({ recipe }) => recipe.id === selectedId);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => subscription.remove();
  }, [onCancel]);

  return (
    <Screen
      header={
        <Header
          onBack={onCancel}
          backLabel="Cancel"
          backAccessibilityLabel="Cancel meal replacement"
        />
      }
      footer={
        <PrimaryButton
          label="Use this meal"
          icon="check"
          disabled={!selected}
          onPress={() => {
            if (selected) onConfirm(selected.recipe.id);
          }}
          accessibilityHint="Confirms only this meal slot and updates its ingredient needs"
        />
      }
    >
      <Text variant="display">Choose a replacement</Text>
      <Text variant="body" tone="muted">
        {formatFriendlyDate(date)} · {MEAL_SLOT_LABELS[mealSlot]}
      </Text>
      <Text variant="caption" tone="muted">
        Your other meals stay the same. Nothing changes until you confirm.
      </Text>
      {errorMessage ? <Text accessibilityRole="alert">{errorMessage}</Text> : null}
      {replacements.length === 0 ? (
        <Card variant="alt">
          <Text variant="heading">No safe alternative available</Text>
          <Text tone="muted">
            No other meal fits your kitchen, this meal slot, and the plan’s ingredient limit. Cancel
            to keep your plan.
          </Text>
        </Card>
      ) : (
        <View
          style={{ gap: space.sm }}
          accessibilityRole="radiogroup"
          accessibilityLabel="Replacement meals"
          accessibilityHint="Select one meal, then confirm or cancel"
        >
          {replacements
            .slice(0, visibleCount)
            .map(({ recipe, missingIngredientIds, statedRelaxations }) => (
              <View key={recipe.id} style={{ gap: space.xs }}>
                <SelectableCard
                  title={recipe.title}
                  selected={selectedId === recipe.id}
                  role="radio"
                  subtitle={`${formatDuration(recipe.totalTimeMinutes)} · ${missingIngredientIds.length ? `Missing: ${missingIngredientIds.map((id) => lookupIngredient(id)?.displayName ?? id).join(', ')}` : 'Ready from your pantry'}${statedRelaxations.length ? ` · ${statedRelaxations.map((value) => (value === 'time' ? 'Longer than your selected prep time' : 'Outside your preferred food style')).join(' · ')}` : ''}`}
                  onPress={() => setSelectedId(recipe.id)}
                  accessibilityHint="Selects this meal for confirmation"
                />
                <ActionButton
                  label="View recipe"
                  icon="arrow-right"
                  accessibilityHint="Opens ingredients and instructions without changing your plan"
                  accessibilityLabel={`View recipe for ${recipe.title}`}
                  onPress={() =>
                    router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })
                  }
                />
              </View>
            ))}
        </View>
      )}
      {visibleCount < replacements.length ? (
        <PrimaryButton
          label="Show more replacements"
          variant="ghost"
          accessibilityHint="Shows more eligible meals"
          onPress={() => setVisibleCount((count) => count + 8)}
        />
      ) : null}
      <PrimaryButton
        label="Cancel"
        variant="ghost"
        accessibilityHint="Returns to the unchanged plan"
        onPress={onCancel}
      />
    </Screen>
  );
}
