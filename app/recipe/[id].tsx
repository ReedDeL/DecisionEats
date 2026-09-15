import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { IngredientChip } from '@/components/ui/IngredientChip';
import { RecipeImage } from '@/components/ui/RecipeImage';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { getResponsiveLayout } from '@/components/ui/responsive-layout';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { BUNDLED_CATALOG, lookupIngredient } from '@/data/catalog';
import { getPortionGuidance } from '@/engine/portion-guidance';
import { trackRecipeOpened } from '@/lib/analytics';
import { formatCuisine, formatDuration, formatEquipment } from '@/lib/format';
import { recordDislike, useKitchenStore } from '@/store/kitchen';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

/**
 * Spec §6 — the recipe.
 *
 * Ingredients are `IngredientChip`s rather than text, so the correction
 * gesture is available here too. Missing items are called out against the
 * pantry rather than listed neutrally: the question this screen answers is
 * "can I make this right now", not "what is this dish".
 */
export default function RecipeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { color } = useTheme();
  const { width } = useWindowDimensions();
  const responsive = getResponsiveLayout(Platform.OS === 'web' ? width : 0);

  const pantry = useKitchenStore((state) => state.pantry);
  const bodyGoal = useKitchenStore((state) => state.bodyGoal);
  const bodyMetrics = useKitchenStore((state) => state.bodyMetrics);
  const togglePantryItem = useKitchenStore((state) => state.togglePantryItem);

  const recipe = useMemo(() => BUNDLED_CATALOG.find((candidate) => candidate.id === id), [id]);
  const openedRecipeId = useRef<string | null>(null);
  const portionGuidance = useMemo(
    () =>
      recipe
        ? getPortionGuidance({
            recipe,
            bodyProfile: null,
            bodyGoal,
            bodyMetrics,
            satietyLevel: null,
          })
        : null,
    [recipe, bodyGoal, bodyMetrics]
  );

  useEffect(() => {
    if (!recipe || openedRecipeId.current === recipe.id) return;

    openedRecipeId.current = recipe.id;
    trackRecipeOpened({ recipe_id: recipe.id });
  }, [recipe]);

  if (!recipe) {
    return (
      <Screen header={<Header backLabel="Home" fallbackHref="/" />}>
        <Text variant="title">That recipe isn&apos;t here.</Text>
        <PrimaryButton
          label="Back to home"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityHint="Returns to the meal recommendations or home screen"
        />
      </Screen>
    );
  }

  const owned = new Set(pantry);
  const missing = recipe.ingredients.filter((ingredient) => !owned.has(ingredient.id));

  const steps = recipe.instructions
    .split(/\r?\n+/)
    .map((step) => step.trim())
    .filter((step) => step.length > 0);

  return (
    <Screen
      header={
        <Header backLabel="Results" backHint="Returns to meal recommendations" fallbackHref="/" />
      }
    >
      <View
        style={[
          styles.recipeLayout,
          responsive.isDesktop && styles.desktopRecipeLayout,
          responsive.isDesktop && { columnGap: responsive.columnGap },
        ]}
      >
        <View style={styles.recipePrimary}>
          <RecipeImage
            recipeId={recipe.id}
            uri={recipe.imageUrl}
            title={recipe.title}
            style={[styles.hero, responsive.isDesktop && styles.desktopHero]}
          />
          <Text variant="caption" tone="muted">
            Meal-type illustrations are shared serving examples, not photos of this recipe. Follow
            the ingredients listed below.
          </Text>
          <Text
            variant="caption"
            tone="accent"
            accessibilityRole="link"
            onPress={() => router.push('/image-credits')}
            style={{ minHeight: 44, paddingVertical: 12 }}
          >
            Image credits
          </Text>
          <View style={styles.intro}>
            <Text variant="title">{recipe.title}</Text>
            <Text variant="caption" tone="muted">
              {formatDuration(recipe.totalTimeMinutes)} ·{' '}
              {formatEquipment(recipe.equipmentRequired)}
              {recipe.cuisine ? ` · ${formatCuisine(recipe.cuisine)}` : ''}
            </Text>
          </View>
          {missing.length > 0 ? (
            <Card variant="alt">
              <Text variant="heading" tone="near">
                You&apos;re missing {missing.length}
              </Text>
              <View style={styles.chipRow}>
                {missing.map((ingredient) => (
                  <IngredientChip
                    key={ingredient.id}
                    id={ingredient.id}
                    onToggle={togglePantryItem}
                  />
                ))}
              </View>
              <Text variant="caption" tone="muted">
                Tap one if you actually have it.
              </Text>
            </Card>
          ) : (
            <Card variant="alt">
              <Text variant="heading" tone="ready">
                You have everything.
              </Text>
            </Card>
          )}{' '}
          {portionGuidance ? (
            <Card variant="alt">
              <Text variant="heading">{portionGuidance.label}</Text>
              <Text variant="caption" tone="muted">
                {portionGuidance.disclaimer}
              </Text>
            </Card>
          ) : null}
        </View>

        <View style={styles.recipeDetails}>
          <View style={styles.group}>
            <Text variant="heading">Ingredients</Text>
            {recipe.ingredients.map((ingredient) => (
              <View key={ingredient.id} style={styles.ingredientRow}>
                <Text variant="body" style={styles.ingredientName}>
                  {lookupIngredient(ingredient.id)?.displayName ?? ingredient.id}
                </Text>
                <Text variant="caption" tone="muted">
                  {ingredient.measure}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.group}>
            <Text variant="heading">Steps</Text>
            {steps.map((step, index) => (
              <View key={`${index}-${step.slice(0, 12)}`} style={styles.step}>
                <Text variant="caption" tone="accent">
                  {index + 1}
                </Text>
                <Text variant="body" style={styles.stepBody}>
                  {step}
                </Text>
              </View>
            ))}
          </View>

          <Pressable
            accessible
            accessibilityRole="button"
            accessibilityLabel="Not for me"
            accessibilityHint="Stops suggesting this recipe"
            onPress={() => {
              recordDislike(recipe.id);
              router.back();
            }}
            style={[styles.dislike, { borderColor: color.border }]}
          >
            <Text variant="caption" tone="muted">
              Not for me — don&apos;t suggest this again
            </Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  recipeLayout: { gap: space.lg },
  desktopRecipeLayout: { flexDirection: 'row', alignItems: 'flex-start' },
  recipePrimary: { flex: 1, gap: space.lg },
  recipeDetails: { flex: 1, gap: space.lg },
  hero: { width: '100%', height: 200, borderRadius: radius.md },
  desktopHero: { height: 300 },
  intro: { gap: space.xs },
  group: { gap: space.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  ingredientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
    minHeight: 32,
  },
  ingredientName: { flex: 1 },
  step: { flexDirection: 'row', gap: space.md },
  stepBody: { flex: 1 },
  dislike: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
  },
});
