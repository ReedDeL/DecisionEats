import { Pressable, StyleSheet, View } from 'react-native';

import { IngredientChip } from '@/components/ui/IngredientChip';
import { Text } from '@/components/ui/Text';
import type { ScoredRecipe } from '@/engine/types';
import { formatDuration, formatEquipment } from '@/lib/format';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

interface RecipeCardProps {
  scored: ScoredRecipe;
  onPress: (recipeId: string) => void;
  onDislike?: (recipeId: string) => void;
}

/**
 * One answer (Technical Spec §4.1, B4).
 *
 * Every card states its required equipment, even when the user could infer it
 * — constant, cheap proof that the app respects the constraint they declared
 * during onboarding. The missing-ingredient list is rendered as real
 * `IngredientChip`s rather than text so it inherits the one-gesture correction
 * that keeps the pantry honest.
 */
export function RecipeCard({ scored, onPress, onDislike }: RecipeCardProps) {
  const { color, shadow } = useTheme();
  const { recipe, missing } = scored;

  const missingLabel = missing.length === 0 ? 'You have everything' : `Missing ${missing.length}`;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: color.surface, borderColor: color.border },
        shadow.sm,
      ]}
    >
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${recipe.title}. ${formatDuration(recipe.totalTimeMinutes)}. ${missingLabel}.`}
        accessibilityHint="Opens the recipe"
        onPress={() => onPress(recipe.id)}
        style={({ pressed }) => [styles.main, { opacity: pressed ? 0.9 : 1 }]}
      >
        <View style={styles.copy}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {recipe.title}
          </Text>
          <Text variant="caption" tone="muted">
            {formatDuration(recipe.totalTimeMinutes)} · {formatEquipment(recipe.equipmentRequired)}
          </Text>
          {missing.length === 0 ? (
            <Text variant="caption" tone="ready">
              You have it all
            </Text>
          ) : null}
        </View>

        {missing.length > 0 ? (
          <View style={styles.missing}>
            <Text variant="caption" tone="muted">
              Need:
            </Text>
            {missing.map((id) => (
              <IngredientChip key={id} id={id} />
            ))}
          </View>
        ) : null}
      </Pressable>

      {onDislike ? (
        <View style={styles.actions}>
          <Pressable
            accessible
            accessibilityRole="button"
            accessibilityLabel={`I don't like this, ${recipe.title}`}
            accessibilityHint="Removes this recipe from suggestions and finds a replacement"
            onPress={() => onDislike(recipe.id)}
            style={({ pressed }) => [
              styles.dislikeButton,
              { borderColor: color.border, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text variant="caption" tone="muted">
              I don&apos;t like this
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  main: {
    gap: space.sm,
  },
  copy: { gap: 2 },
  missing: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.xs,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: space.xs,
  },
  dislikeButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
  },
});
