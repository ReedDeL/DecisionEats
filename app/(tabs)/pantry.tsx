import { Icon } from '@/components/ui/Icon';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IngredientChecklist } from '@/components/ui/IngredientChecklist';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { getResponsiveLayout } from '@/components/ui/responsive-layout';
import { Screen } from '@/components/ui/Screen';
import { SettingsAction } from '@/components/ui/SettingsAction';
import { Text } from '@/components/ui/Text';
import { PANTRY_STARTER_IDS } from '@/data/ingredient-presentation';
import type { IngredientId } from '@/engine/types';
import {
  getChecklistIngredientIds,
  getPantryRecommendationCandidates,
  INITIAL_PANTRY_RECOMMENDATIONS,
  PANTRY_RECOMMENDATION_BATCH_SIZE,
} from '@/lib/ingredients/suggestions';
import { useKitchenStore } from '@/store/kitchen';
import { radius, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export type RemotePantrySyncHandler = (id: IngredientId, action: 'add' | 'remove') => Promise<void>;

export interface PantryScreenProps {
  remoteSyncHandler?: RemotePantrySyncHandler;
}

export default function PantryScreen({ remoteSyncHandler }: PantryScreenProps = {}) {
  const router = useRouter();
  const { color, shadow } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const responsive = getResponsiveLayout(Platform.OS === 'web' ? width : 0);
  const pantry = useKitchenStore((state) => state.pantry);
  const togglePantryItem = useKitchenStore((state) => state.togglePantryItem);
  const [query, setQuery] = useState('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [syncError, setSyncError] = useState<{
    id: IngredientId;
    action: 'add' | 'remove';
    message: string;
  } | null>(null);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    return () => {
      showSub?.remove?.();
      hideSub?.remove?.();
    };
  }, []);

  const [recommendationLimit, setRecommendationLimit] = useState(INITIAL_PANTRY_RECOMMENDATIONS);

  const recommendationCandidates = useMemo(
    () => getPantryRecommendationCandidates(pantry, PANTRY_STARTER_IDS),
    [pantry]
  );
  const hasMoreRecommendations =
    !query.trim() && recommendationLimit < recommendationCandidates.length;
  const visibleRecommendationCount = Math.min(recommendationLimit, recommendationCandidates.length);

  const ids = useMemo(
    () =>
      getChecklistIngredientIds(
        query,
        pantry,
        PANTRY_STARTER_IDS,
        undefined,
        query.trim() ? undefined : recommendationLimit
      ),
    [pantry, query, recommendationLimit]
  );

  const handleShowMore = useCallback(() => {
    const next = recommendationLimit + PANTRY_RECOMMENDATION_BATCH_SIZE;
    setRecommendationLimit(next);
    const nextShown = Math.min(next, recommendationCandidates.length);
    AccessibilityInfo.announceForAccessibility?.(
      nextShown < recommendationCandidates.length
        ? `Showing ${nextShown} of ${recommendationCandidates.length} recommended ingredients.`
        : `All ${recommendationCandidates.length} recommended ingredients shown.`
    );
  }, [recommendationLimit, recommendationCandidates.length]);

  const checklistFooter = useMemo(() => {
    if (query.trim()) return null;

    return (
      <View style={styles.showMoreContainer}>
        {recommendationLimit > INITIAL_PANTRY_RECOMMENDATIONS ? (
          <Text accessibilityLiveRegion="polite" variant="caption" tone="muted">
            {hasMoreRecommendations
              ? `Showing ${visibleRecommendationCount} of ${recommendationCandidates.length} recommendations.`
              : `All ${recommendationCandidates.length} recommendations shown.`}
          </Text>
        ) : null}
        {hasMoreRecommendations ? (
          <PrimaryButton
            label="Show more ingredients"
            variant="ghost"
            onPress={handleShowMore}
            accessibilityHint={`Shows more ingredient recommendations beyond the current ${visibleRecommendationCount}`}
            testID="show-more-ingredients-button"
          />
        ) : null}
      </View>
    );
  }, [
    query,
    hasMoreRecommendations,
    recommendationLimit,
    visibleRecommendationCount,
    recommendationCandidates.length,
    handleShowMore,
  ]);

  const toggleIngredient = useCallback(
    async (id: IngredientId, overrideSyncHandler?: RemotePantrySyncHandler) => {
      const activeHandler = overrideSyncHandler ?? remoteSyncHandler;
      const checked = pantry.includes(id);
      const targetAction: 'add' | 'remove' = checked ? 'remove' : 'add';

      togglePantryItem(id);
      AccessibilityInfo.announceForAccessibility?.(
        `${checked ? 'Removed' : 'Added'} ${id.replaceAll('_', ' ')} ${checked ? 'from' : 'to'} pantry.`
      );
      setSyncError(null);

      if (activeHandler) {
        try {
          await activeHandler(id, targetAction);
        } catch (error) {
          // Revert local store on remote failure
          togglePantryItem(id);
          const message = error instanceof Error ? error.message : 'Sync failed';
          setSyncError({ id, action: targetAction, message });
          AccessibilityInfo.announceForAccessibility?.(
            `Failed to save ${id.replaceAll('_', ' ')}. Change was rolled back.`
          );
        }
      }
    },
    [pantry, togglePantryItem, remoteSyncHandler]
  );

  const retrySync = useCallback(() => {
    if (!syncError) return;
    const { id } = syncError;
    setSyncError(null);
    void toggleIngredient(id);
  }, [syncError, toggleIngredient]);

  const emptyMessage = query.trim()
    ? `Nothing matching “${query.trim()}” in our ingredient list yet.`
    : 'Your pantry is empty. Search above to add an ingredient.';

  const scan = () => router.push('/scan');

  const bottomPadding = responsive.isDesktop ? space.xl : 88 + Math.max(space.md, insets.bottom);

  return (
    <Screen scroll={false}>
      <View style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.intro}>
            <Text variant="display">Your pantry</Text>
            <Text variant="body" tone="muted">
              {pantry.length} {pantry.length === 1 ? 'ingredient' : 'ingredients'} checked.
            </Text>
          </View>
          <SettingsAction onPress={() => router.push('/settings')} style={styles.settingsAction} />
        </View>

        <View
          style={[
            styles.workingArea,
            responsive.isDesktop && styles.desktopPanel,
            responsive.isDesktop && { backgroundColor: color.surface, borderColor: color.border },
            responsive.isDesktop && shadow.sm,
          ]}
        >
          <View style={styles.searchRow}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search ingredients"
              placeholderTextColor={color.textMuted}
              accessibilityLabel="Search ingredients"
              accessibilityHint="Filters the ingredient checklist"
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              style={[
                styles.input,
                { borderColor: color.border, backgroundColor: color.surfaceAlt, color: color.text },
              ]}
            />
            {query ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear ingredient search"
                accessibilityHint="Clears the ingredient search results"
                onPress={() => setQuery('')}
                style={styles.clear}
              >
                <Icon name="close" size={20} color={color.textMuted} />
              </Pressable>
            ) : null}
          </View>

          {responsive.isDesktop ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Scan pantry with a photo"
              accessibilityHint="Opens camera options. Nothing is added until you confirm it."
              onPress={scan}
              style={({ pressed }) => [
                styles.scanAction,
                {
                  borderColor: color.border,
                  backgroundColor: color.surfaceAlt,
                  opacity: pressed ? 0.84 : 1,
                },
              ]}
              testID="desktop-scan-action"
            >
              <Icon name="camera" size={20} color={color.accent} />
              <Text variant="bodyStrong" tone="accent">
                Scan pantry with a photo
              </Text>
            </Pressable>
          ) : null}

          {syncError ? (
            <View
              accessibilityRole="alert"
              style={[
                styles.errorBanner,
                { backgroundColor: color.surfaceAlt, borderColor: color.accent },
              ]}
            >
              <Text variant="caption" tone="accent" style={styles.errorText}>
                Could not save {syncError.id.replaceAll('_', ' ')}.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Retry saving ${syncError.id.replaceAll('_', ' ')}`}
                accessibilityHint="Retries saving the ingredient to your pantry"
                onPress={retrySync}
                style={styles.retryAction}
              >
                <Text variant="bodyStrong" tone="accent">
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : null}

          <IngredientChecklist
            ids={ids}
            selectedIds={pantry}
            onToggle={toggleIngredient}
            emptyMessage={emptyMessage}
            style={styles.list}
            contentContainerStyle={[styles.listContent, { paddingBottom: bottomPadding }]}
            testID="pantry-checklist"
            footer={checklistFooter}
          />
        </View>

        {!responsive.isDesktop && !isKeyboardVisible ? (
          <View
            style={[styles.fabContainer, { bottom: Math.max(space.md, insets.bottom) }]}
            pointerEvents="box-none"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Scan pantry with a photo"
              accessibilityHint="Opens camera options. Nothing is added until you confirm it."
              onPress={scan}
              style={({ pressed }) => [
                styles.fab,
                {
                  backgroundColor: color.accent,
                  opacity: pressed ? 0.88 : 1,
                },
                shadow.lg,
              ]}
              testID="scan-camera-button"
            >
              <Icon name="camera" size={26} color={color.accentText} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, gap: space.md, paddingVertical: space.lg, position: 'relative' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  intro: { flex: 1, gap: space.xs },
  settingsAction: { marginTop: space.xs },
  workingArea: { flex: 1, gap: space.md },
  desktopPanel: { padding: space.lg, borderWidth: 1, borderRadius: radius.lg },
  searchRow: { position: 'relative' },
  input: {
    minHeight: touchTarget.standard,
    paddingHorizontal: space.md,
    paddingRight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    fontSize: 17,
  },
  clear: {
    position: 'absolute',
    right: space.xs,
    top: 0,
    minHeight: touchTarget.standard,
    minWidth: touchTarget.standard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanAction: {
    minHeight: touchTarget.standard,
    borderWidth: 1,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    gap: space.sm,
  },
  errorText: { flex: 1 },
  retryAction: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
  },
  list: { flex: 1 },
  listContent: { paddingBottom: space.xl },
  fabContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showMoreContainer: {
    gap: space.sm,
    paddingTop: space.xs,
  },
});
