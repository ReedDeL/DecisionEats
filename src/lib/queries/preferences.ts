/**
 * Personal data: preferences, allergens, dietary restrictions, and feedback.
 * These join to `user_id` and are structurally unreachable by household
 * members -- roommates share a pantry, never a diet.
 */
import { supabase } from '@/lib/supabase';
import {
  bodyProfileSchema,
  continuousOnboardingProgressSchema,
  mealReminderPreferencesSchema,
  mealSatietyRecordSchema,
  tasteSignalSchema,
  weeklyMealPlanSchema,
  type BodyProfile,
  type ContinuousOnboardingProgress,
  type MealReminderPreferences,
  type MealSatietyInput,
  type MealSatietyRecord,
  type TasteSignal,
  type WeeklyMealPlan,
} from '@/contracts/meal-journeys';
import type { Recipe } from '@/engine/types';
import { MEAL_SLOTS } from '@/contracts/meal-slots';
import {
  bodyProfilePersistence,
  mealReminderPreferencesPersistence,
  mealSatietyPersistence,
  onboardingProgressPersistence,
  tasteSignalPersistence,
  weeklyPlanPersistence,
} from '@/lib/meal-journey-persistence';
import type {
  FeedbackVerdict,
  MealFeedbackRow,
  ProfileRow,
  UserPreferencesRow,
} from '@/types/database';

const PROFILE_COLUMNS = 'id, household_id, display_name, created_at';
const PREFERENCES_COLUMNS = 'user_id, equipment, allergens, dietary, onboarding_done, updated_at';
const FEEDBACK_COLUMNS = 'user_id, recipe_id, verdict, made_on, created_at';
const BODY_PROFILE_COLUMNS =
  'user_id, age_years, height_centimeters, weight_kilograms, calculation_sex, activity_level, goal, pregnant, breastfeeding';
const TASTE_SIGNAL_COLUMNS = 'id, user_id, kind, recipe_id, journey, recorded_at';
const SATIETY_COLUMNS = 'id, user_id, recipe_id, level, recorded_at';
const ONBOARDING_COLUMNS =
  'user_id, safety_completed, week_preference_completed, photo_taste_completed, body_profile_completed, reminder_completed, updated_at';
const PLAN_COLUMNS =
  'id, user_id, week_start, status, stated_relaxations, day_count, meal_slots, limited_variety';
const PLAN_ENTRY_COLUMNS =
  'plan_id, user_id, entry_date, meal_slot, kind, recipe_id, planned_meal_time, reason, stated_relaxations, portion_servings, portion_label, portion_disclaimer';
const PLAN_NEED_COLUMNS = 'plan_id, user_id, ingredient_id, recipe_ids, dates';
const REMINDER_COLUMNS = 'user_id, enabled, lead_minutes, updated_at';

export async function fetchProfile(userId: string, client = supabase): Promise<ProfileRow | null> {
  const { data, error } = await client
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data as ProfileRow | null) ?? null;
}

export async function fetchPreferences(userId: string): Promise<UserPreferencesRow | null> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select(PREFERENCES_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data as UserPreferencesRow | null) ?? null;
}

export interface PreferencesUpdate {
  equipment?: string[];
  allergens?: string[];
  dietary?: string[];
  onboardingDone?: boolean;
}

export async function updatePreferences(userId: string, update: PreferencesUpdate): Promise<void> {
  const { error } = await supabase.from('user_preferences').upsert(
    {
      user_id: userId,
      ...(update.equipment !== undefined && { equipment: update.equipment }),
      ...(update.allergens !== undefined && { allergens: update.allergens }),
      ...(update.dietary !== undefined && { dietary: update.dietary }),
      ...(update.onboardingDone !== undefined && { onboarding_done: update.onboardingDone }),
    },
    { onConflict: 'user_id' }
  );

  if (error) throw error;
}

export async function fetchFeedback(userId: string): Promise<MealFeedbackRow[]> {
  const { data, error } = await supabase
    .from('meal_feedback')
    .select(FEEDBACK_COLUMNS)
    .eq('user_id', userId);

  if (error) throw error;
  return (data ?? []) as MealFeedbackRow[];
}

/**
 * `skipped` is a weak negative signal, `disliked` a strong one. Keeping them
 * distinct is what lets the engine de-rank one and eliminate the other.
 */
export async function recordVerdict(
  userId: string,
  recipeId: string,
  verdict: FeedbackVerdict
): Promise<void> {
  const { error } = await supabase
    .from('meal_feedback')
    .upsert({ user_id: userId, recipe_id: recipeId, verdict }, { onConflict: 'user_id,recipe_id' });

  if (error) throw error;
}

export async function fetchBodyProfile(userId: string): Promise<BodyProfile | null> {
  const { data, error } = await supabase
    .from('body_profiles')
    .select(BODY_PROFILE_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return bodyProfileSchema.parse({
    ageYears: data.age_years,
    heightCentimeters: data.height_centimeters,
    weightKilograms: data.weight_kilograms,
    calculationSex: data.calculation_sex,
    activityLevel: data.activity_level,
    goal: data.goal,
    pregnant: data.pregnant,
    breastfeeding: data.breastfeeding,
  });
}

export async function saveBodyProfile(userId: string, profile: BodyProfile): Promise<void> {
  const { error } = await supabase
    .from('body_profiles')
    .upsert(bodyProfilePersistence.toUpsert(userId, profile), { onConflict: 'user_id' });
  if (error) throw error;
}

export async function deleteBodyProfile(userId: string): Promise<void> {
  const filter = bodyProfilePersistence.toDelete(userId);
  const { error } = await supabase.from('body_profiles').delete().eq('user_id', filter.user_id);
  if (error) throw error;
}

export async function fetchTasteSignals(userId: string): Promise<TasteSignal[]> {
  const { data, error } = await supabase
    .from('taste_signals')
    .select(TASTE_SIGNAL_COLUMNS)
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) =>
    tasteSignalSchema.parse({
      kind: row.kind,
      recipeId: row.recipe_id,
      journey: row.journey,
      recordedAt: row.recorded_at,
    })
  );
}

export async function recordTasteSignal(userId: string, signal: TasteSignal): Promise<void> {
  const { error } = await supabase
    .from('taste_signals')
    .insert(tasteSignalPersistence.toInsert(userId, signal));
  if (error) throw error;
}

export async function fetchMealSatiety(userId: string): Promise<MealSatietyRecord[]> {
  const { data, error } = await supabase
    .from('meal_satiety')
    .select(SATIETY_COLUMNS)
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) =>
    mealSatietyRecordSchema.parse({
      id: row.id,
      userId: row.user_id,
      recipeId: row.recipe_id,
      level: row.level,
      recordedAt: row.recorded_at,
    })
  );
}

export async function recordMealSatiety(input: MealSatietyInput): Promise<void> {
  const { error } = await supabase
    .from('meal_satiety')
    .insert(mealSatietyPersistence.toInsert(input));
  if (error) throw error;
}

export async function fetchOnboardingProgress(
  userId: string
): Promise<ContinuousOnboardingProgress | null> {
  const { data, error } = await supabase
    .from('onboarding_progress')
    .select(ONBOARDING_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return continuousOnboardingProgressSchema.parse({
    safetyCompleted: data.safety_completed,
    weekPreferenceCompleted: data.week_preference_completed,
    photoTasteCompleted: data.photo_taste_completed,
    bodyProfileCompleted: data.body_profile_completed,
    reminderCompleted: data.reminder_completed,
    updatedAt: data.updated_at,
  });
}

export async function saveOnboardingProgress(
  userId: string,
  progress: Omit<ContinuousOnboardingProgress, 'updatedAt'>
): Promise<void> {
  const { error } = await supabase
    .from('onboarding_progress')
    .upsert(onboardingProgressPersistence.toUpsert(userId, progress), { onConflict: 'user_id' });
  if (error) throw error;
}

export async function createWeeklyMealPlan(
  userId: string,
  plan: WeeklyMealPlan,
  bundledCatalog: readonly Recipe[]
): Promise<string> {
  const creation = weeklyPlanPersistence.toCreation(userId, plan, bundledCatalog);
  const { data, error } = await supabase.rpc(creation.operation, {
    p_week_start: creation.parent.week_start,
    p_status: creation.parent.status,
    p_stated_relaxations: creation.parent.stated_relaxations,
    p_entries: creation.entries,
    p_grocery_needs: creation.groceryNeeds,
    p_limited_variety: creation.parent.limited_variety,
  });
  if (error) throw error;
  if (!data) throw new Error('Weekly plan creation returned no id');
  return data;
}

export async function replaceWeeklyMealPlanChildren(
  userId: string,
  planId: string,
  plan: WeeklyMealPlan,
  bundledCatalog: readonly Recipe[]
): Promise<void> {
  const replacement = weeklyPlanPersistence.toReplacement(userId, planId, plan, bundledCatalog);
  const pEntries = replacement.entries.map((row) => ({
    entry_date: row.entry_date,
    meal_slot: row.meal_slot,
    kind: row.kind,
    recipe_id: row.recipe_id,
    planned_meal_time: row.planned_meal_time,
    reason: row.reason,
    stated_relaxations: row.stated_relaxations,
    portion_servings: row.portion_servings,
    portion_label: row.portion_label,
    portion_disclaimer: row.portion_disclaimer,
  }));
  const pGroceryNeeds = replacement.groceryNeeds.map((row) => ({
    ingredient_id: row.ingredient_id,
    recipe_ids: row.recipe_ids,
    dates: row.dates,
  }));
  const { error } = await supabase.rpc(replacement.operation, {
    p_plan_id: replacement.deleteExisting.plan_id,
    p_entries: pEntries,
    p_grocery_needs: pGroceryNeeds,
    p_limited_variety: plan.limitedVariety,
  });
  if (error) throw error;
}

export async function confirmWeeklyMealPlan(userId: string, planId: string): Promise<void> {
  const confirmation = weeklyPlanPersistence.toConfirmation(userId, planId);
  const { error } = await supabase
    .from('weekly_meal_plans')
    .update(confirmation.update)
    .eq('id', confirmation.filter.id)
    .eq('user_id', confirmation.filter.user_id);
  if (error) throw error;
}

export async function deleteWeeklyMealPlan(userId: string, planId: string): Promise<void> {
  const { error } = await supabase
    .from('weekly_meal_plans')
    .delete()
    .eq('id', planId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function fetchWeeklyMealPlan(
  userId: string,
  weekStart: string
): Promise<WeeklyMealPlan | null> {
  const { data: parent, error: parentError } = await supabase
    .from('weekly_meal_plans')
    .select(PLAN_COLUMNS)
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (parentError) throw parentError;
  if (!parent) return null;

  const [entriesResult, needsResult] = await Promise.all([
    supabase
      .from('weekly_meal_plan_entries')
      .select(PLAN_ENTRY_COLUMNS)
      .eq('plan_id', parent.id)
      .eq('user_id', userId)
      .order('entry_date'),
    supabase
      .from('plan_linked_grocery_needs')
      .select(PLAN_NEED_COLUMNS)
      .eq('plan_id', parent.id)
      .eq('user_id', userId)
      .order('ingredient_id'),
  ]);
  if (entriesResult.error) throw entriesResult.error;
  if (needsResult.error) throw needsResult.error;

  return weeklyMealPlanSchema.parse({
    weekStart: parent.week_start,
    dayCount: parent.day_count,
    mealSlots: parent.meal_slots,
    limitedVariety: parent.limited_variety,
    status: parent.status,
    statedRelaxations: parent.stated_relaxations,
    entries: (entriesResult.data ?? [])
      .sort(
        (a, b) =>
          a.entry_date.localeCompare(b.entry_date) ||
          MEAL_SLOTS.indexOf(a.meal_slot as (typeof MEAL_SLOTS)[number]) -
            MEAL_SLOTS.indexOf(b.meal_slot as (typeof MEAL_SLOTS)[number])
      )
      .map((row) =>
        row.kind === 'recipe'
          ? {
              kind: row.kind,
              date: row.entry_date,
              mealSlot: row.meal_slot,
              recipeId: row.recipe_id,
              plannedMealTime: row.planned_meal_time,
              statedRelaxations: row.stated_relaxations,
              portionGuidance:
                row.portion_servings === null
                  ? null
                  : {
                      servings: row.portion_servings,
                      label: row.portion_label,
                      disclaimer: row.portion_disclaimer,
                    },
            }
          : { kind: row.kind, date: row.entry_date, mealSlot: row.meal_slot, reason: row.reason }
      ),
    groceryNeeds: (needsResult.data ?? []).map((row) => ({
      ingredientId: row.ingredient_id,
      recipeIds: row.recipe_ids,
      dates: row.dates,
    })),
  });
}

export async function fetchMealReminderPreferences(
  userId: string
): Promise<MealReminderPreferences | null> {
  const { data, error } = await supabase
    .from('meal_reminder_preferences')
    .select(REMINDER_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mealReminderPreferencesSchema.parse({
    enabled: data.enabled,
    leadMinutes: data.lead_minutes,
    updatedAt: data.updated_at,
  });
}

export async function saveMealReminderPreferences(
  userId: string,
  preferences: Omit<MealReminderPreferences, 'updatedAt'>
): Promise<void> {
  const { error } = await supabase
    .from('meal_reminder_preferences')
    .upsert(mealReminderPreferencesPersistence.toUpsert(userId, preferences), {
      onConflict: 'user_id',
    });
  if (error) throw error;
}
