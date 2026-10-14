import { useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';

import {
  BucketSection,
  RECOMMENDATION_SECTION_META,
  type RecommendationSectionId,
} from '@/components/ui/BucketSection';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Text } from '@/components/ui/Text';
import type { Bucket, ScoredRecipe } from '@/engine/types';
import { space } from '@/theme/tokens';

export const REVEAL_BATCH_SIZE = 4;

export interface RecommendationSection {
  id: RecommendationSectionId;
  title: string;
  recipes: readonly ScoredRecipe[];
}

const PRESENTATION_ORDER: readonly RecommendationSectionId[] = [
  'ready_now',
  'missing_few',
  'more_to_get',
];

/**
 * Engine buckets describe scoring detail. These three groups describe the
 * pantry decision in the plain language promised by the product direction.
 */
export function buildRecommendationSections(
  buckets: Readonly<Record<Bucket, readonly ScoredRecipe[]>>
): RecommendationSection[] {
  const sources: Record<RecommendationSectionId, readonly ScoredRecipe[]> = {
    ready_now: buckets.ready,
    missing_few: buckets.missing_few,
    more_to_get: [...buckets.missing_some, ...buckets.grocery_run],
  };
  const seen = new Set<string>();

  return PRESENTATION_ORDER.map((id) => ({
    id,
    title: RECOMMENDATION_SECTION_META[id].title,
    recipes: sources[id].filter((scored) => {
      if (seen.has(scored.recipe.id)) return false;
      seen.add(scored.recipe.id);
      return true;
    }),
  })).filter((section) => section.recipes.length > 0);
}

export function getVisibleRecommendationSections(
  sections: readonly RecommendationSection[],
  visibleCount: number
): RecommendationSection[] {
  let remaining = Math.max(0, visibleCount);

  return sections.flatMap((section) => {
    if (remaining === 0) return [];
    const recipes = section.recipes.slice(0, remaining);
    remaining -= recipes.length;
    return recipes.length > 0 ? [{ ...section, recipes }] : [];
  });
}

export function getNextVisibleCount(current: number, total: number): number {
  return Math.min(total, current + REVEAL_BATCH_SIZE);
}

interface RecommendationSectionsViewProps {
  sections: readonly RecommendationSection[];
  visibleCount: number;
  onShowMore: () => void;
  onSelectRecipe: (recipeId: string) => void;
  onDislikeRecipe?: (recipeId: string) => void;
  onSkipRecipe?: (recipeId: string) => void;
}

export function RecommendationSectionsView({
  sections,
  visibleCount,
  onShowMore,
  onSelectRecipe,
  onDislikeRecipe,
  onSkipRecipe,
}: RecommendationSectionsViewProps) {
  const total = sections.reduce((sum, section) => sum + section.recipes.length, 0);
  const visible = getVisibleRecommendationSections(sections, visibleCount);
  const shown = Math.min(visibleCount, total);
  const hasMore = shown < total;
  const usedProgressiveDisclosure = total > REVEAL_BATCH_SIZE;

  if (total === 0) return null;

  return (
    <View style={{ gap: space.lg }}>
      {visible.map((section) => (
        <BucketSection
          key={section.id}
          section={section.id}
          recipes={section.recipes}
          onSelectRecipe={onSelectRecipe}
          onDislikeRecipe={onDislikeRecipe}
          onSkipRecipe={onSkipRecipe}
        />
      ))}

      {usedProgressiveDisclosure ? (
        <Text accessibilityLiveRegion="polite" variant="caption" tone="muted">
          {hasMore ? `Showing ${shown} of ${total} matches.` : `All ${total} matches shown.`}
        </Text>
      ) : null}

      {hasMore ? (
        <PrimaryButton
          label="Show more matches"
          variant="ghost"
          onPress={onShowMore}
          accessibilityHint={`Shows the next ${Math.min(
            REVEAL_BATCH_SIZE,
            total - shown
          )} matches without changing your filters`}
        />
      ) : null}
    </View>
  );
}

interface RecommendationSectionsProps {
  buckets: Readonly<Record<Bucket, readonly ScoredRecipe[]>>;
  onSelectRecipe: (recipeId: string) => void;
  onDislikeRecipe?: (recipeId: string) => void;
  onSkipRecipe?: (recipeId: string) => void;
}

export function RecommendationSections({
  buckets,
  onSelectRecipe,
  onDislikeRecipe,
  onSkipRecipe,
}: RecommendationSectionsProps) {
  const sections = buildRecommendationSections(buckets);
  const total = sections.reduce((sum, section) => sum + section.recipes.length, 0);
  const [visibleCount, setVisibleCount] = useState(Math.min(REVEAL_BATCH_SIZE, total));

  const showMore = () => {
    const next = getNextVisibleCount(visibleCount, total);
    setVisibleCount(next);
    AccessibilityInfo.announceForAccessibility(
      next < total ? `Showing ${next} of ${total} matches.` : `All ${total} matches shown.`
    );
  };

  return (
    <RecommendationSectionsView
      sections={sections}
      visibleCount={visibleCount}
      onShowMore={showMore}
      onSelectRecipe={onSelectRecipe}
      onDislikeRecipe={onDislikeRecipe}
      onSkipRecipe={onSkipRecipe}
    />
  );
}
