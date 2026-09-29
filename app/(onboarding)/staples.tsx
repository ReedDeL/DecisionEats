import { Icon } from '@/components/ui/Icon';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { IngredientChecklist } from '@/components/ui/IngredientChecklist';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { StepFooter } from '@/components/ui/StepFooter';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { Text } from '@/components/ui/Text';
import { lookupIngredient } from '@/data/catalog';
import { PANTRY_STARTER_IDS } from '@/data/ingredient-presentation';
import type { IngredientId } from '@/engine/types';
import { trackOnboardingCompleted } from '@/lib/analytics';
import {
  filterSafeStarterIngredients,
  getChecklistIngredientIds,
} from '@/lib/ingredients/suggestions';
import { PantrySyncStatus } from '@/components/PantrySyncStatus';
import { usePantrySyncState } from '@/lib/pantry-sync-live';
import { useKitchenStore } from '@/store/kitchen';
import { radius, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function StaplesScreen() {
  const router = useRouter();
  const { color } = useTheme();
  const pantry = useKitchenStore((state) => state.pantry);
  const sync = usePantrySyncState();
  const pantryLocked =
    sync.phase === 'loading' || (sync.userId !== null && sync.householdId === null);
  const allergens = useKitchenStore((state) => state.allergens);
  const dietary = useKitchenStore((state) => state.dietary);
  const togglePantryItem = useKitchenStore((state) => state.togglePantryItem);
  const completeOnboarding = useKitchenStore((state) => state.completeOnboarding);
  const [query, setQuery] = useState('');

  const safeStarterIds = useMemo(
    () => filterSafeStarterIngredients(PANTRY_STARTER_IDS, allergens, dietary),
    [allergens, dietary]
  );

  const ids = useMemo(
    () => getChecklistIngredientIds(query, pantry, safeStarterIds),
    [pantry, query, safeStarterIds]
  );

  const toggleIngredient = useCallback(
    (id: IngredientId) => {
      if (pantryLocked) return;
      const checked = pantry.includes(id);
      const name = lookupIngredient(id)?.displayName ?? id.replaceAll('_', ' ');
      togglePantryItem(id);
      AccessibilityInfo.announceForAccessibility?.(
        `${checked ? 'Removed' : 'Added'} ${name} ${checked ? 'from' : 'to'} pantry.`
      );
    },
    [pantry, pantryLocked, togglePantryItem]
  );
  const back = () => router.back();
  const finish = () => {
    trackOnboardingCompleted();
    completeOnboarding();
    router.replace('/');
  };
  const emptyMessage = query.trim()
    ? `Nothing matching “${query.trim()}” in our ingredient list yet.`
    : 'Your pantry is empty. You can add ingredients later.';

  return (
    <Screen
      scroll={false}
      header={
        <Header
          onBack={back}
          backLabel="Goals"
          backHint="Returns to goals (Step 3)"
          fallbackHref="/(onboarding)/goals"
        />
      }
      footer={
        <StepFooter
          onBack={back}
          backLabel="Back"
          backHint="Returns to goals (Step 3)"
          onForward={finish}
          forwardLabel="Show me meals"
          forwardHint="Finishes setup and opens the app"
        />
      }
    >
      <View style={styles.page}>
        <StepIndicator currentStep={4} totalSteps={4} label="Pantry Starter" />
        <View style={styles.intro}>
          <Text variant="display">Start your pantry</Text>
          <Text variant="body" tone="muted">
            Confirm a few everyday ingredients, search for more, or take a photo.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scan pantry with a photo"
          accessibilityHint="Opens camera options. Nothing is added until you confirm it."
          disabled={pantryLocked}
          accessibilityState={{ disabled: pantryLocked }}
          onPress={() => {
            if (!pantryLocked) router.push('/scan');
          }}
          style={({ pressed }) => [
            styles.scanButton,
            { backgroundColor: color.accent, opacity: pressed ? 0.84 : 1 },
          ]}
        >
          <Icon name="camera" size={22} color={color.accentText} />
          <Text variant="bodyStrong" tone="onAccent">
            Scan pantry with a photo
          </Text>
        </Pressable>
        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search ingredients"
            placeholderTextColor={color.textMuted}
            accessibilityLabel="Search ingredients"
            accessibilityHint="Filters the ingredient checklist"
            autoCorrect={false}
            style={[
              styles.input,
              { borderColor: color.border, backgroundColor: color.surface, color: color.text },
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
        <PantrySyncStatus />
        <IngredientChecklist
          ids={ids}
          selectedIds={pantry}
          onToggle={toggleIngredient}
          disabled={pantryLocked}
          emptyMessage={emptyMessage}
          style={styles.list}
          testID="pantry-starter-checklist"
        />
        <Text variant="caption" tone="muted">
          {pantry.length} {pantry.length === 1 ? 'ingredient' : 'ingredients'} selected. Starting
          empty is okay.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, gap: space.md, paddingVertical: space.sm },
  intro: { gap: space.sm },
  scanButton: {
    minHeight: touchTarget.primaryCtaHeight,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
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
  list: { flex: 1 },
});
