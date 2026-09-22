import { describe, expect, it } from 'vitest';

import { hasAllergen } from '@/engine/filter-hard';
import type { Recipe } from '@/engine/types';
import {
  COOKING_EQUIPMENT_OPTIONS,
  EQUIPMENT_CHECKLIST_OPTIONS,
  NO_COOKING_EQUIPMENT_OPTION,
  type CookingEquipment,
} from '@/lib/equipment';
import {
  COMMON_ALLERGENS,
  mergePlanTasteSignals,
  recordDislike,
  removeDislike,
  toEnginePreferences,
  useKitchenStore,
} from '@/store/kitchen';
import { INGREDIENT_VOCABULARY, BUNDLED_CATALOG } from '@/data/catalog';
import { decide } from '@/engine/decide';

type Constraints = Parameters<typeof toEnginePreferences>[0];

const base: Constraints = {
  equipment: ['microwave', 'stove', 'oven', 'kettle'],
  allergens: [],
  dietary: [],
};

describe('toEnginePreferences', () => {
  it('normalizes the owned equipment set', () => {
    const prefs = toEnginePreferences({ ...base, equipment: ['microwave', 'air_fryer'] });

    expect(prefs.equipment).toContain('microwave');
    expect(prefs.equipment).toContain('air_fryer');
    expect(prefs.equipment).not.toContain('stove');
  });

  it('does not duplicate an appliance already owned', () => {
    const prefs = toEnginePreferences({ ...base, equipment: ['stove', 'stove'] });

    expect(prefs.equipment.filter((item) => item === 'stove')).toHaveLength(1);
  });

  it('drops unclassified sentinel if passed', () => {
    const prefs = toEnginePreferences({
      ...base,
      equipment: ['unclassified' as unknown as CookingEquipment],
    });

    expect(prefs.equipment).toEqual([]);
  });

  it('expands an allergen option into every vocabulary group it covers', () => {
    const prefs = toEnginePreferences({ ...base, allergens: ['gluten'] });

    // "Gluten" has to cover the `wheat` group too, or half the offending
    // ingredients slip through.
    expect(prefs.allergens).toContain('gluten');
    expect(prefs.allergens).toContain('wheat');
  });

  it('expands tree nuts to both nut groups', () => {
    const prefs = toEnginePreferences({ ...base, allergens: ['tree_nut'] });

    expect(prefs.allergens).toEqual(expect.arrayContaining(['nut', 'tree_nut']));
  });

  it('ignores an unknown allergen id rather than passing it through', () => {
    const prefs = toEnginePreferences({ ...base, allergens: ['not-an-allergen'] });

    expect(prefs.allergens).toEqual([]);
  });

  it('passes the cuisine through as a soft preference', () => {
    expect(toEnginePreferences(base, 'italian').preferredCuisine).toBe('italian');
    expect(toEnginePreferences(base).preferredCuisine).toBeNull();
  });
});

describe('COMMON_ALLERGENS', () => {
  /**
   * The safety-critical property. An allergen offered in the UI that matches
   * nothing in the vocabulary is worse than an omitted one: the user believes
   * they are protected and they are not.
   */
  it('only offers allergens whose groups exist in the ingredient vocabulary', () => {
    const known = new Set(INGREDIENT_VOCABULARY.flatMap((entry) => entry.allergenGroups));

    for (const allergen of COMMON_ALLERGENS) {
      for (const group of allergen.groups) {
        expect(known, `${allergen.label} declares unknown group "${group}"`).toContain(group);
      }
    }
  });

  it('actually excludes a recipe once expanded through the engine filter', () => {
    const dairyIngredient = INGREDIENT_VOCABULARY.find((entry) =>
      entry.allergenGroups.includes('dairy')
    );
    expect(dairyIngredient).toBeDefined();

    const recipe: Recipe = {
      id: 'r1',
      title: 'Buttered something',
      imageUrl: null,
      cuisine: null,
      totalTimeMinutes: 10,
      equipmentRequired: ['none'],
      mealSlots: ['dinner'],
      dietaryTags: [],
      ingredients: [
        {
          id: dairyIngredient!.id,
          measure: '1 tbsp',
          allergenGroups: dairyIngredient!.allergenGroups,
        },
      ],
      instructions: 'Melt it.',
      baseServings: null,
      energyKcalPerServing: null,
      nutritionProvenance: null,
      nutritionConfidence: 'unavailable',
      source: 'bundled',
    };

    const prefs = toEnginePreferences({ ...base, allergens: ['dairy'] });
    expect(hasAllergen(recipe, prefs.allergens)).toBe(true);
  });
});

describe('EQUIPMENT_CHECKLIST_OPTIONS', () => {
  it('never offers the unclassified sentinel as something a user can own', () => {
    for (const option of EQUIPMENT_CHECKLIST_OPTIONS) {
      expect(option.id).not.toBe('unclassified');
    }
  });

  it('exposes all 8 cooking appliances and the mutually exclusive no-equipment option', () => {
    expect(COOKING_EQUIPMENT_OPTIONS.map((item) => item.label)).toEqual([
      'Microwave',
      'Stovetop',
      'Oven',
      'Electric kettle',
      'Air fryer',
      'Rice cooker',
      'Blender',
      'Toaster oven',
    ]);
    expect(NO_COOKING_EQUIPMENT_OPTION.label).toBe('No cooking equipment');

    const prefs = toEnginePreferences({
      ...base,
      equipment: COOKING_EQUIPMENT_OPTIONS.map((item) => item.id),
    });
    expect(prefs.equipment).toEqual(
      expect.arrayContaining([
        'microwave',
        'stove',
        'oven',
        'kettle',
        'air_fryer',
        'rice_cooker',
        'blender',
        'toaster_oven',
      ])
    );
  });
});

describe('useKitchenStore themeMode', () => {
  it('defaults to system theme mode and updates on setThemeMode', () => {
    expect(useKitchenStore.getState().themeMode).toBe('system');

    useKitchenStore.getState().setThemeMode('dark');
    expect(useKitchenStore.getState().themeMode).toBe('dark');

    useKitchenStore.getState().setThemeMode('light');
    expect(useKitchenStore.getState().themeMode).toBe('light');

    useKitchenStore.getState().setThemeMode('system');
    expect(useKitchenStore.getState().themeMode).toBe('system');
  });
});

describe('useKitchenStore step navigation state retention', () => {
  it('remembers selections when moving backwards and forwards between steps', () => {
    // Step 1: Equipment
    useKitchenStore.getState().setEquipment(['microwave']);
    useKitchenStore.getState().toggleEquipment('air_fryer');

    // Step 2: Restrictions
    useKitchenStore.getState().toggleAllergen('peanut');
    useKitchenStore.getState().toggleDietary('vegetarian');

    // Step 3: Staples
    useKitchenStore.getState().togglePantryItem('rice');

    // Simulate navigating back to Step 1 (Equipment)
    // Selections from Step 2 and Step 3 must NOT be lost
    expect(useKitchenStore.getState().equipment).toEqual(
      expect.arrayContaining(['microwave', 'air_fryer'])
    );
    expect(useKitchenStore.getState().allergens).toContain('peanut');
    expect(useKitchenStore.getState().dietary).toContain('vegetarian');
    expect(useKitchenStore.getState().pantry).toContain('rice');

    // Adjusting Step 1 preserves downstream choices
    useKitchenStore.getState().setEquipment(['microwave', 'stove', 'oven', 'kettle']);
    expect(useKitchenStore.getState().allergens).toContain('peanut');
    expect(useKitchenStore.getState().dietary).toContain('vegetarian');
  });
});

describe('useKitchenStore meal-prep reminder preferences', () => {
  it('defaults reminders to off at the recipe-required start time', () => {
    expect(useKitchenStore.getState().mealPrepRemindersEnabled).toBe(false);
    expect(useKitchenStore.getState().mealPrepReminderLeadMinutes).toBe(0);
  });

  it('restores reminder defaults when all local data is reset', () => {
    useKitchenStore.getState().setMealPrepRemindersEnabled(true);
    useKitchenStore.getState().setMealPrepReminderLeadMinutes(30);

    expect(useKitchenStore.getState().mealPrepRemindersEnabled).toBe(true);
    expect(useKitchenStore.getState().mealPrepReminderLeadMinutes).toBe(30);

    useKitchenStore.getState().reset();

    expect(useKitchenStore.getState().mealPrepRemindersEnabled).toBe(false);
    expect(useKitchenStore.getState().mealPrepReminderLeadMinutes).toBe(0);
  });

  it('records dislikes and skips reactively and clears them on reset', () => {
    useKitchenStore.getState().recordDislike('recipe-disliked-1');
    useKitchenStore.getState().recordSkip('recipe-skipped-1');

    expect(useKitchenStore.getState().dislikedRecipes).toContain('recipe-disliked-1');
    expect(useKitchenStore.getState().skippedRecipes).toContain('recipe-skipped-1');

    const prefs = toEnginePreferences(useKitchenStore.getState());
    expect(prefs.dislikedRecipeIds.has('recipe-disliked-1')).toBe(true);
    expect(prefs.skippedRecipeIds.has('recipe-skipped-1')).toBe(true);

    useKitchenStore.getState().removeDislike('recipe-disliked-1');
    expect(useKitchenStore.getState().dislikedRecipes).not.toContain('recipe-disliked-1');
    const restoredPrefs = toEnginePreferences(useKitchenStore.getState());
    expect(restoredPrefs.dislikedRecipeIds.has('recipe-disliked-1')).toBe(false);

    useKitchenStore.getState().recordDislike('recipe-disliked-2');
    expect(useKitchenStore.getState().dislikedRecipes).toContain('recipe-disliked-2');
    useKitchenStore.getState().resetDislikes();
    expect(useKitchenStore.getState().dislikedRecipes).toEqual([]);

    useKitchenStore.getState().reset();

    expect(useKitchenStore.getState().dislikedRecipes).toEqual([]);
    expect(useKitchenStore.getState().skippedRecipes).toEqual([]);

    const resetPrefs = toEnginePreferences(useKitchenStore.getState());
    expect(resetPrefs.dislikedRecipeIds.size).toBe(0);
    expect(resetPrefs.skippedRecipeIds.size).toBe(0);
  });

  it('supports exported recordDislike, removeDislike, and resetDislikes helper functions', () => {
    recordDislike('standalone-1');
    expect(useKitchenStore.getState().dislikedRecipes).toContain('standalone-1');

    removeDislike('standalone-1');
    expect(useKitchenStore.getState().dislikedRecipes).not.toContain('standalone-1');

    recordDislike('standalone-2');
    expect(useKitchenStore.getState().dislikedRecipes).toContain('standalone-2');
    useKitchenStore.getState().resetDislikes();
    expect(useKitchenStore.getState().dislikedRecipes).toEqual([]);
  });
});

describe('useKitchenStore pantry responsiveness with decision engine', () => {
  it('updates decision engine ready and missing buckets immediately when store pantry changes', () => {
    useKitchenStore.getState().reset();
    useKitchenStore.getState().setEquipment(['stove']);
    const prefs = toEnginePreferences(useKitchenStore.getState(), null);

    // Add egg, butter, bread, salt, and black_pepper to pantry
    useKitchenStore.getState().addPantryItems(['egg', 'butter', 'bread', 'salt', 'black_pepper']);

    // Scrambled eggs is now ready (has egg, butter, salt, black_pepper)
    // Grilled cheese is missing cheddar_cheese (missing_few)
    const initialPantry = new Set(useKitchenStore.getState().pantry);
    const initialDecision = decide(BUNDLED_CATALOG, initialPantry, prefs, 30);
    expect(initialDecision.buckets.ready.map((s) => s.recipe.id)).toContain(
      'hc-staple-scrambled-eggs'
    );

    expect(initialDecision.buckets.ready.map((s) => s.recipe.id)).not.toContain(
      'hc-staple-grilled-cheese'
    );

    // Add cheddar_cheese via togglePantryItem -> grilled cheese becomes ready
    useKitchenStore.getState().togglePantryItem('cheddar_cheese');
    const updatedPantry = new Set(useKitchenStore.getState().pantry);
    const updatedDecision = decide(BUNDLED_CATALOG, updatedPantry, prefs, 30);
    expect(updatedDecision.buckets.ready.map((s) => s.recipe.id)).toContain(
      'hc-staple-grilled-cheese'
    );

    // Remove butter via removePantryItem -> grilled-cheese and scrambled-eggs both leave ready
    useKitchenStore.getState().removePantryItem('butter');
    const butterlessPantry = new Set(useKitchenStore.getState().pantry);
    const butterlessDecision = decide(BUNDLED_CATALOG, butterlessPantry, prefs, 30);
    expect(butterlessDecision.buckets.ready.map((s) => s.recipe.id)).not.toContain(
      'hc-staple-grilled-cheese'
    );
    expect(butterlessDecision.buckets.ready.map((s) => s.recipe.id)).not.toContain(
      'hc-staple-scrambled-eggs'
    );

    // Clean up
    useKitchenStore.getState().reset();
  });
});

describe('useKitchenStore body goals and metrics', () => {
  it('persists goal and optional metrics in the local store boundary', () => {
    useKitchenStore.getState().reset();
    useKitchenStore.getState().setBodyGoal('lose');
    useKitchenStore.getState().setBodyMetrics({ heightCentimeters: 168, weightKilograms: 68.5 });

    expect(useKitchenStore.getState().bodyGoal).toBe('lose');
    expect(useKitchenStore.getState().bodyMetrics).toEqual({
      heightCentimeters: 168,
      weightKilograms: 68.5,
    });
    expect(toEnginePreferences(useKitchenStore.getState()).bodyGoal).toBe('lose');
    expect(toEnginePreferences(useKitchenStore.getState()).bodyMetrics).toEqual({
      heightCentimeters: 168,
      weightKilograms: 68.5,
    });

    useKitchenStore.getState().clearBodyData();
    expect(useKitchenStore.getState().bodyGoal).toBeNull();
    expect(useKitchenStore.getState().bodyMetrics).toEqual({
      heightCentimeters: null,
      weightKilograms: null,
    });
  });

  it('clears goal and body metrics with the full local reset', () => {
    useKitchenStore.getState().setBodyGoal('gain');
    useKitchenStore.getState().setBodyMetrics({ heightCentimeters: 180, weightKilograms: 80 });
    useKitchenStore.getState().reset();

    expect(useKitchenStore.getState().bodyGoal).toBeNull();
    expect(useKitchenStore.getState().bodyMetrics).toEqual({
      heightCentimeters: null,
      weightKilograms: null,
    });
  });
});

describe('confirmed-plan taste signals', () => {
  it('persists explicit selections without changing pantry contents', () => {
    useKitchenStore.getState().reset();
    const pantryBefore = [...useKitchenStore.getState().pantry];

    useKitchenStore
      .getState()
      .recordConfirmedPlanSelections(['recipe-b', 'recipe-a', 'recipe-b'], '2026-08-30T12:00:00Z');

    expect(useKitchenStore.getState().planTasteSignals).toEqual([
      {
        kind: 'plan_selected',
        recipeId: 'recipe-b',
        journey: 'week',
        recordedAt: '2026-08-30T12:00:00Z',
      },
      {
        kind: 'plan_selected',
        recipeId: 'recipe-a',
        journey: 'week',
        recordedAt: '2026-08-30T12:00:00Z',
      },
    ]);
    expect(useKitchenStore.getState().pantry).toEqual(pantryBefore);
  });

  it('updates a repeated selection and keeps the local history bounded', () => {
    const initial = mergePlanTasteSignals([], ['recipe-a'], '2026-08-29T12:00:00Z');
    const refreshed = mergePlanTasteSignals(initial, ['recipe-a'], '2026-08-30T12:00:00Z');
    const bounded = mergePlanTasteSignals(
      refreshed,
      [...Array.from({ length: 101 }, (_, index) => `recipe-${index}`), 'recipe-a'],
      '2026-08-30T13:00:00Z'
    );

    expect(refreshed).toHaveLength(1);
    expect(refreshed[0]?.recordedAt).toBe('2026-08-30T12:00:00Z');
    expect(bounded).toHaveLength(100);
    expect(bounded.some((signal) => signal.recipeId === 'recipe-a')).toBe(true);
  });
});
describe('non-destructive kitchen setup management', () => {
  it('updates hard equipment feasibility while preserving pantry and preferences', () => {
    useKitchenStore.getState().reset();
    useKitchenStore.getState().addPantryItems(['egg', 'butter', 'bread']);
    useKitchenStore.getState().toggleAllergen('peanut');
    useKitchenStore.getState().toggleDietary('vegetarian');
    useKitchenStore.getState().recordSkip('setup-skipped-recipe');
    useKitchenStore.getState().setEquipment(['stove', 'microwave']);

    const catalog: Recipe[] = [
      {
        id: 'setup-stove-recipe',
        title: 'Stovetop eggs',
        imageUrl: null,
        cuisine: 'american',
        totalTimeMinutes: 10,
        equipmentRequired: ['stove'],
        mealSlots: ['dinner'],
        dietaryTags: ['vegetarian'],
        ingredients: [{ id: 'egg', measure: '1', allergenGroups: ['egg'] }],
        instructions: 'Cook on the stove.',
        baseServings: 1,
        energyKcalPerServing: null,
        nutritionProvenance: null,
        nutritionConfidence: 'unavailable',
        source: 'bundled',
      },
      {
        id: 'setup-microwave-recipe',
        title: 'Microwave eggs',
        imageUrl: null,
        cuisine: 'american',
        totalTimeMinutes: 5,
        equipmentRequired: ['microwave'],
        mealSlots: ['dinner'],
        dietaryTags: ['vegetarian'],
        ingredients: [{ id: 'egg', measure: '1', allergenGroups: ['egg'] }],
        instructions: 'Beat the egg and microwave until set.',
        baseServings: 1,
        energyKcalPerServing: null,
        nutritionProvenance: null,
        nutritionConfidence: 'unavailable',
        source: 'bundled',
      },
    ];

    const before = useKitchenStore.getState();
    const pantryBefore = [...before.pantry];
    const allergensBefore = [...before.allergens];
    const dietaryBefore = [...before.dietary];
    const skippedBefore = [...before.skippedRecipes];

    const fullDecision = decide(catalog, new Set(pantryBefore), toEnginePreferences(before), 30);
    expect(fullDecision.buckets.ready.map((item) => item.recipe.id)).toEqual(
      expect.arrayContaining(['setup-microwave-recipe', 'setup-stove-recipe'])
    );

    useKitchenStore.getState().setEquipment(['microwave']);
    useKitchenStore.getState().toggleEquipment('air_fryer');

    const after = useKitchenStore.getState();
    const microwaveDecision = decide(
      catalog,
      new Set(after.pantry),
      toEnginePreferences(after),
      30
    );

    expect(microwaveDecision.buckets.ready.map((item) => item.recipe.id)).toEqual([
      'setup-microwave-recipe',
    ]);
    expect(toEnginePreferences(after).equipment).toEqual(
      expect.arrayContaining(['microwave', 'air_fryer'])
    );
    expect(after.pantry).toEqual(pantryBefore);
    expect(after.allergens).toEqual(allergensBefore);
    expect(after.dietary).toEqual(dietaryBefore);
    expect(after.skippedRecipes).toEqual(skippedBefore);

    useKitchenStore.getState().reset();
  });
});

describe('useKitchenStore meal-prep reminder onboarding', () => {
  it('starts with first-visit guidance and persists completion', () => {
    useKitchenStore.getState().reset();
    expect(useKitchenStore.getState().mealPrepReminderOnboardingComplete).toBe(false);

    useKitchenStore.getState().setMealPrepReminderOnboardingComplete(true);

    expect(useKitchenStore.getState().mealPrepReminderOnboardingComplete).toBe(true);
  });

  it('clears onboarding completion when local data is reset', () => {
    useKitchenStore.getState().setMealPrepReminderOnboardingComplete(true);

    useKitchenStore.getState().reset();

    expect(useKitchenStore.getState().mealPrepReminderOnboardingComplete).toBe(false);
  });
});

describe('useKitchenStore pantry starter and photo merge', () => {
  it('initializes starter items once and merges with existing photo detections', () => {
    useKitchenStore.getState().reset();
    expect(useKitchenStore.getState().pantry).toEqual([]);
    expect(useKitchenStore.getState().pantryStarterInitialized).toBe(false);

    // Simulate prior photo scan adding avocado
    useKitchenStore.getState().addPantryItems(['avocado']);
    expect(useKitchenStore.getState().pantry).toEqual(['avocado']);

    // Initialize starter
    useKitchenStore.getState().initializePantryStarter(['rice', 'onion']);
    expect(useKitchenStore.getState().pantry).toEqual(['avocado', 'rice', 'onion']);
    expect(useKitchenStore.getState().pantryStarterInitialized).toBe(true);

    // Subsequent call does not re-add or overwrite if already initialized
    useKitchenStore.getState().togglePantryItem('rice'); // user unchecks rice
    expect(useKitchenStore.getState().pantry).toEqual(['avocado', 'onion']);

    useKitchenStore.getState().initializePantryStarter(['rice', 'onion']);
    expect(useKitchenStore.getState().pantry).toEqual(['avocado', 'onion']);

    useKitchenStore.getState().reset();
  });

  it('allows zero ingredients and does not add unchecked items on completeOnboarding', () => {
    useKitchenStore.getState().reset();
    expect(useKitchenStore.getState().pantry).toEqual([]);

    useKitchenStore.getState().completeOnboarding();
    expect(useKitchenStore.getState().onboardingDone).toBe(true);
    expect(useKitchenStore.getState().pantry).toEqual([]);

    useKitchenStore.getState().reset();
  });
});
