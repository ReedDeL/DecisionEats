import { z } from 'zod';
import { hasMealSlotCoverage, mealSlotSchema, type MealSlot } from './meal-slots';
export {
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  mealEntryKey,
  mealSlotSchema,
  type MealSlot,
} from './meal-slots';

export const mealJourneySchema = z.enum(['now', 'week']);
export type MealJourney = z.infer<typeof mealJourneySchema>;

export const bodyGoalSchema = z.enum(['lose', 'maintain', 'gain']);
export type BodyGoal = z.infer<typeof bodyGoalSchema>;

export const activityLevelSchema = z.enum([
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
]);
export type ActivityLevel = z.infer<typeof activityLevelSchema>;

export const calculationSexSchema = z.enum(['female', 'male']);
export type CalculationSex = z.infer<typeof calculationSexSchema>;

export const nutritionConfidenceSchema = z.enum(['high', 'medium', 'low', 'unavailable']);
export type NutritionConfidence = z.infer<typeof nutritionConfidenceSchema>;

export interface NutritionProvenance {
  usdaFdcIds: readonly number[];
  cacheChecksum: string;
  matchMethod: 'exact' | 'alias';
  sourceVersion: string;
  calculatedAt: string;
  confidence: number;
}

export const tasteSignalKindSchema = z.literal('photo_selected');
export type TasteSignalKind = z.infer<typeof tasteSignalKindSchema>;

export const mealSatietyLevelSchema = z.enum(['still_hungry', 'satisfied', 'too_full']);
export type MealSatietyLevel = z.infer<typeof mealSatietyLevelSchema>;

export const continuousOnboardingPromptKindSchema = z.enum([
  'safety',
  'week_preference',
  'photo_taste',
  'body_profile',
  'reminder',
]);
export type ContinuousOnboardingPromptKind = z.infer<typeof continuousOnboardingPromptKindSchema>;

export const weeklyEntryKindSchema = z.enum(['recipe', 'day_of_decision']);
export type WeeklyEntryKind = z.infer<typeof weeklyEntryKindSchema>;

export const weeklyPlanStatusSchema = z.enum(['draft', 'confirmed']);
export type WeeklyPlanStatus = z.infer<typeof weeklyPlanStatusSchema>;

export const reminderLeadMinutesSchema = z.union([
  z.literal(0),
  z.literal(10),
  z.literal(15),
  z.literal(30),
  z.literal(60),
]);
export type ReminderLeadMinutes = z.infer<typeof reminderLeadMinutesSchema>;

const nonEmptyIdSchema = z.string().min(1);
const timestampSchema = z.iso.datetime({ offset: true });
const localDateSchema = z.iso.date();
const statedRelaxationSchema = z.enum(['time', 'cuisine']);
const strictRfc3339WithOffsetSchema = z.iso
  .datetime({ offset: true })
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}:\d{2}$/,
    'Seconds and a numeric UTC offset are required'
  );

export const nutritionProvenanceSchema: z.ZodType<NutritionProvenance> = z
  .strictObject({
    usdaFdcIds: z.array(z.number().int().positive().safe()).min(1).meta({ uniqueItems: true }),
    cacheChecksum: z.string().regex(/^[a-f0-9]{64}$/),
    matchMethod: z.enum(['exact', 'alias']),
    sourceVersion: z.string().min(1),
    calculatedAt: strictRfc3339WithOffsetSchema,
    confidence: z.number().min(0).max(1),
  })
  .refine((provenance) => isStrictlyAscending(provenance.usdaFdcIds), {
    message: 'USDA FDC IDs must be unique and ascending',
    path: ['usdaFdcIds'],
  });

export const bodyProfileSchema = z.strictObject({
  ageYears: z.number().int().min(18).max(120),
  heightCentimeters: z.number().min(120).max(230),
  weightKilograms: z.number().min(35).max(300),
  calculationSex: calculationSexSchema,
  activityLevel: activityLevelSchema,
  goal: bodyGoalSchema,
  pregnant: z.boolean(),
  breastfeeding: z.boolean(),
});
export type BodyProfile = z.infer<typeof bodyProfileSchema>;

export const tasteSignalSchema = z.strictObject({
  kind: tasteSignalKindSchema,
  recipeId: nonEmptyIdSchema,
  journey: mealJourneySchema,
  recordedAt: timestampSchema,
});
export type TasteSignal = z.infer<typeof tasteSignalSchema>;

export const mealSatietyInputSchema = z.strictObject({
  recipeId: nonEmptyIdSchema,
  level: mealSatietyLevelSchema,
});
export type MealSatietyInput = z.infer<typeof mealSatietyInputSchema>;

export const mealSatietyRecordSchema = z.strictObject({
  id: z.uuid(),
  userId: z.uuid(),
  recordedAt: timestampSchema,
  recipeId: nonEmptyIdSchema,
  level: mealSatietyLevelSchema,
});
export type MealSatietyRecord = z.infer<typeof mealSatietyRecordSchema>;

export const portionGuidanceSchema = z.strictObject({
  servings: z.number().min(0.75).max(1.5).multipleOf(0.25),
  label: z.string().regex(/^Start with .+ servings?$/),
  disclaimer: z.literal('Estimate only—adjust to your hunger.'),
});
export type PortionGuidance = z.infer<typeof portionGuidanceSchema>;

export const continuousOnboardingProgressSchema = z.strictObject({
  safetyCompleted: z.boolean(),
  weekPreferenceCompleted: z.boolean(),
  photoTasteCompleted: z.boolean(),
  bodyProfileCompleted: z.boolean(),
  reminderCompleted: z.boolean(),
  updatedAt: timestampSchema,
});
export type ContinuousOnboardingProgress = z.infer<typeof continuousOnboardingProgressSchema>;

export const continuousOnboardingPromptStateSchema = z
  .strictObject({
    shownThisSession: z.boolean(),
    activePrompt: continuousOnboardingPromptKindSchema.nullable(),
  })
  .refine((state) => state.shownThisSession || state.activePrompt === null, {
    message: 'An active prompt requires shownThisSession',
    path: ['activePrompt'],
  });
export type ContinuousOnboardingPromptState = z.infer<typeof continuousOnboardingPromptStateSchema>;

export const mealReminderPreferencesSchema = z.strictObject({
  enabled: z.boolean(),
  leadMinutes: reminderLeadMinutesSchema,
  updatedAt: timestampSchema,
});
export type MealReminderPreferences = z.infer<typeof mealReminderPreferencesSchema>;

const plannedMealTimeSchema = strictRfc3339WithOffsetSchema;

export interface RecipeWeeklyEntry {
  kind: 'recipe';
  date: string;
  mealSlot: MealSlot;
  recipeId: string;
  plannedMealTime: string;
  statedRelaxations: readonly ('time' | 'cuisine')[];
  portionGuidance: PortionGuidance | null;
}

export const recipeWeeklyEntrySchema: z.ZodType<RecipeWeeklyEntry> = z
  .strictObject({
    kind: z.literal('recipe'),
    date: localDateSchema,
    mealSlot: mealSlotSchema,
    recipeId: nonEmptyIdSchema,
    plannedMealTime: plannedMealTimeSchema,
    statedRelaxations: z.array(statedRelaxationSchema),
    portionGuidance: portionGuidanceSchema.nullable(),
  })
  .refine((entry) => entry.plannedMealTime.startsWith(`${entry.date}T`), {
    message: 'The planned meal time local date must match date',
    path: ['plannedMealTime'],
  });

export const dayOfDecisionWeeklyEntrySchema = z.strictObject({
  kind: z.literal('day_of_decision'),
  date: localDateSchema,
  mealSlot: mealSlotSchema,
  reason: z.enum(['no_safe_recipe', 'grocery_need_cap', 'not_planned']),
});
export type DayOfDecisionWeeklyEntry = z.infer<typeof dayOfDecisionWeeklyEntrySchema>;

export interface PlanLinkedGroceryNeed {
  ingredientId: string;
  recipeIds: readonly string[];
  dates: readonly string[];
}

export const planLinkedGroceryNeedSchema: z.ZodType<PlanLinkedGroceryNeed> = z.strictObject({
  ingredientId: nonEmptyIdSchema,
  recipeIds: z.array(nonEmptyIdSchema).min(1),
  dates: z.array(localDateSchema).min(1),
});

const weeklyEntrySchema = z.union([recipeWeeklyEntrySchema, dayOfDecisionWeeklyEntrySchema]);

export interface WeeklyMealPlan {
  weekStart: string;
  dayCount: 3 | 5 | 7;
  mealSlots: readonly MealSlot[];
  limitedVariety: boolean;
  entries: readonly (RecipeWeeklyEntry | DayOfDecisionWeeklyEntry)[];
  status: WeeklyPlanStatus;
  groceryNeeds: readonly PlanLinkedGroceryNeed[];
  statedRelaxations: readonly ('time' | 'cuisine')[];
}

export const weeklyMealPlanSchema: z.ZodType<WeeklyMealPlan> = z
  .strictObject({
    weekStart: localDateSchema,
    dayCount: z.union([z.literal(3), z.literal(5), z.literal(7)]),
    mealSlots: z.array(mealSlotSchema).min(1).max(3),
    limitedVariety: z.boolean(),
    entries: z.array(weeklyEntrySchema).min(3).max(21),
    status: weeklyPlanStatusSchema,
    groceryNeeds: z.array(planLinkedGroceryNeedSchema).max(12),
    statedRelaxations: z.array(statedRelaxationSchema),
  })
  .superRefine((plan, context) => {
    if (!hasMealSlotCoverage(plan.weekStart, plan.dayCount, plan.mealSlots, plan.entries)) {
      context.addIssue({
        code: 'custom',
        message: 'Entries must cover each selected date and meal slot exactly once in order',
        path: ['entries'],
      });
    }

    const ingredientIds = plan.groceryNeeds.map((need) => need.ingredientId);
    if (new Set(ingredientIds).size !== ingredientIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Grocery needs must have unique ingredient IDs',
        path: ['groceryNeeds'],
      });
    }
  });

export const dualMealJourneysFixtureSchema = z.strictObject({
  mealJourney: mealJourneySchema,
  nutritionConfidence: nutritionConfidenceSchema,
  nutritionProvenance: nutritionProvenanceSchema,
  bodyProfile: bodyProfileSchema,
  tasteSignal: tasteSignalSchema,
  mealSatietyInput: mealSatietyInputSchema,
  mealSatietyRecord: mealSatietyRecordSchema,
  onboardingProgress: continuousOnboardingProgressSchema,
  onboardingPromptState: continuousOnboardingPromptStateSchema,
  reminderPreferences: mealReminderPreferencesSchema,
  weeklyMealPlan: weeklyMealPlanSchema,
});
export type DualMealJourneysFixture = z.infer<typeof dualMealJourneysFixtureSchema>;

const portableSemanticValidationContract = {
  version: 2,
  validator: 'decisioneats.dual-meal-journeys.v2',
  rules: [
    {
      id: 'prompt_state_lifecycle',
      kind: 'conditional_null',
      path: '/onboardingPromptState',
      whenField: 'shownThisSession',
      whenEquals: false,
      nullField: 'activePrompt',
    },
    {
      id: 'planned_time_local_date',
      kind: 'matching_local_date',
      path: '/weeklyMealPlan/entries',
      discriminatorField: 'kind',
      discriminatorEquals: 'recipe',
      dateField: 'date',
      timestampField: 'plannedMealTime',
    },
    {
      id: 'selected_meal_slot_coverage',
      kind: 'meal_slot_coverage',
      path: '/weeklyMealPlan',
      startField: 'weekStart',
      entriesField: 'entries',
      dateField: 'date',
      dayCountField: 'dayCount',
      mealSlotsField: 'mealSlots',
      mealSlotField: 'mealSlot',
    },
    {
      id: 'unique_grocery_ingredient_ids',
      kind: 'unique_by',
      path: '/weeklyMealPlan/groceryNeeds',
      keyField: 'ingredientId',
    },
    {
      id: 'ascending_usda_fdc_ids',
      kind: 'strictly_ascending_numbers',
      path: '/nutritionProvenance/usdaFdcIds',
    },
  ],
} as const;

export const mealJourneysJsonSchema = {
  ...z.toJSONSchema(dualMealJourneysFixtureSchema),
  'x-decisioneats-semanticValidation': portableSemanticValidationContract,
};

export interface PortableSemanticValidationResult {
  success: boolean;
  issues: readonly string[];
}

export function validatePortableMealJourneysSemantics(
  input: unknown,
  contract: unknown
): PortableSemanticValidationResult {
  if (!hasPortableSemanticContract(contract)) {
    return { success: false, issues: ['semantic_contract'] };
  }

  const semanticContract = asRecord(contract);
  const rules = Array.isArray(semanticContract?.rules) ? semanticContract.rules : [];
  const issues: string[] = [];

  for (const value of rules) {
    const rule = asRecord(value);
    if (!rule) {
      issues.push('semantic_contract');
      continue;
    }
    const ruleId = rule.id;
    if (typeof ruleId !== 'string' || !validatePortableRule(input, rule)) {
      issues.push(typeof ruleId === 'string' ? ruleId : 'semantic_contract');
    }
  }

  return { success: issues.length === 0, issues };
}

function hasPortableSemanticContract(value: unknown): boolean {
  const contract = asRecord(value);
  if (
    contract?.version !== portableSemanticValidationContract.version ||
    contract.validator !== portableSemanticValidationContract.validator ||
    !Array.isArray(contract.rules)
  ) {
    return false;
  }

  const ruleIds = contract.rules.map((rule) => asRecord(rule)?.id);
  const expectedRuleIds = portableSemanticValidationContract.rules.map((rule) => rule.id);
  return JSON.stringify(ruleIds) === JSON.stringify(expectedRuleIds);
}

function validatePortableRule(input: unknown, rule: Record<string, unknown>): boolean {
  const path = rule.path;
  if (typeof path !== 'string') return false;
  const target = resolveJsonPointer(input, path);

  switch (rule.kind) {
    case 'conditional_null': {
      const record = asRecord(target);
      const whenField = rule.whenField;
      const nullField = rule.nullField;
      if (!record || typeof whenField !== 'string' || typeof nullField !== 'string') return false;
      return record[whenField] !== rule.whenEquals || record[nullField] === null;
    }
    case 'matching_local_date': {
      if (!Array.isArray(target)) return false;
      const discriminatorField = rule.discriminatorField;
      const dateField = rule.dateField;
      const timestampField = rule.timestampField;
      if (
        typeof discriminatorField !== 'string' ||
        typeof dateField !== 'string' ||
        typeof timestampField !== 'string'
      ) {
        return false;
      }
      return target.every((value) => {
        const record = asRecord(value);
        if (!record) return false;
        if (record[discriminatorField] !== rule.discriminatorEquals) return true;
        const date = record[dateField];
        const timestamp = record[timestampField];
        return (
          typeof date === 'string' &&
          typeof timestamp === 'string' &&
          timestamp.startsWith(`${date}T`)
        );
      });
    }
    case 'meal_slot_coverage': {
      const record = asRecord(target);
      const startField = rule.startField;
      const entriesField = rule.entriesField;
      const dateField = rule.dateField;
      if (
        !record ||
        typeof startField !== 'string' ||
        typeof entriesField !== 'string' ||
        typeof dateField !== 'string'
      ) {
        return false;
      }
      const weekStart = record[startField];
      const entries = record[entriesField];
      if (typeof weekStart !== 'string' || !Array.isArray(entries)) return false;
      const slots = z.array(mealSlotSchema).safeParse(record.mealSlots);
      const datedSlots = z
        .array(z.object({ date: localDateSchema, mealSlot: mealSlotSchema }))
        .safeParse(entries);
      return (
        slots.success &&
        datedSlots.success &&
        typeof record.dayCount === 'number' &&
        hasMealSlotCoverage(weekStart, record.dayCount, slots.data, datedSlots.data)
      );
    }
    case 'unique_by': {
      const keyField = rule.keyField;
      if (!Array.isArray(target) || typeof keyField !== 'string') return false;
      const keys = target.map((value) => asRecord(value)?.[keyField]);
      return (
        keys.every((key): key is string => typeof key === 'string') &&
        new Set(keys).size === keys.length
      );
    }
    case 'strictly_ascending_numbers':
      return (
        Array.isArray(target) &&
        target.every((value): value is number => typeof value === 'number') &&
        isStrictlyAscending(target)
      );
    default:
      return false;
  }
}

function resolveJsonPointer(input: unknown, path: string): unknown {
  if (path === '') return input;
  let current: unknown = input;
  for (const rawSegment of path.split('/').slice(1)) {
    const segment = rawSegment.replaceAll('~1', '/').replaceAll('~0', '~');
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[segment];
  }
  return current;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isStrictlyAscending(values: readonly number[]): boolean {
  return values.every((value, index) => {
    const previous = values[index - 1];
    return index === 0 || (previous !== undefined && previous < value);
  });
}
