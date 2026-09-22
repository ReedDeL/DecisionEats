import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/theme/useTheme', () => ({
  useTheme: () => ({
    color: {
      bg: '#FFF8EF',
      surface: '#FFFFFF',
      surfaceAlt: '#F6EBDD',
      text: '#251B16',
      textMuted: '#706158',
      accent: '#247148',
      accentText: '#FFFFFF',
      border: '#E8D6C5',
    },
    shadow: {
      sm: {},
      md: {},
    },
    isDark: false,
    themeMode: 'light',
  }),
}));

vi.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: ({ name, size }: { name: string; size?: number }) =>
    createElement('span', { 'data-icon': name, 'data-size': size }),
}));

function readApp(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../app/${relativePath}`, import.meta.url)), 'utf8');
}

const pantrySource = readApp('(tabs)/pantry.tsx');

import {
  getIngredientPresentation,
  ingredientPresentationSchema,
  PANTRY_STARTER_IDS,
} from '@/data/ingredient-presentation';
import { COMMON_PANTRY_IDS, useKitchenStore } from '@/store/kitchen';
import {
  getChecklistIngredientIds,
  searchIngredientSuggestions,
} from '@/lib/ingredients/suggestions';
import { IngredientChecklist } from '@/components/ui/IngredientChecklist';

describe('Pantry screen & image checklist (Prompt 7)', () => {
  describe('Order of elements', () => {
    it('structures elements in the required order: title/count + settings, search, checklist, camera fab', () => {
      // 1. Pantry title/count and secondary Settings action
      expect(pantrySource).toContain('Your pantry');
      expect(pantrySource).toContain(
        "{pantry.length} {pantry.length === 1 ? 'ingredient' : 'ingredients'} checked."
      );
      expect(pantrySource).toContain(
        "<SettingsAction onPress={() => router.push('/settings')} style={styles.settingsAction} />"
      );

      // 2. Search at top of working area
      expect(pantrySource).toContain('placeholder="Search ingredients"');

      // 3. One virtualized vertical ingredient checklist
      expect(pantrySource).toContain('<IngredientChecklist');
      expect(pantrySource).toContain('testID="pantry-checklist"');

      // 4. Centered circular camera button above bottom navigation on phone
      expect(pantrySource).toContain('testID="scan-camera-button"');
      expect(pantrySource).toContain('name="camera"');

      // Verify sequence order in markup/source
      const titlePos = pantrySource.indexOf('Your pantry');
      const settingsPos = pantrySource.indexOf('<SettingsAction');
      const searchPos = pantrySource.indexOf('placeholder="Search ingredients"');
      const checklistPos = pantrySource.indexOf('<IngredientChecklist');
      const cameraPos = pantrySource.indexOf('testID="scan-camera-button"');

      expect(titlePos).toBeLessThan(settingsPos);
      expect(settingsPos).toBeLessThan(searchPos);
      expect(searchPos).toBeLessThan(checklistPos);
      expect(checklistPos).toBeLessThan(cameraPos);
    });

    it('enforces desktop inline scan action and omits floating button on desktop in code contract', () => {
      // Inline desktop action is present
      expect(pantrySource).toContain('responsive.isDesktop ? (');
      expect(pantrySource).toContain('testID="desktop-scan-action"');
      expect(pantrySource).toContain('Scan pantry with a photo');

      // Floating button is restricted to phone
      expect(pantrySource).toContain('!responsive.isDesktop && !isKeyboardVisible ? (');
      expect(pantrySource).toContain('testID="scan-camera-button"');
    });
  });

  describe('Search and ranking behavior', () => {
    it('lists checked pantry items first with no query, followed by suggested continuation', () => {
      const ids = getChecklistIngredientIds('', ['garlic', 'rice']);
      expect(ids[0]).toBe('garlic');
      expect(ids[1]).toBe('rice');
      // Subsequent items are suggested continuation
      expect(ids.length).toBeGreaterThan(2);
      expect(ids).toEqual(expect.arrayContaining([...PANTRY_STARTER_IDS]));
    });

    it('searches canonical vocabulary and retains checked state with query', () => {
      const ids = getChecklistIngredientIds('garlic', ['garlic', 'rice']);
      // 'garlic' is checked and matches
      expect(ids[0]).toBe('garlic');
      // 'rice' does not match 'garlic'
      expect(ids).not.toContain('rice');
    });

    it('is case-insensitive, trimmed, and alias-aware', () => {
      const upperIds = getChecklistIngredientIds('  GARLIC  ', ['garlic']);
      expect(upperIds).toContain('garlic');

      // Alias 'pb' matches 'peanut_butter'
      const pbIds = searchIngredientSuggestions('pb', []);
      expect(pbIds).toContain('peanut_butter');

      // Alias 'scallions' matches 'green_onion'
      const scallionIds = searchIngredientSuggestions('scallions', []);
      expect(scallionIds).toContain('green_onion');

      // Alias 'jelly' matches 'jam'
      const jellyIds = searchIngredientSuggestions('jelly', []);
      expect(jellyIds).toContain('jam');

      // Alias 'aubergine' matches 'eggplant'
      const aubergineIds = searchIngredientSuggestions('aubergine', []);
      expect(aubergineIds).toContain('eggplant');
    });

    it('returns empty array when query has no matching ingredients', () => {
      const ids = getChecklistIngredientIds('nonexistent_mystery_item_xyz', ['garlic']);
      expect(ids).toEqual([]);
    });

    it('provides clear empty and no-result messages', () => {
      expect(pantrySource).toContain('query.trim()');
      expect(pantrySource).toContain('Nothing matching “');
      expect(pantrySource).toContain('Your pantry is empty. Search above to add an ingredient.');
    });
  });

  describe('Ingredient presentation metadata and provenance', () => {
    it('validates presentation for all starter and common pantry items against Zod schema', () => {
      for (const id of [...PANTRY_STARTER_IDS, ...COMMON_PANTRY_IDS]) {
        const presentation = getIngredientPresentation(id);
        const parsed = ingredientPresentationSchema.safeParse(presentation);
        expect(parsed.success).toBe(true);
        expect(presentation.art.length).toBeGreaterThan(0);
        expect(presentation.detail.length).toBeGreaterThan(0);
      }
    });

    it('provides consistent category fallback for unknown ingredients', () => {
      const unknownProduce = getIngredientPresentation('exotic_dragonfruit' as never);
      expect(unknownProduce.category).toBe('ingredient');
      expect(unknownProduce.art).toBe('fallback');

      const unknownDairy = getIngredientPresentation('fancy_goat_cheese' as never);
      expect(unknownDairy.category).toBe('ingredient');
      expect(unknownDairy.art).toBe('fallback');
    });

    it('ensures detail text describes category/form without health claims or driving allergen safety', () => {
      const prohibitedHealthWords = [
        'health',
        'healthy',
        'diet',
        'calorie',
        'calories',
        'fat-free',
        'superfood',
        'cure',
        'prevent',
        'heart-healthy',
      ];

      for (const id of [...PANTRY_STARTER_IDS, ...COMMON_PANTRY_IDS]) {
        const presentation = getIngredientPresentation(id);
        const detailLower = presentation.detail.toLowerCase();
        for (const word of prohibitedHealthWords) {
          expect(detailLower).not.toContain(word);
        }
      }
    });
  });

  describe('Checkbox semantics', () => {
    it('renders rows with accessibilityRole="checkbox" and aria-checked', () => {
      const html = renderToStaticMarkup(
        createElement(IngredientChecklist, {
          ids: ['garlic', 'rice'],
          selectedIds: ['garlic'],
          onToggle: () => undefined,
          emptyMessage: 'No ingredients',
        })
      );

      // Rows render as checkboxes with appropriate checked attributes
      expect(html).toContain('role="checkbox"');
      expect(html).toContain('aria-checked="true"');
      expect(html).toContain('aria-checked="false"');

      // Checkbox uses vector check icon, not text glyphs or capsules
      expect(html).toContain('data-icon="check"');
      expect(html).not.toContain('✓');
      expect(html).not.toContain('[x]');
    });
  });

  describe('Remote persistence failure rollback and retry', () => {
    it('implements rollback and exposes retry when remote persistence is active and fails', () => {
      expect(pantrySource).toContain('togglePantryItem(id)');
      expect(pantrySource).toContain('if (activeHandler)');
      expect(pantrySource).toContain('// Revert local store on remote failure');
      expect(pantrySource).toContain('setSyncError({ id, action: targetAction, message });');
      expect(pantrySource).toContain('accessibilityRole="alert"');
      expect(pantrySource).toContain('Retry');
      expect(pantrySource).toContain('retrySync');
    });
  });

  describe('Navigation, layout, and keyboard behavior', () => {
    it('navigates to /scan from camera action and does not register camera as a fourth tab', () => {
      expect(pantrySource).toContain("const scan = () => router.push('/scan');");
      expect(pantrySource).not.toContain("name: 'scan'");
    });

    it('respects safe-area and adjusts list padding for mobile floating camera button', () => {
      expect(pantrySource).toContain('const bottomPadding = responsive.isDesktop');
      expect(pantrySource).toContain('88 + Math.max(space.md, insets.bottom)');
    });

    it('hides the floating camera button when keyboard is visible on phone', () => {
      expect(pantrySource).toContain("Keyboard.addListener('keyboardDidShow'");
      expect(pantrySource).toContain("Keyboard.addListener('keyboardDidHide'");
      expect(pantrySource).toContain('!responsive.isDesktop && !isKeyboardVisible ? (');
    });

    it('idempotently merges confirmed photo detections into kitchen store', () => {
      useKitchenStore.setState({ pantry: ['garlic'] });

      // Scan adds items
      useKitchenStore.getState().addPantryItems(['rice', 'onion']);
      expect(useKitchenStore.getState().pantry).toEqual(['garlic', 'rice', 'onion']);

      // Repeated add of same item is idempotent
      useKitchenStore.getState().addPantryItems(['rice', 'garlic']);
      expect(useKitchenStore.getState().pantry).toEqual(['garlic', 'rice', 'onion']);
    });
  });

  describe('Progressive recommendation disclosure', () => {
    it('includes Show more ingredients action and progressive disclosure controls', () => {
      expect(pantrySource).toContain('Show more ingredients');
      expect(pantrySource).toContain('testID="show-more-ingredients-button"');
      expect(pantrySource).toContain('INITIAL_PANTRY_RECOMMENDATIONS');
      expect(pantrySource).toContain('PANTRY_RECOMMENDATION_BATCH_SIZE');
      expect(pantrySource).toContain('getPantryRecommendationCandidates');
    });

    it('limits initial unowned recommendations to 3 before Show more is tapped', () => {
      const initialIds = getChecklistIngredientIds('', ['rice'], PANTRY_STARTER_IDS, 24, 3);
      // 1 owned ('rice') + 3 top recommendations
      expect(initialIds).toHaveLength(4);
      expect(initialIds[0]).toBe('rice');
    });

    it('reveals additional recommendations when limit is expanded', () => {
      const initialIds = getChecklistIngredientIds('', ['rice'], PANTRY_STARTER_IDS, 24, 3);
      const expandedIds = getChecklistIngredientIds('', ['rice'], PANTRY_STARTER_IDS, 24, 6);
      expect(expandedIds.length).toBeGreaterThan(initialIds.length);
      expect(expandedIds.slice(0, initialIds.length)).toEqual(initialIds);
    });
  });
});
