import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { RecipeCard } from '@/components/ui/RecipeCard';
import { getResponsiveLayout } from '@/components/ui/responsive-layout';
import { Text } from '@/components/ui/Text';
import type { ScoredRecipe } from '@/engine/types';
import { space } from '@/theme/tokens';

export type RecommendationSectionId = 'ready_now' | 'missing_few' | 'more_to_get';

interface SectionMeta {
  title: string;
  tone: 'ready' | 'near' | 'far';
}

export const RECOMMENDATION_SECTION_META: Record<RecommendationSectionId, SectionMeta> = {
  ready_now: { title: 'Ready now', tone: 'ready' },
  missing_few: { title: 'Missing a few', tone: 'near' },
  more_to_get: { title: 'More to get', tone: 'far' },
};

interface BucketSectionProps {
  section: RecommendationSectionId;
  recipes: readonly ScoredRecipe[];
  onSelectRecipe: (recipeId: string) => void;
  onDislikeRecipe?: (recipeId: string) => void;
  onSkipRecipe?: (recipeId: string) => void;
}

export function BucketSection({
  section,
  recipes,
  onSelectRecipe,
  onDislikeRecipe,
  onSkipRecipe,
}: BucketSectionProps) {
  const meta = RECOMMENDATION_SECTION_META[section];
  const { width } = useWindowDimensions();
  const responsive = getResponsiveLayout(Platform.OS === 'web' ? width : 0);

  // An empty bucket is not a dead end, it is simply not shown — the screen as a
  // whole is guaranteed non-empty by the relaxation ladder (Technical Spec §4.3).
  if (recipes.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text accessibilityRole="header" variant="heading" tone={meta.tone} style={styles.title}>
          {meta.title}
        </Text>
        <Text variant="caption" tone="muted">
          {recipes.length} {recipes.length === 1 ? 'match' : 'matches'}
        </Text>
      </View>

      <View
        style={[
          styles.cards,
          responsive.isDesktop && styles.desktopCards,
          responsive.isDesktop && { columnGap: responsive.columnGap },
        ]}
      >
        {recipes.map((scored) => (
          <View key={scored.recipe.id} style={responsive.isDesktop && styles.desktopCard}>
            <RecipeCard
              scored={scored}
              onPress={onSelectRecipe}
              onDislike={onDislikeRecipe}
              onSkip={onSkipRecipe}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  cards: { gap: space.sm },
  desktopCards: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md },
  desktopCard: { width: '48%' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    minHeight: 44,
  },
  title: { letterSpacing: 0.5 },
});
