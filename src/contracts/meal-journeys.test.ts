import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  bodyProfileSchema,
  continuousOnboardingProgressSchema,
  continuousOnboardingPromptStateSchema,
  dualMealJourneysFixtureSchema,
  mealJourneySchema,
  mealReminderPreferencesSchema,
  mealSatietyInputSchema,
  mealSatietyRecordSchema,
  mealJourneysJsonSchema,
  nutritionProvenanceSchema,
  tasteSignalSchema,
  validatePortableMealJourneysSemantics,
  weeklyMealPlanSchema,
} from '@/contracts/meal-journeys';
import type {
  PlanLinkedGroceryNeed,
  RecipeWeeklyEntry,
  WeeklyMealPlan,
} from '@/contracts/meal-journeys';

const validBodyProfile = {
  ageYears: 32,
  heightCentimeters: 168,
  weightKilograms: 68.5,
  calculationSex: 'female',
  activityLevel: 'moderate',
  goal: 'maintain',
  pregnant: false,
  breastfeeding: false,
};

const validNutritionProvenance = {
  usdaFdcIds: [171287, 173424],
  cacheChecksum: 'a'.repeat(64),
  matchMethod: 'alias',
  sourceVersion: 'FoodData Central 2026-08',
  calculatedAt: '2026-08-22T12:00:00-07:00',
  confidence: 0.82,
};

const recipeEntry = {
  kind: 'recipe',
  date: '2026-08-24',
  mealSlot: 'dinner' as const,
  recipeId: 'recipe-1',
  plannedMealTime: '2026-08-24T18:30:00-07:00',
  statedRelaxations: ['time'],
  portionGuidance: {
    servings: 1.25,
    label: 'Start with 1.25 servings',
    disclaimer: 'Estimate only—adjust to your hunger.',
  },
};

const weeklyEntries = Array.from({ length: 7 }, (_, index) => {
  const date = `2026-08-${String(24 + index).padStart(2, '0')}`;
  return {
    ...recipeEntry,
    date,
    mealSlot: 'dinner' as const,
    recipeId: `recipe-${index + 1}`,
    plannedMealTime: `${date}T18:30:00-07:00`,
  };
});

const validWeeklyPlan = {
  weekStart: '2026-08-24',
  dayCount: 7 as const,
  mealSlots: ['dinner'] as const,
  limitedVariety: false,
  entries: weeklyEntries,
  status: 'draft',
  groceryNeeds: [
    {
      ingredientId: 'chickpea',
      recipeIds: ['recipe-1'],
      dates: ['2026-08-24'],
    },
  ],
  statedRelaxations: ['time'],
};

type MutableFixture = {
  onboardingPromptState: {
    shownThisSession: boolean;
    activePrompt: string | null;
  };
  weeklyMealPlan: {
    weekStart: string;
    entries: Array<{
      kind: string;
      date: string;
      plannedMealTime?: string;
      reason?: string;
    }>;
    groceryNeeds: Array<{
      ingredientId: string;
      recipeIds: string[];
      dates: string[];
    }>;
  };
};

type IsReadonlyArray<Value> = Value extends readonly unknown[]
  ? Value extends unknown[]
    ? false
    : true
  : false;

describe('closed domains', () => {
  it('accepts only the two meal journeys', () => {
    expect(mealJourneySchema.parse('now')).toBe('now');
    expect(mealJourneySchema.parse('week')).toBe('week');
    expect(mealJourneySchema.safeParse('browse').success).toBe(false);
  });

  it('rejects unknown object fields', () => {
    expect(bodyProfileSchema.safeParse({ ...validBodyProfile, calories: 2_000 }).success).toBe(
      false
    );
  });
});

describe('bodyProfileSchema', () => {
  it('rejects underage and out-of-bounds body fields', () => {
    expect(bodyProfileSchema.safeParse({ ...validBodyProfile, ageYears: 17 }).success).toBe(false);
    expect(
      bodyProfileSchema.safeParse({ ...validBodyProfile, heightCentimeters: 231 }).success
    ).toBe(false);
    expect(bodyProfileSchema.safeParse({ ...validBodyProfile, weightKilograms: 34 }).success).toBe(
      false
    );
  });

  it('accepts adult profiles that require pregnancy or breastfeeding fallback', () => {
    expect(bodyProfileSchema.safeParse({ ...validBodyProfile, pregnant: true }).success).toBe(true);
    expect(bodyProfileSchema.safeParse({ ...validBodyProfile, breastfeeding: true }).success).toBe(
      true
    );
  });
});

describe('nutritionProvenanceSchema', () => {
  it('parses complete deterministic USDA provenance', () => {
    expect(nutritionProvenanceSchema.parse(validNutritionProvenance)).toEqual(
      validNutritionProvenance
    );
  });

  it.each([
    { usdaFdcIds: [] },
    { usdaFdcIds: [2, 1] },
    { usdaFdcIds: [1, 1] },
    { usdaFdcIds: [0] },
    { cacheChecksum: 'A'.repeat(64) },
    { matchMethod: 'fuzzy' },
    { sourceVersion: '' },
    { calculatedAt: '2026-08-22T12:00-07:00' },
    { confidence: -0.01 },
    { confidence: 1.01 },
  ])('rejects malformed USDA provenance %#', (override) => {
    expect(
      nutritionProvenanceSchema.safeParse({ ...validNutritionProvenance, ...override }).success
    ).toBe(false);
  });
});

describe('personal signal schemas', () => {
  it('parses a selected-photo taste signal', () => {
    expect(
      tasteSignalSchema.parse({
        kind: 'photo_selected',
        recipeId: 'recipe-1',
        journey: 'now',
        recordedAt: '2026-08-23T12:00:00Z',
      })
    ).toEqual({
      kind: 'photo_selected',
      recipeId: 'recipe-1',
      journey: 'now',
      recordedAt: '2026-08-23T12:00:00Z',
    });
  });

  it('keeps the satiety insert and append-only record contracts separate', () => {
    const input = { recipeId: 'recipe-1', level: 'satisfied' };
    expect(mealSatietyInputSchema.parse(input)).toEqual(input);
    expect(
      mealSatietyInputSchema.safeParse({
        ...input,
        id: '6c35893f-df48-4e7c-9914-c2390b51c040',
      }).success
    ).toBe(false);

    expect(
      mealSatietyRecordSchema.parse({
        ...input,
        id: '6c35893f-df48-4e7c-9914-c2390b51c040',
        userId: '9659c59f-0a9e-45d6-a040-5b161d28771e',
        recordedAt: '2026-08-23T12:00:00Z',
      }).userId
    ).toBe('9659c59f-0a9e-45d6-a040-5b161d28771e');
  });
});

describe('continuous onboarding and reminders', () => {
  const updatedAt = '2026-08-23T12:00:00Z';

  it('parses durable onboarding progress separately from session prompt state', () => {
    const progress = {
      safetyCompleted: true,
      weekPreferenceCompleted: false,
      photoTasteCompleted: false,
      bodyProfileCompleted: false,
      reminderCompleted: false,
      updatedAt,
    };
    const prompt = { shownThisSession: true, activePrompt: 'photo_taste' };

    expect(continuousOnboardingProgressSchema.parse(progress)).toEqual(progress);
    expect(continuousOnboardingPromptStateSchema.parse(prompt)).toEqual(prompt);
    expect(
      continuousOnboardingProgressSchema.safeParse({ ...progress, shownThisSession: true }).success
    ).toBe(false);
  });

  it('rejects an active prompt before the session has shown one', () => {
    expect(
      continuousOnboardingPromptStateSchema.safeParse({
        shownThisSession: false,
        activePrompt: 'safety',
      }).success
    ).toBe(false);
  });

  it.each([0, 10, 15, 30, 60])('accepts reminder lead %i', (leadMinutes) => {
    expect(
      mealReminderPreferencesSchema.safeParse({ enabled: true, leadMinutes, updatedAt }).success
    ).toBe(true);
  });

  it.each([-1, 5, 20, 61])('rejects unsupported reminder lead %i', (leadMinutes) => {
    expect(
      mealReminderPreferencesSchema.safeParse({ enabled: true, leadMinutes, updatedAt }).success
    ).toBe(false);
  });
});

describe('weeklyMealPlanSchema', () => {
  it('accepts an intentionally unplanned day without treating it as a safety failure', () => {
    const entries = weeklyEntries.map((entry, index) =>
      index === 3
        ? {
            kind: 'day_of_decision' as const,
            date: entry.date,
            mealSlot: 'dinner' as const,
            reason: 'not_planned' as const,
          }
        : entry
    );
    expect(weeklyMealPlanSchema.safeParse({ ...validWeeklyPlan, entries }).success).toBe(true);
  });
  it('accepts exactly seven consecutive dated entries', () => {
    expect(weeklyMealPlanSchema.parse(validWeeklyPlan).entries).toHaveLength(7);
    expect(
      weeklyMealPlanSchema.safeParse({ ...validWeeklyPlan, entries: weeklyEntries.slice(0, 6) })
        .success
    ).toBe(false);
    expect(
      weeklyMealPlanSchema.safeParse({
        ...validWeeklyPlan,
        entries: [...weeklyEntries, { ...weeklyEntries[6], date: '2026-08-31' }],
      }).success
    ).toBe(false);
  });

  it('requires a numeric UTC offset and matching local date', () => {
    const withMealTime = (plannedMealTime: string) => ({
      ...validWeeklyPlan,
      entries: [{ ...weeklyEntries[0], plannedMealTime }, ...weeklyEntries.slice(1)],
    });

    expect(weeklyMealPlanSchema.safeParse(withMealTime('2026-08-24T18:30:00Z')).success).toBe(
      false
    );
    expect(weeklyMealPlanSchema.safeParse(withMealTime('2026-08-25T01:30:00-07:00')).success).toBe(
      false
    );
    expect(weeklyMealPlanSchema.safeParse(withMealTime('2026-08-24T18:30:00-07:00')).success).toBe(
      true
    );
  });

  it('requires seconds in an RFC 3339 planned meal time', () => {
    const entries = [
      { ...weeklyEntries[0], plannedMealTime: '2026-08-24T18:30-07:00' },
      ...weeklyEntries.slice(1),
    ];
    expect(weeklyMealPlanSchema.safeParse({ ...validWeeklyPlan, entries }).success).toBe(false);
  });

  it('rejects more than 12 unique plan-linked grocery needs', () => {
    const groceryNeeds = Array.from({ length: 13 }, (_, index) => ({
      ingredientId: `ingredient-${index}`,
      recipeIds: ['recipe-1'],
      dates: ['2026-08-24'],
    }));
    expect(weeklyMealPlanSchema.safeParse({ ...validWeeklyPlan, groceryNeeds }).success).toBe(
      false
    );
  });

  it('rejects duplicate canonical ingredient IDs in plan-linked needs', () => {
    const groceryNeeds = [
      validWeeklyPlan.groceryNeeds[0],
      {
        ingredientId: 'chickpea',
        recipeIds: ['recipe-2'],
        dates: ['2026-08-25'],
      },
    ];
    expect(weeklyMealPlanSchema.safeParse({ ...validWeeklyPlan, groceryNeeds }).success).toBe(
      false
    );
  });
});

describe('public readonly array contracts', () => {
  it('exposes weekly collections as readonly without freezing parsed JSON', () => {
    expectTypeOf<IsReadonlyArray<RecipeWeeklyEntry['statedRelaxations']>>().toEqualTypeOf<true>();
    expectTypeOf<IsReadonlyArray<PlanLinkedGroceryNeed['recipeIds']>>().toEqualTypeOf<true>();
    expectTypeOf<IsReadonlyArray<PlanLinkedGroceryNeed['dates']>>().toEqualTypeOf<true>();
    expectTypeOf<IsReadonlyArray<WeeklyMealPlan['entries']>>().toEqualTypeOf<true>();
    expectTypeOf<IsReadonlyArray<WeeklyMealPlan['groceryNeeds']>>().toEqualTypeOf<true>();
    expectTypeOf<IsReadonlyArray<WeeklyMealPlan['statedRelaxations']>>().toEqualTypeOf<true>();
  });
});

describe('cross-platform artifacts', () => {
  const sharedPath = (relativePath: string) =>
    fileURLToPath(new URL(`../../shared/${relativePath}`, import.meta.url));

  it('parses the shared acceptance fixture', () => {
    const fixture = JSON.parse(
      readFileSync(sharedPath('fixtures/dual-meal-journeys.json'), 'utf8')
    );
    const checkedIn = JSON.parse(
      readFileSync(sharedPath('contracts/meal-journeys.schema.json'), 'utf8')
    ) as Record<string, unknown>;
    expect(dualMealJourneysFixtureSchema.parse(fixture)).toEqual(fixture);
    expect(
      validatePortableMealJourneysSemantics(fixture, checkedIn['x-decisioneats-semanticValidation'])
        .success
    ).toBe(true);
  });

  it('keeps checked-in JSON Schema generation stable', () => {
    const checkedIn = readFileSync(sharedPath('contracts/meal-journeys.schema.json'), 'utf8');
    expect(JSON.stringify(JSON.parse(checkedIn))).toBe(JSON.stringify(mealJourneysJsonSchema));
  });

  it('expresses quarter-serving increments with JSON Schema multipleOf', () => {
    const checkedIn = JSON.parse(
      readFileSync(sharedPath('contracts/meal-journeys.schema.json'), 'utf8')
    );
    expect(collectValuesForKey(checkedIn, 'multipleOf')).toContain(0.25);
  });

  it('embeds the portable semantic-validation rule contract', () => {
    const checkedIn = JSON.parse(
      readFileSync(sharedPath('contracts/meal-journeys.schema.json'), 'utf8')
    ) as Record<string, unknown>;
    const semanticContract = checkedIn['x-decisioneats-semanticValidation'];

    expect(semanticContract).toMatchObject({
      version: 2,
      validator: 'decisioneats.dual-meal-journeys.v2',
      rules: [
        { id: 'prompt_state_lifecycle' },
        { id: 'planned_time_local_date' },
        { id: 'selected_meal_slot_coverage' },
        { id: 'unique_grocery_ingredient_ids' },
        { id: 'ascending_usda_fdc_ids' },
      ],
    });
  });

  it('expresses unique USDA FDC IDs with a JSON Schema primitive', () => {
    const checkedIn = JSON.parse(
      readFileSync(sharedPath('contracts/meal-journeys.schema.json'), 'utf8')
    );
    expect(collectValuesForKey(checkedIn, 'uniqueItems')).toContain(true);
  });

  it('rejects cross-field violations through runtime and portable validation', () => {
    const checkedIn = JSON.parse(
      readFileSync(sharedPath('contracts/meal-journeys.schema.json'), 'utf8')
    ) as Record<string, unknown>;
    const semanticContract = checkedIn['x-decisioneats-semanticValidation'];
    const validFixture = JSON.parse(
      readFileSync(sharedPath('fixtures/dual-meal-journeys.json'), 'utf8')
    ) as MutableFixture;

    const invalidPrompt = structuredClone(validFixture);
    invalidPrompt.onboardingPromptState = {
      shownThisSession: false,
      activePrompt: 'safety',
    };

    const invalidPlannedDate = structuredClone(validFixture);
    const plannedEntry = invalidPlannedDate.weeklyMealPlan.entries[0];
    if (plannedEntry) plannedEntry.plannedMealTime = '2026-08-25T18:30:00-07:00';

    const invalidDates = structuredClone(validFixture);
    invalidDates.weeklyMealPlan.entries[3] = {
      kind: 'day_of_decision',
      date: '2026-08-26',
      reason: 'no_safe_recipe',
    };

    const invalidNeeds = structuredClone(validFixture);
    const duplicateNeed = {
      ingredientId: 'fixture-missing',
      recipeIds: ['recipe-1'],
      dates: ['2026-08-24'],
    };
    invalidNeeds.weeklyMealPlan.groceryNeeds = [duplicateNeed, structuredClone(duplicateNeed)];

    const invalidProvenance = structuredClone(validFixture) as MutableFixture & {
      nutritionProvenance: { usdaFdcIds: number[] };
    };
    invalidProvenance.nutritionProvenance.usdaFdcIds = [173424, 171287];

    for (const invalidFixture of [
      invalidPrompt,
      invalidPlannedDate,
      invalidDates,
      invalidNeeds,
      invalidProvenance,
    ]) {
      expect(dualMealJourneysFixtureSchema.safeParse(invalidFixture).success).toBe(false);
      expect(validatePortableMealJourneysSemantics(invalidFixture, semanticContract).success).toBe(
        false
      );
    }
  });
});

function collectValuesForKey(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectValuesForKey(entry, key));
  }
  if (typeof value !== 'object' || value === null) return [];

  const record = value as Record<string, unknown>;
  return [
    ...(key in record ? [record[key]] : []),
    ...Object.values(record).flatMap((entry) => collectValuesForKey(entry, key)),
  ];
}
