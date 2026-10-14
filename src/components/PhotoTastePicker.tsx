import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { RecipeImage } from '@/components/ui/RecipeImage';
import { Text } from '@/components/ui/Text';
import { BUNDLED_CATALOG } from '@/data/catalog';
import { mealPhoto } from '@/data/food-images';
import { isHardSafePlanRecipe } from '@/engine/plan-week';
import { selectionKeyboardProps } from '@/lib/selection-keyboard';
import { toEnginePreferences, useKitchenStore } from '@/store/kitchen';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export function usePhotoTasteOptions() {
  const kitchen = useKitchenStore();
  const preferences = toEnginePreferences(kitchen);
  return BUNDLED_CATALOG.filter(
    (recipe) =>
      mealPhoto(recipe.id) &&
      isHardSafePlanRecipe(recipe, preferences) &&
      !preferences.skippedRecipeIds.has(recipe.id)
  );
}

export function PhotoTastePicker({
  onDone,
  onSkip,
  allowClear = false,
}: {
  onDone: () => void;
  onSkip: () => void;
  allowClear?: boolean;
}) {
  const { color } = useTheme();
  const options = usePhotoTasteOptions();
  const saved = useKitchenStore((state) => state.photoTasteSignals);
  const save = useKitchenStore((state) => state.setPhotoTasteSelections);
  const [selected, setSelected] = useState(() => saved.map(({ recipeId }) => recipeId));
  const eligibleSelected = selected.filter((id) => options.some((recipe) => recipe.id === id));
  const toggle = (id: string) =>
    setSelected((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]));
  return (
    <View style={{ gap: space.md }}>
      <Text variant="heading">Which meals appeal to you?</Text>
      <Text tone="muted">
        Optional for Now. Choose any you like; leaving a photo unselected means nothing. You can
        edit these in Settings.
      </Text>
      {options.map((recipe) => (
        <Pressable
          key={recipe.id}
          accessible
          accessibilityRole="checkbox"
          accessibilityLabel={recipe.title}
          accessibilityState={{ checked: selected.includes(recipe.id) }}
          aria-checked={selected.includes(recipe.id)}
          accessibilityHint="Adds or removes a positive meal preference"
          onPress={() => toggle(recipe.id)}
          {...selectionKeyboardProps(() => toggle(recipe.id))}
          style={{
            gap: space.sm,
            borderWidth: 2,
            borderColor: selected.includes(recipe.id) ? color.accent : color.border,
            padding: space.sm,
            borderRadius: radius.md,
          }}
        >
          <RecipeImage
            recipeId={recipe.id}
            title={recipe.title}
            style={{ width: '100%', height: 140 }}
          />
          <Text variant="bodyStrong">
            {selected.includes(recipe.id) ? '✓ ' : ''}
            {recipe.title}
          </Text>
        </Pressable>
      ))}
      {options.length === 0 ? (
        <Text tone="muted">No reviewed meal photos fit your current kitchen preferences yet.</Text>
      ) : null}
      <PrimaryButton
        label="Save meal preferences"
        disabled={eligibleSelected.length === 0}
        accessibilityHint="Saves only the meals you explicitly selected on this device"
        onPress={() => {
          if (eligibleSelected.length) {
            save(eligibleSelected);
            onDone();
          }
        }}
      />
      {allowClear && saved.length > 0 ? (
        <PrimaryButton
          label="Clear photo preferences"
          variant="ghost"
          accessibilityHint="Removes saved photo choices without marking any meal disliked"
          onPress={() => {
            save([]);
            onDone();
          }}
        />
      ) : null}
      <PrimaryButton
        label={allowClear ? 'Cancel' : 'Skip'}
        variant="ghost"
        accessibilityHint="Closes without saving any selections"
        onPress={onSkip}
      />
    </View>
  );
}
