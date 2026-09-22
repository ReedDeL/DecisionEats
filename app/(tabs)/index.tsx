import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { BrandLockup } from '@/components/BrandLockup';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Header } from '@/components/ui/Header';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { RecommendationSections } from '@/components/ui/RecommendationSections';
import { SettingsAction } from '@/components/ui/SettingsAction';
import { RelaxationBanner } from '@/components/ui/RelaxationBanner';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { BUNDLED_CATALOG } from '@/data/catalog';
import { decide } from '@/engine/decide';
import { decideWithRelaxation } from '@/engine/relax';
import type { Bucket, Minutes } from '@/engine/types';
import { getResponsiveLayout } from '@/components/ui/responsive-layout';
import { FOOD_GENRE_OPTIONS } from '@/lib/cuisines';
import { formatDuration } from '@/lib/format';
import {
  trackConstraintRelaxed,
  trackPantryFilterSubmitted,
  trackRecommendationsShown,
} from '@/lib/analytics';
import { TimeSlider } from '@/components/ui/TimeSlider';
import {
  recordDislike,
  removeDislike,
  toEnginePreferences,
  useKitchenStore,
} from '@/store/kitchen';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

/**
 * Spec §4 and §5 — the decision screen, before and after the one input it
 * requires.
 *
 * These are one screen rather than two because the transition is the product:
 * "I don't know what to eat" becomes three answers without a navigation event
 * in between. Time is the only required input; everything else on the screen
 * is visually subordinate to it, which is the time-first wedge made literal in
 * the layout.
 */

const BUCKET_ORDER: readonly Bucket[] = ['ready', 'missing_few', 'missing_some', 'grocery_run'];

export default function HomeScreen() {
  const router = useRouter();
  const { color } = useTheme();

  const equipment = useKitchenStore((state) => state.equipment);
  const allergens = useKitchenStore((state) => state.allergens);
  const dietary = useKitchenStore((state) => state.dietary);
  const pantry = useKitchenStore((state) => state.pantry);
  const dislikedRecipes = useKitchenStore((state) => state.dislikedRecipes);
  const skippedRecipes = useKitchenStore((state) => state.skippedRecipes);
  const bodyGoal = useKitchenStore((state) => state.bodyGoal);
  const bodyMetrics = useKitchenStore((state) => state.bodyMetrics);

  const [selectedTime, setSelectedTime] = useState<Minutes>(30);
  const [timeLimit, setTimeLimit] = useState<Minutes | null>(null);
  const [cuisine, setCuisine] = useState<string | null>(null);
  /**
   * The user pressed undo on the relaxation banner, so the soft constraint they
   * chose is honoured exactly — even though that returns fewer answers.
   */
  const [strict, setStrict] = useState(false);
  const [undoDislike, setUndoDislike] = useState<{ id: string; title: string } | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  const preferences = useMemo(
    () =>
      toEnginePreferences(
        { equipment, allergens, dietary, dislikedRecipes, skippedRecipes, bodyGoal, bodyMetrics },
        cuisine
      ),
    [equipment, allergens, dietary, dislikedRecipes, skippedRecipes, bodyGoal, bodyMetrics, cuisine]
  );

  const pantrySet = useMemo(() => new Set(pantry), [pantry]);

  const decision = useMemo(() => {
    if (timeLimit === null) return null;
    if (strict) {
      // `decide` never relaxes, so this can legitimately come back empty. That
      // is the one empty state the product allows, because the user asked for
      // it explicitly and can undo it — unlike an app that dead-ends on its own.
      return { ...decide(BUNDLED_CATALOG, pantrySet, preferences, timeLimit), relaxed: false };
    }
    return {
      ...decideWithRelaxation(BUNDLED_CATALOG, pantrySet, preferences, timeLimit),
      relaxed: true,
    };
  }, [timeLimit, pantrySet, preferences, strict]);

  const totalResults = decision
    ? BUCKET_ORDER.reduce((sum, bucket) => sum + decision.buckets[bucket].length, 0)
    : 0;

  useEffect(() => {
    if (!decision) return;

    trackRecommendationsShown({ recommendation_count: totalResults });
    for (const relaxation of decision.appliedRelaxations) {
      trackConstraintRelaxed({ constraint: relaxation.kind });
    }
  }, [decision, totalResults]);

  const submitPantryFilter = (minutes: Minutes) => {
    setSelectedTime(minutes);
    trackPantryFilterSubmitted({ time_limit_minutes: minutes });
    setTimeLimit(minutes);
  };

  const handleDislikeRecipe = (recipeId: string) => {
    const target = BUNDLED_CATALOG.find((r) => r.id === recipeId);
    const targetTitle = target?.title ?? 'Recipe';

    let replacementTitle: string | null = null;
    if (decision) {
      for (const bucket of BUCKET_ORDER) {
        const list = decision.buckets[bucket];
        const idx = list.findIndex((s) => s.recipe.id === recipeId);
        if (idx !== -1) {
          if (list.length > 4) {
            replacementTitle = list[4]?.recipe.title ?? null;
          }
          break;
        }
      }
    }

    recordDislike(recipeId);

    if (replacementTitle) {
      AccessibilityInfo.announceForAccessibility(
        `Removed ${targetTitle}. Replaced with ${replacementTitle}.`
      );
    } else {
      AccessibilityInfo.announceForAccessibility(`Removed ${targetTitle}.`);
    }

    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
    }
    setUndoDislike({ id: recipeId, title: targetTitle });
    undoTimeoutRef.current = setTimeout(() => {
      setUndoDislike(null);
    }, 6000);
  };

  const handleUndoDislike = () => {
    if (!undoDislike) return;
    const { id, title } = undoDislike;
    removeDislike(id);
    AccessibilityInfo.announceForAccessibility(`Restored ${title} to recommendations.`);
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
    }
    setUndoDislike(null);
  };

  if (decision === null || timeLimit === null) {
    return (
      <TimePrompt
        pantryCount={pantry.length}
        cuisine={cuisine}
        selectedTime={selectedTime}
        onSelectTime={setSelectedTime}
        onSelectCuisine={setCuisine}
        onChooseTime={submitPantryFilter}
        onOpenPantry={() => router.push('/pantry')}
      />
    );
  }

  return (
    <Screen
      scroll={false}
      header={
        <Header
          onBack={() => {
            setTimeLimit(null);
            setStrict(false);
          }}
          backLabel={formatDuration(timeLimit)}
          backAccessibilityLabel={`${formatDuration(timeLimit)}. Change the time.`}
          backHint="Returns to the time picker"
          rightAction={<SettingsAction onPress={() => router.push('/settings')} />}
        />
      }
    >
      <ScrollView contentContainerStyle={styles.results} showsVerticalScrollIndicator={false}>
        {undoDislike ? (
          <View
            accessibilityLiveRegion="polite"
            style={[
              styles.undoBanner,
              { backgroundColor: color.surface, borderColor: color.border },
            ]}
          >
            <Text variant="caption" tone="muted" style={styles.undoText}>
              Removed &ldquo;{undoDislike.title}&rdquo;
            </Text>
            <Pressable
              accessible
              accessibilityRole="button"
              accessibilityLabel={`Undo removing ${undoDislike.title}`}
              accessibilityHint="Restores this recipe to suggestions"
              onPress={handleUndoDislike}
              style={styles.undoButton}
            >
              <Text variant="caption" tone="accent">
                Undo
              </Text>
            </Pressable>
          </View>
        ) : null}

        <RelaxationBanner
          relaxations={decision.appliedRelaxations}
          revertLabel={`Keep ${formatDuration(timeLimit)}`}
          onRevert={() => setStrict(true)}
        />

        <RecommendationSections
          key={`${timeLimit}:${cuisine ?? 'any'}:${strict ? 'strict' : 'relaxed'}`}
          buckets={decision.buckets}
          onSelectRecipe={(recipeId) => router.push(`/recipe/${recipeId}`)}
          onDislikeRecipe={handleDislikeRecipe}
        />

        {totalResults === 0 ? (
          strict ? (
            <Card variant="alt">
              <Text variant="heading">Nothing fits {formatDuration(timeLimit)} exactly.</Text>
              <Text variant="body" tone="muted">
                You asked us to hold that limit, so we did. We can widen it slightly instead.
              </Text>
              <PrimaryButton
                label="Show me what's close"
                onPress={() => setStrict(false)}
                accessibilityHint="Widens the time limit and shows results again"
              />
            </Card>
          ) : dislikedRecipes.length > 0 ? (
            <Card variant="alt">
              <Text variant="heading">No meals fit your preferences right now.</Text>
              <Text variant="body" tone="muted">
                You&apos;ve removed suggestions you didn&apos;t want. You can widen your time limit
                or reset hidden suggestions in Settings.
              </Text>
              {undoDislike ? (
                <PrimaryButton
                  label={`Undo removing ${undoDislike.title}`}
                  onPress={handleUndoDislike}
                  accessibilityHint="Restores the recipe you just removed"
                />
              ) : (
                <PrimaryButton
                  label="Open Settings"
                  onPress={() => router.push('/settings')}
                  accessibilityHint="Opens app settings to manage preferences"
                />
              )}
            </Card>
          ) : (
            <Card variant="alt">
              <Text variant="heading">No meals fit your preferences right now.</Text>
              <Text variant="body" tone="muted">
                Try updating your pantry or widening your kitchen equipment in Settings.
              </Text>
              <PrimaryButton
                label="Update pantry"
                onPress={() => router.push('/pantry')}
                accessibilityHint="Opens your pantry to add ingredients"
              />
            </Card>
          )
        ) : null}
      </ScrollView>
    </Screen>
  );
}

interface TimePromptProps {
  pantryCount: number;
  cuisine: string | null;
  selectedTime: Minutes;
  onSelectTime: (minutes: Minutes) => void;
  onSelectCuisine: (cuisine: string | null) => void;
  onChooseTime: (minutes: Minutes) => void;
  onOpenPantry: () => void;
}

function TimePrompt({
  pantryCount,
  cuisine,
  selectedTime,
  onSelectTime,
  onSelectCuisine,
  onChooseTime,
  onOpenPantry,
}: TimePromptProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const responsive = getResponsiveLayout(Platform.OS === 'web' ? width : 0);

  return (
    <Screen>
      <View
        style={[
          styles.promptLayout,
          responsive.isDesktop && styles.desktopPromptLayout,
          responsive.isDesktop && { columnGap: responsive.columnGap },
        ]}
      >
        <View style={[styles.promptPanel, responsive.isDesktop && styles.desktopPanel]}>
          <View style={styles.topRow}>
            <View style={styles.brandGreeting}>
              <BrandLockup compact />
              <Text variant="caption" tone="muted">
                {greeting()}
              </Text>
            </View>
            <SettingsAction onPress={() => router.push('/settings')} />
          </View>

          <Text variant="display">How much time do you have?</Text>

          <TimeSlider value={selectedTime} onChange={onSelectTime} />

          <View style={styles.optional}>
            <Text variant="caption" tone="muted">
              Feeling like something?
            </Text>
            {responsive.cuisineFilter === 'wrap' ? (
              <View style={[styles.cuisineRow, styles.desktopCuisineRow]}>
                <FoodGenreOptions cuisine={cuisine} onSelectCuisine={onSelectCuisine} />
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.cuisineScroll}
                contentContainerStyle={styles.cuisineRow}
              >
                <FoodGenreOptions cuisine={cuisine} onSelectCuisine={onSelectCuisine} />
              </ScrollView>
            )}
          </View>

          <PrimaryButton
            label="Show me meals"
            icon="meal"
            onPress={() => onChooseTime(selectedTime)}
            accessibilityHint={
              selectedTime === 60
                ? 'Shows meals you can make in 60 minutes or more'
                : `Shows meals you can make in ${selectedTime} minutes`
            }
          />

          {!responsive.isDesktop ? (
            <Pressable
              accessible
              accessibilityRole="button"
              accessibilityLabel={`Pantry, ${pantryCount} items`}
              accessibilityHint="Opens your pantry to add or correct ingredients"
              onPress={onOpenPantry}
              style={styles.pantryLink}
            >
              <Text variant="caption" tone="muted">
                Pantry · {pantryCount} {pantryCount === 1 ? 'item' : 'items'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {responsive.isDesktop ? (
          <Card variant="alt" style={styles.contextPanel}>
            <Text variant="heading">Your kitchen, ready when you are</Text>
            <Text variant="body" tone="muted">
              DecisionEats filters every suggestion against the {pantryCount} ingredient
              {pantryCount === 1 ? '' : 's'} in your pantry.
            </Text>
            <Pressable
              accessible
              accessibilityRole="button"
              accessibilityLabel={`Pantry, ${pantryCount} items`}
              accessibilityHint="Opens your pantry to add or correct ingredients"
              onPress={onOpenPantry}
              style={styles.pantryLink}
            >
              <Text variant="caption" tone="accent">
                Update pantry · {pantryCount} {pantryCount === 1 ? 'item' : 'items'}
              </Text>
            </Pressable>
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

interface FoodGenreOptionsProps {
  cuisine: string | null;
  onSelectCuisine: (cuisine: string | null) => void;
}

function FoodGenreOptions({ cuisine, onSelectCuisine }: FoodGenreOptionsProps) {
  return (
    <>
      <Chip
        label="Any"
        selected={cuisine === null}
        onPress={() => onSelectCuisine(null)}
        accessibilityLabel="Any food style"
        accessibilityHint="Removes the food-style preference"
      />
      {FOOD_GENRE_OPTIONS.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          selected={cuisine === option.value}
          onPress={() => onSelectCuisine(cuisine === option.value ? null : option.value)}
          accessibilityLabel={option.label}
          accessibilityHint="Prefers this food style, but never at the cost of an empty screen"
        />
      ))}
    </>
  );
}

/** The 6pm user is the one this product is for; the greeting says we noticed. */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const styles = StyleSheet.create({
  promptLayout: { gap: space.lg },
  desktopPromptLayout: { flexDirection: 'row', alignItems: 'stretch', minWidth: 0 },
  promptPanel: { gap: space.lg, minWidth: 0 },
  desktopPanel: { flex: 1, padding: space.xl, borderRadius: radius.lg, minWidth: 0 },
  contextPanel: { flex: 1, justifyContent: 'center', minHeight: 260, minWidth: 0 },
  optional: { gap: space.sm },
  cuisineRow: { flexDirection: 'row', gap: space.sm, paddingRight: space.lg },
  cuisineScroll: { width: '100%', maxWidth: '100%', minWidth: 0 },
  desktopCuisineRow: {
    width: '100%',
    maxWidth: '100%',
    flexWrap: 'wrap',
    paddingRight: 0,
  },
  pantryLink: { minHeight: 44, justifyContent: 'center' },
  results: { gap: space.lg, paddingBottom: space.xl },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 32,
  },
  brandGreeting: {
    gap: space.xs,
  },
  undoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: space.md,
  },
  undoText: {
    flex: 1,
  },
  undoButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.sm,
  },
});
