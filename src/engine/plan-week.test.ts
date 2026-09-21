import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { weeklyMealPlanSchema, type TasteSignal } from '@/contracts/meal-journeys';
import {
  ingredient,
  makeBodyProfile,
  makeDailyPlanPreference,
  makePrefs,
  makeRecipe,
  pantry,
} from '@/engine/__fixtures__';
import {
  buildCandidateTimeTiers,
  planWeek,
  swapPlanMeal,
  type PlanWeekInput,
} from '@/engine/plan-week';
import type { DailyPlanPreference, Recipe } from '@/engine/types';

const DATES = [
  '2026-08-24',
  '2026-08-25',
  '2026-08-26',
  '2026-08-27',
  '2026-08-28',
  '2026-08-29',
  '2026-08-30',
] as const;

function makeDays(
  override: Partial<DailyPlanPreference> = {},
  perDay: Partial<DailyPlanPreference>[] = []
): DailyPlanPreference[] {
  return DATES.map((date, index) =>
    makeDailyPlanPreference({ date, ...override, ...perDay[index] })
  );
}

function makePlanInput(overrides: Partial<PlanWeekInput> = {}): PlanWeekInput {
  return {
    recipes: [makeRecipe({ id: 'recipe-1', ingredients: [ingredient('rice')] })],
    pantry: pantry('rice'),
    preferences: makePrefs(),
    days: makeDays(),
    tasteSignals: [],
    portionInput: { bodyProfile: null, satietyLevel: null },
    ...overrides,
  };
}

function concreteRecipeIds(result: ReturnType<typeof planWeek>): string[] {
  return result.entries.flatMap((entry) => (entry.kind === 'recipe' ? [entry.recipeId] : []));
}

function tasteSignal(recipeId: string): TasteSignal {
  return {
    kind: 'photo_selected',
    recipeId,
    journey: 'week',
    recordedAt: '2026-08-23T12:00:00Z',
  };
}

describe('buildCandidateTimeTiers', () => {
  it('starts with an off-tier limit and adds only larger standard tiers', () => {
    expect(buildCandidateTimeTiers(22)).toEqual([22, 30, 60, 120]);
  });

  it('does not duplicate a selected standard tier', () => {
    expect(buildCandidateTimeTiers(30)).toEqual([30, 60, 120]);
    expect(buildCandidateTimeTiers(120)).toEqual([120]);
  });

  it.each([0, 121, 1.5, Number.NaN])('rejects an invalid selected limit %s', (limit) => {
    expect(() => buildCandidateTimeTiers(limit)).toThrow(RangeError);
  });
});

describe('planWeek input and output contract', () => {
  it('returns one stable bundled-only draft with seven dated meal times', () => {
    const bundledRecipes = Array.from({ length: 7 }, (_, index) =>
      makeRecipe({
        id: `recipe-${index + 1}`,
        ingredients: [ingredient('rice')],
        source: 'bundled',
      })
    );
    const spoonacular = makeRecipe({
      id: 'recipe-0',
      ingredients: [ingredient('rice')],
      source: 'spoonacular',
    });
    const input = makePlanInput({ recipes: [spoonacular, ...bundledRecipes] });

    const first = planWeek(input);
    const second = planWeek({ ...input, recipes: [...input.recipes].reverse() });

    expect(first).toEqual(second);
    expect(first.status).toBe('draft');
    expect(first.weekStart).toBe(DATES[0]);
    expect(first.entries).toHaveLength(7);
    expect(concreteRecipeIds(first)).toEqual(bundledRecipes.map((recipe) => recipe.id));
    expect(first.entries).toEqual(
      DATES.map((date, index) => ({
        kind: 'recipe',
        date,
        mealSlot: 'dinner',
        recipeId: `recipe-${index + 1}`,
        plannedMealTime: `${date}T18:30:00-07:00`,
        statedRelaxations: [],
        portionGuidance: null,
      }))
    );
    expect(weeklyMealPlanSchema.parse(first)).toEqual(first);
  });

  it('rejects anything other than seven supplied days before selection', () => {
    const days = makeDays();
    const firstDay = days[0];
    if (firstDay === undefined) throw new Error('The test fixture must contain seven days');

    expect(() => planWeek(makePlanInput({ days: makeDays().slice(0, 6) }))).toThrow(RangeError);
    expect(() => planWeek(makePlanInput({ days: [...days, firstDay] }))).toThrow(RangeError);
  });

  it('rejects non-consecutive or invalid local dates before selection', () => {
    const skippedDate = makeDays({}, [{}, { date: '2026-08-27' }]);
    const invalidDate = makeDays({}, [{ date: '2026-02-30' }]);

    expect(() => planWeek(makePlanInput({ days: skippedDate }))).toThrow(RangeError);
    expect(() => planWeek(makePlanInput({ days: invalidDate }))).toThrow(RangeError);
  });

  it.each([0, 121, 1.5, Number.NaN])(
    'rejects an invalid daily selected limit %s before selection',
    (selectedLimit) => {
      expect(() => planWeek(makePlanInput({ days: makeDays({}, [{ selectedLimit }]) }))).toThrow(
        RangeError
      );
    }
  );

  it.each(['18:30:00', '18:30-07:00', '25:00:00-07:00', '18:30:00Z'])(
    'rejects malformed or non-numeric-offset meal time %s',
    (mealTime) => {
      expect(() => planWeek(makePlanInput({ days: makeDays({}, [{ mealTime }]) }))).toThrow(
        RangeError
      );
    }
  );
});

describe('planWeek safety and relaxation', () => {
  it('never relaxes equipment, allergen, dietary, dislike, or bundled-source constraints', () => {
    const safe = makeRecipe({
      id: 'safe',
      equipmentRequired: ['microwave'],
      dietaryTags: ['vegan'],
      ingredients: [ingredient('rice')],
    });
    const recipes: Recipe[] = [
      makeRecipe({
        id: 'allergen',
        dietaryTags: ['vegan'],
        ingredients: [ingredient('butter', ['dairy'])],
      }),
      makeRecipe({ id: 'dietary', dietaryTags: [], ingredients: [ingredient('rice')] }),
      makeRecipe({ id: 'disliked', dietaryTags: ['vegan'], ingredients: [ingredient('rice')] }),
      makeRecipe({
        id: 'equipment',
        equipmentRequired: ['oven'],
        dietaryTags: ['vegan'],
        ingredients: [ingredient('rice')],
      }),
      makeRecipe({
        id: 'live',
        dietaryTags: ['vegan'],
        ingredients: [ingredient('rice')],
        source: 'spoonacular',
      }),
      safe,
    ];

    const plan = planWeek(
      makePlanInput({
        recipes,
        preferences: makePrefs({
          equipment: ['microwave'],
          allergens: ['dairy'],
          dietary: ['vegan'],
          dislikedRecipeIds: new Set(['disliked']),
        }),
      })
    );

    expect(concreteRecipeIds(plan)).toEqual(Array.from({ length: 7 }, () => 'safe'));
  });

  it('tries exact cuisine across all time tiers before dropping cuisine', () => {
    const matchingSlow = makeRecipe({ id: 'matching', cuisine: 'thai', totalTimeMinutes: 60 });
    const nonMatchingFast = makeRecipe({
      id: 'non-matching',
      cuisine: 'italian',
      totalTimeMinutes: 10,
    });

    const plan = planWeek(
      makePlanInput({
        recipes: [nonMatchingFast, matchingSlow],
        preferences: makePrefs({ preferredCuisine: 'thai' }),
        days: makeDays({ selectedLimit: 15 }),
      })
    );

    expect(plan.entries[0]).toMatchObject({
      kind: 'recipe',
      recipeId: 'matching',
      statedRelaxations: ['time'],
    });
  });

  it.each([
    { cuisine: 'thai', totalTimeMinutes: 45, relaxations: ['time'] },
    { cuisine: 'italian', totalTimeMinutes: 20, relaxations: ['cuisine'] },
    { cuisine: 'italian', totalTimeMinutes: 45, relaxations: ['time', 'cuisine'] },
  ] as const)(
    'states $relaxations for a $totalTimeMinutes minute $cuisine recipe',
    ({ cuisine, totalTimeMinutes, relaxations }) => {
      const plan = planWeek(
        makePlanInput({
          recipes: [makeRecipe({ cuisine, totalTimeMinutes })],
          preferences: makePrefs({ preferredCuisine: 'thai' }),
          days: makeDays({ selectedLimit: 30 }),
        })
      );

      expect(plan.entries[0]).toMatchObject({ statedRelaxations: relaxations });
      expect(plan.statedRelaxations).toEqual(relaxations);
    }
  );

  it('uses no_safe_recipe when every hard-safe bundled recipe exceeds 120 minutes', () => {
    const plan = planWeek(
      makePlanInput({
        recipes: [makeRecipe({ totalTimeMinutes: 121 })],
        days: makeDays({ selectedLimit: 119 }),
      })
    );

    expect(plan.entries).toEqual(
      DATES.map((date) => ({
        kind: 'day_of_decision',
        date,
        mealSlot: 'dinner',
        reason: 'no_safe_recipe',
      }))
    );
  });

  it('uses no_safe_recipe when no recipe survives the hard filters', () => {
    const plan = planWeek(
      makePlanInput({
        recipes: [makeRecipe({ equipmentRequired: ['oven'] })],
        preferences: makePrefs({ equipment: ['microwave'] }),
      })
    );

    expect(plan.entries[0]).toEqual({
      kind: 'day_of_decision',
      date: DATES[0],
      mealSlot: 'dinner',
      reason: 'no_safe_recipe',
    });
  });
});

describe('planWeek deterministic ranking', () => {
  it('uses pantry readiness before existing score', () => {
    const readyButSkipped = makeRecipe({
      id: 'ready',
      totalTimeMinutes: 30,
      ingredients: [ingredient('rice')],
    });
    const missingButFast = makeRecipe({
      id: 'missing',
      totalTimeMinutes: 1,
      ingredients: [ingredient('rice'), ingredient('onion')],
    });

    const plan = planWeek(
      makePlanInput({
        recipes: [missingButFast, readyButSkipped],
        pantry: pantry('rice'),
        preferences: makePrefs({ skippedRecipeIds: new Set(['ready']) }),
      })
    );

    expect(plan.entries[0]).toMatchObject({ kind: 'recipe', recipeId: 'ready' });
  });

  it('uses existing score before a positive selected-photo tie-breaker', () => {
    const faster = makeRecipe({
      id: 'faster',
      totalTimeMinutes: 10,
      ingredients: [ingredient('rice')],
    });
    const selectedSlower = makeRecipe({
      id: 'selected-slower',
      totalTimeMinutes: 20,
      ingredients: [ingredient('rice')],
    });

    const plan = planWeek(
      makePlanInput({
        recipes: [selectedSlower, faster],
        tasteSignals: [tasteSignal('selected-slower')],
      })
    );

    expect(plan.entries[0]).toMatchObject({ kind: 'recipe', recipeId: 'faster' });
  });

  it('uses a selected photo as a positive tie-breaker and treats no selection as neutral', () => {
    const recipes = [makeRecipe({ id: 'a' }), makeRecipe({ id: 'z' })];

    expect(concreteRecipeIds(planWeek(makePlanInput({ recipes })))[0]).toBe('a');
    expect(
      concreteRecipeIds(planWeek(makePlanInput({ recipes, tasteSignals: [tasteSignal('z')] })))[0]
    ).toBe('z');
  });

  it('rotates through unused recipes before repeating and uses stable IDs', () => {
    const recipes = [makeRecipe({ id: 'b' }), makeRecipe({ id: 'a' }), makeRecipe({ id: 'c' })];

    expect(concreteRecipeIds(planWeek(makePlanInput({ recipes })))).toEqual([
      'a',
      'b',
      'c',
      'a',
      'b',
      'c',
      'a',
    ]);
  });
});

describe('planWeek grocery cap and portion guidance', () => {
  it('counts shared and duplicate canonical IDs once while excluding pantry staples', () => {
    const missing = Array.from({ length: 12 }, (_, index) => ingredient(`custom-${index}`));
    const firstIngredients = missing.slice(0, 8);
    const secondIngredients = missing.slice(5);
    const plan = planWeek(
      makePlanInput({
        recipes: [
          makeRecipe({
            id: 'a',
            ingredients: [...firstIngredients, ...firstIngredients, ingredient('salt')],
          }),
          makeRecipe({
            id: 'b',
            ingredients: [...secondIngredients, ...secondIngredients, ingredient('salt')],
          }),
        ],
        pantry: pantry('salt'),
      })
    );

    expect(new Set(concreteRecipeIds(plan))).toEqual(new Set(['a', 'b']));
    expect(plan.groceryNeeds.map((need) => need.ingredientId)).toEqual(
      missing.map(({ id }) => id).sort()
    );
    expect(plan.groceryNeeds.find((need) => need.ingredientId === 'custom-5')).toEqual({
      ingredientId: 'custom-5',
      recipeIds: ['a', 'b'],
      dates: [...DATES],
    });
  });

  it('returns no swap when pantry corrections put the remaining plan over the grocery cap', () => {
    const ingredients = Array.from({ length: 13 }, (_, index) => ingredient(`custom-${index}`));
    const input = makePlanInput({
      recipes: [makeRecipe({ id: 'a', ingredients }), makeRecipe({ id: 'b', ingredients })],
      pantry: pantry('custom-12'),
    });
    const plan = planWeek(input);

    expect(plan.groceryNeeds).toHaveLength(12);
    expect(swapPlanMeal(plan, `${DATES[0]}:dinner`, { ...input, pantry: pantry() })).toBeNull();
    expect(plan.groceryNeeds).toHaveLength(12);
  });

  it('rejects an over-cap top candidate and tries the next ranked candidate', () => {
    const overCap = makeRecipe({
      id: 'a-over-cap',
      ingredients: Array.from({ length: 13 }, (_, index) => ingredient(`new-${index}`)),
    });
    const fits = makeRecipe({
      id: 'b-fits',
      ingredients: Array.from({ length: 12 }, (_, index) => ingredient(`fit-${index}`)),
    });

    const plan = planWeek(makePlanInput({ recipes: [overCap, fits], pantry: pantry() }));

    expect(plan.entries[0]).toMatchObject({ kind: 'recipe', recipeId: 'b-fits' });
    expect(plan.groceryNeeds).toHaveLength(12);
    expect(plan.groceryNeeds.every((need) => need.recipeIds[0] === 'b-fits')).toBe(true);
  });

  it('uses grocery_need_cap only when otherwise eligible candidates all breach the cap', () => {
    const recipe = makeRecipe({
      ingredients: Array.from({ length: 13 }, (_, index) => ingredient(`ingredient-${index}`)),
    });

    const plan = planWeek(makePlanInput({ recipes: [recipe], pantry: pantry() }));

    expect(plan.entries).toEqual(
      DATES.map((date) => ({
        kind: 'day_of_decision',
        date,
        mealSlot: 'dinner',
        reason: 'grocery_need_cap',
      }))
    );
    expect(plan.groceryNeeds).toEqual([]);
  });

  it('keeps exactly 12 plan-linked needs without omitting any selected recipe ingredient', () => {
    const ingredients = Array.from({ length: 12 }, (_, index) => ingredient(`ingredient-${index}`));
    const plan = planWeek(
      makePlanInput({ recipes: [makeRecipe({ ingredients })], pantry: pantry() })
    );

    expect(plan.groceryNeeds).toHaveLength(12);
    expect(plan.groceryNeeds.map((need) => need.ingredientId)).toEqual(
      ingredients.map((recipeIngredient) => recipeIngredient.id).sort()
    );
  });

  it('retains a low-confidence meal with null portion guidance', () => {
    const recipe = makeRecipe({
      energyKcalPerServing: 500,
      nutritionConfidence: 'low',
    });
    const plan = planWeek(
      makePlanInput({
        recipes: [recipe],
        portionInput: { bodyProfile: makeBodyProfile(), satietyLevel: null },
      })
    );

    expect(plan.entries[0]).toMatchObject({
      kind: 'recipe',
      recipeId: recipe.id,
      portionGuidance: null,
    });
  });
});

describe('planWeek shared fixture parity', () => {
  it('reproduces the canonical cross-platform weekly plan fixture', () => {
    const fixturePath = fileURLToPath(
      new URL('../../shared/fixtures/dual-meal-journeys.json', import.meta.url)
    );
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      weeklyMealPlan: unknown;
    };
    const recipes = Array.from({ length: 7 }, (_, index) =>
      makeRecipe({
        id: `recipe-${index + 1}`,
        ingredients: [ingredient(`ingredient-${index + 1}`)],
        energyKcalPerServing: index === 0 ? 600 : null,
        nutritionConfidence: index === 0 ? 'medium' : 'unavailable',
      })
    );

    const plan = planWeek(
      makePlanInput({
        recipes,
        pantry: pantry(...recipes.flatMap((recipe) => recipe.ingredients.map(({ id }) => id))),
        tasteSignals: [tasteSignal('taste-only-recipe')],
        portionInput: { bodyProfile: makeBodyProfile(), satietyLevel: null },
      })
    );

    expect(plan).toEqual(fixture.weeklyMealPlan);
  });
});

describe('multi-slot and multi-day planning', () => {
  it('generates a 3-day 3-slot plan with 9 entries ordered by date then slot', () => {
    const recipes: Recipe[] = [
      makeRecipe({ id: 'bk-1', mealSlots: ['breakfast'], ingredients: [ingredient('egg')] }),
      makeRecipe({ id: 'lu-1', mealSlots: ['lunch'], ingredients: [ingredient('bread')] }),
      makeRecipe({ id: 'di-1', mealSlots: ['dinner'], ingredients: [ingredient('rice')] }),
    ];
    const days: DailyPlanPreference[] = [
      makeDailyPlanPreference({ date: '2026-08-24', mealSlot: 'breakfast' }),
      makeDailyPlanPreference({ date: '2026-08-24', mealSlot: 'lunch' }),
      makeDailyPlanPreference({ date: '2026-08-24', mealSlot: 'dinner' }),
      makeDailyPlanPreference({ date: '2026-08-25', mealSlot: 'breakfast' }),
      makeDailyPlanPreference({ date: '2026-08-25', mealSlot: 'lunch' }),
      makeDailyPlanPreference({ date: '2026-08-25', mealSlot: 'dinner' }),
      makeDailyPlanPreference({ date: '2026-08-26', mealSlot: 'breakfast' }),
      makeDailyPlanPreference({ date: '2026-08-26', mealSlot: 'lunch' }),
      makeDailyPlanPreference({ date: '2026-08-26', mealSlot: 'dinner' }),
    ];

    const plan = planWeek(
      makePlanInput({
        recipes,
        days,
        pantry: pantry('egg', 'bread', 'rice'),
      })
    );

    expect(plan.dayCount).toBe(3);
    expect(plan.mealSlots).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(plan.entries).toHaveLength(9);
    expect(plan.entries.map((e) => `${e.date}:${e.mealSlot}`)).toEqual([
      '2026-08-24:breakfast',
      '2026-08-24:lunch',
      '2026-08-24:dinner',
      '2026-08-25:breakfast',
      '2026-08-25:lunch',
      '2026-08-25:dinner',
      '2026-08-26:breakfast',
      '2026-08-26:lunch',
      '2026-08-26:dinner',
    ]);
    expect(plan.entries.map((e) => (e.kind === 'recipe' ? e.recipeId : null))).toEqual([
      'bk-1',
      'lu-1',
      'di-1',
      'bk-1',
      'lu-1',
      'di-1',
      'bk-1',
      'lu-1',
      'di-1',
    ]);
  });

  it('aggregates grocery needs across multiple meal slots on the same date', () => {
    const recipes: Recipe[] = [
      makeRecipe({
        id: 'bk-1',
        mealSlots: ['breakfast'],
        ingredients: [ingredient('shared-onion'), ingredient('egg')],
      }),
      makeRecipe({
        id: 'di-1',
        mealSlots: ['dinner'],
        ingredients: [ingredient('shared-onion'), ingredient('beef')],
      }),
    ];
    const days: DailyPlanPreference[] = [
      makeDailyPlanPreference({ date: '2026-08-24', mealSlot: 'breakfast' }),
      makeDailyPlanPreference({ date: '2026-08-24', mealSlot: 'dinner' }),
      makeDailyPlanPreference({ date: '2026-08-25', mealSlot: 'breakfast' }),
      makeDailyPlanPreference({ date: '2026-08-25', mealSlot: 'dinner' }),
      makeDailyPlanPreference({ date: '2026-08-26', mealSlot: 'breakfast' }),
      makeDailyPlanPreference({ date: '2026-08-26', mealSlot: 'dinner' }),
    ];

    const plan = planWeek(
      makePlanInput({
        recipes,
        days,
        pantry: pantry(), // empty pantry so all ingredients become grocery needs
      })
    );

    const sharedOnionNeed = plan.groceryNeeds.find((g) => g.ingredientId === 'shared-onion');
    expect(sharedOnionNeed).toBeDefined();
    expect(sharedOnionNeed?.recipeIds).toContain('bk-1');
    expect(sharedOnionNeed?.recipeIds).toContain('di-1');
    expect(sharedOnionNeed?.dates).toContain('2026-08-24');
  });

  it('fills all slots with the single safe recipe and marks limitedVariety: true', () => {
    const recipes: Recipe[] = [
      makeRecipe({ id: 'only-one', mealSlots: ['breakfast', 'lunch', 'dinner'] }),
    ];
    const days: DailyPlanPreference[] = [
      makeDailyPlanPreference({ date: '2026-08-24', mealSlot: 'lunch' }),
      makeDailyPlanPreference({ date: '2026-08-24', mealSlot: 'dinner' }),
      makeDailyPlanPreference({ date: '2026-08-25', mealSlot: 'lunch' }),
      makeDailyPlanPreference({ date: '2026-08-25', mealSlot: 'dinner' }),
      makeDailyPlanPreference({ date: '2026-08-26', mealSlot: 'lunch' }),
      makeDailyPlanPreference({ date: '2026-08-26', mealSlot: 'dinner' }),
    ];

    const plan = planWeek(
      makePlanInput({
        recipes,
        days,
        pantry: pantry(),
      })
    );

    expect(plan.limitedVariety).toBe(true);
    expect(plan.entries).toHaveLength(6);
    expect(plan.entries.every((e) => e.kind === 'recipe' && e.recipeId === 'only-one')).toBe(true);
  });

  it('swaps a specific meal slot while preserving other slots and updating groceries', () => {
    const recipes: Recipe[] = [
      makeRecipe({ id: 'curry', mealSlots: ['dinner'], ingredients: [ingredient('curry-powder')] }),
      makeRecipe({ id: 'stew', mealSlots: ['dinner'], ingredients: [ingredient('stew-meat')] }),
      makeRecipe({ id: 'toast', mealSlots: ['breakfast'], ingredients: [ingredient('bread')] }),
    ];
    const days: DailyPlanPreference[] = [
      makeDailyPlanPreference({ date: '2026-08-24', mealSlot: 'breakfast' }),
      makeDailyPlanPreference({ date: '2026-08-24', mealSlot: 'dinner' }),
      makeDailyPlanPreference({ date: '2026-08-25', mealSlot: 'breakfast' }),
      makeDailyPlanPreference({ date: '2026-08-25', mealSlot: 'dinner' }),
      makeDailyPlanPreference({ date: '2026-08-26', mealSlot: 'breakfast' }),
      makeDailyPlanPreference({ date: '2026-08-26', mealSlot: 'dinner' }),
    ];

    const planInput = makePlanInput({
      recipes,
      days,
      pantry: pantry(),
    });
    const initialPlan = planWeek(planInput);

    const dinnerEntry = initialPlan.entries.find(
      (e) => e.date === '2026-08-24' && e.mealSlot === 'dinner'
    );
    expect(dinnerEntry?.kind).toBe('recipe');
    const originalRecipeId = (dinnerEntry as { recipeId: string }).recipeId;

    const swappedPlan = swapPlanMeal(initialPlan, '2026-08-24:dinner', planInput);
    expect(swappedPlan).not.toBeNull();
    const newDinnerEntry = swappedPlan?.entries.find(
      (e) => e.date === '2026-08-24' && e.mealSlot === 'dinner'
    );
    expect(newDinnerEntry?.kind).toBe('recipe');
    expect((newDinnerEntry as { recipeId: string }).recipeId).not.toBe(originalRecipeId);

    // Other entries remain unchanged
    const breakfastEntry = swappedPlan?.entries.find(
      (e) => e.date === '2026-08-24' && e.mealSlot === 'breakfast'
    );
    expect((breakfastEntry as { recipeId: string }).recipeId).toBe('toast');

    // Returns null for invalid key
    expect(swapPlanMeal(initialPlan, '2099-01-01:dinner', planInput)).toBeNull();
  });
});
