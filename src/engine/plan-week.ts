import {
  MEAL_SLOTS,
  mealEntryKey,
  recipeWeeklyEntrySchema,
  weeklyMealPlanSchema,
  type RecipeWeeklyEntry,
  type WeeklyMealPlan,
} from '@/contracts/meal-journeys';
import { BUCKET_ORDER } from '@/engine/bucket';
import { matchesCuisinePreference } from '@/engine/cuisine-preference';
import { isRecipeHardConstraintSatisfied } from '@/engine/filter-hard';
import { derivePlanLinkedGroceryNeeds, type PlanGroceryEntry } from '@/engine/plan-grocery-needs';
import { getPortionGuidance, type PortionGuidanceInput } from '@/engine/portion-guidance';
import { scoreRecipe } from '@/engine/score-recipe';
import type {
  DailyPlanPreference,
  IngredientId,
  Recipe,
  ScoredRecipe,
  UserPreferences,
} from '@/engine/types';

const STANDARD_TIME_TIERS = [15, 30, 60, 120] as const;
const GROCERY_NEED_LIMIT = 12;
export interface RecipeTasteSignal {
  recipeId: string;
}
export interface PlanWeekInput {
  recipes: readonly Recipe[];
  pantry: ReadonlySet<IngredientId>;
  preferences: UserPreferences;
  days: readonly DailyPlanPreference[];
  variety?: 'variety' | 'repeats';
  tasteSignals: readonly RecipeTasteSignal[];
  portionInput: Pick<
    PortionGuidanceInput,
    'bodyProfile' | 'bodyGoal' | 'bodyMetrics' | 'satietyLevel'
  >;
}
interface SelectionStage {
  timeLimit: number;
  cuisineDropped: boolean;
}
interface Candidate {
  recipe: Recipe;
  scored: ScoredRecipe;
  stage: SelectionStage;
  stageIndex: number;
  count: number;
  taste: boolean;
}
export function buildCandidateTimeTiers(selectedLimit: number): number[] {
  if (!Number.isInteger(selectedLimit) || selectedLimit < 1 || selectedLimit > 120)
    throw new RangeError('Selected limit must be an integer from 1 through 120');
  return [selectedLimit, ...STANDARD_TIME_TIERS.filter((tier) => tier > selectedLimit)];
}
export function isHardSafePlanRecipe(recipe: Recipe, preferences: UserPreferences): boolean {
  return (
    recipe.source === 'bundled' &&
    !preferences.dislikedRecipeIds.has(recipe.id) &&
    isRecipeHardConstraintSatisfied(recipe, preferences)
  );
}
function stagesFor(day: DailyPlanPreference, cuisine: string | null): SelectionStage[] {
  const tiers = buildCandidateTimeTiers(day.selectedLimit);
  const exact = tiers.map((timeLimit) => ({ timeLimit, cuisineDropped: false }));
  return cuisine === null
    ? exact
    : [...exact, ...tiers.map((timeLimit) => ({ timeLimit, cuisineDropped: true }))];
}
function chooseMeal(
  input: PlanWeekInput,
  day: DailyPlanPreference,
  existing: readonly RecipeWeeklyEntry[],
  groceryEntries: readonly PlanGroceryEntry[],
  excludedId?: string,
  neighborIds?: ReadonlySet<string>
): { candidate: Candidate | null; reason: 'no_safe_recipe' | 'grocery_need_cap' } {
  const counts = new Map<string, number>();
  for (const entry of existing) counts.set(entry.recipeId, (counts.get(entry.recipeId) ?? 0) + 1);
  const lastId = existing.at(-1)?.recipeId;
  const avoidIds = neighborIds ?? new Set(lastId ? [lastId] : []);
  const tastes = new Set(input.tasteSignals.map((signal) => signal.recipeId));
  const stages = stagesFor(day, input.preferences.preferredCuisine);
  // Candidate admission needs only the union size. Build the dated grocery
  // explanation once for the chosen plan, rather than for every recipe tried.
  const existingNeeds = new Set(
    groceryEntries.flatMap(({ recipe }) =>
      recipe.ingredients.filter(({ id }) => !input.pantry.has(id)).map(({ id }) => id)
    )
  );
  let eligible = false;
  const candidates: Candidate[] = [];
  for (const recipe of input.recipes) {
    if (
      recipe.id === excludedId ||
      !isHardSafePlanRecipe(recipe, input.preferences) ||
      !recipe.mealSlots?.includes(day.mealSlot)
    )
      continue;
    const stageIndex = stages.findIndex(
      (stage) =>
        recipe.totalTimeMinutes <= stage.timeLimit &&
        (stage.cuisineDropped ||
          input.preferences.preferredCuisine === null ||
          matchesCuisinePreference(recipe.cuisine, input.preferences.preferredCuisine))
    );
    const stage = stages[stageIndex];
    if (!stage) continue;
    eligible = true;
    const scored = scoreRecipe(recipe, input.pantry, input.preferences, stage.timeLimit);
    if (new Set([...existingNeeds, ...scored.missing]).size > GROCERY_NEED_LIMIT) continue;
    candidates.push({
      recipe,
      stage,
      stageIndex,
      count: counts.get(recipe.id) ?? 0,
      taste: tastes.has(recipe.id),
      scored,
    });
  }
  const repeats = input.variety === 'repeats';
  candidates.sort((a, b) => {
    // Reuse is evaluated across the entire eligible pool, including stated soft relaxations.
    const reuse = repeats ? Math.floor(a.count / 2) - Math.floor(b.count / 2) : a.count - b.count;
    const adjacent = Number(avoidIds.has(a.recipe.id)) - Number(avoidIds.has(b.recipe.id));
    if (repeats && adjacent) return adjacent;
    if (reuse) return reuse;
    if (adjacent) return adjacent;
    if (a.stageIndex !== b.stageIndex) return a.stageIndex - b.stageIndex;
    const readiness = BUCKET_ORDER.indexOf(a.scored.bucket) - BUCKET_ORDER.indexOf(b.scored.bucket);
    if (readiness) return readiness;
    const suitability = (a.recipe.mealSlots?.length ?? 3) - (b.recipe.mealSlots?.length ?? 3);
    if (suitability) return suitability;
    if (a.scored.score !== b.scored.score) return b.scored.score - a.scored.score;
    if (a.taste !== b.taste) return a.taste ? -1 : 1;
    return a.recipe.id < b.recipe.id ? -1 : a.recipe.id > b.recipe.id ? 1 : 0;
  });
  return {
    candidate: candidates[0] ?? null,
    reason: eligible ? 'grocery_need_cap' : 'no_safe_recipe',
  };
}
function concreteEntry(
  input: PlanWeekInput,
  day: DailyPlanPreference,
  candidate: Candidate
): RecipeWeeklyEntry {
  const relaxations: ('time' | 'cuisine')[] = [];
  if (candidate.stage.timeLimit > day.selectedLimit) relaxations.push('time');
  if (candidate.stage.cuisineDropped) relaxations.push('cuisine');
  return recipeWeeklyEntrySchema.parse({
    kind: 'recipe',
    date: day.date,
    mealSlot: day.mealSlot,
    recipeId: candidate.recipe.id,
    plannedMealTime: `${day.date}T${day.mealTime}`,
    statedRelaxations: relaxations,
    portionGuidance: getPortionGuidance({ recipe: candidate.recipe, ...input.portionInput }),
  });
}
function summarizeRelaxations(entries: WeeklyMealPlan['entries']): ('time' | 'cuisine')[] {
  return (['time', 'cuisine'] as const).filter((value) =>
    entries.some((entry) => entry.kind === 'recipe' && entry.statedRelaxations.includes(value))
  );
}
export function planWeek(input: PlanWeekInput): WeeklyMealPlan {
  const first = input.days[0];
  if (!first) throw new RangeError('Plan days cannot be empty');
  const mealSlots = MEAL_SLOTS.filter((slot) => input.days.some((day) => day.mealSlot === slot));
  const dayCount = new Set(input.days.map((day) => day.date)).size;
  for (const day of input.days) {
    buildCandidateTimeTiers(day.selectedLimit);
    const parsedMealTime = recipeWeeklyEntrySchema.safeParse({
      kind: 'recipe',
      date: day.date,
      mealSlot: day.mealSlot,
      recipeId: 'validation',
      plannedMealTime: `${day.date}T${day.mealTime}`,
      statedRelaxations: [],
      portionGuidance: null,
    });
    if (!parsedMealTime.success) {
      throw new RangeError('Each meal time must be a valid offset-bearing RFC 3339 time');
    }
  }
  const valid = weeklyMealPlanSchema.safeParse({
    weekStart: first.date,
    dayCount,
    mealSlots,
    limitedVariety: false,
    status: 'draft',
    groceryNeeds: [],
    statedRelaxations: [],
    entries: input.days.map((day) => ({
      kind: 'day_of_decision',
      date: day.date,
      mealSlot: day.mealSlot,
      reason: 'no_safe_recipe',
    })),
  });
  if (!valid.success)
    throw new RangeError(
      'Plan days must cover 3, 5, or 7 consecutive local dates and selected meal slots'
    );
  const entries: WeeklyMealPlan['entries'][number][] = [];
  const concrete: RecipeWeeklyEntry[] = [];
  const groceries: PlanGroceryEntry[] = [];
  let limitedVariety = false;
  for (const day of input.days) {
    const { candidate, reason } = chooseMeal(input, day, concrete, groceries);
    if (!candidate) {
      entries.push({ kind: 'day_of_decision', date: day.date, mealSlot: day.mealSlot, reason });
      continue;
    }
    limitedVariety ||=
      input.variety === 'repeats'
        ? candidate.count >= 2 || concrete.at(-1)?.recipeId === candidate.recipe.id
        : candidate.count > 0;
    const entry = concreteEntry(input, day, candidate);
    entries.push(entry);
    concrete.push(entry);
    groceries.push({ date: day.date, recipe: candidate.recipe });
  }
  return weeklyMealPlanSchema.parse({
    ...valid.data,
    entries,
    limitedVariety,
    statedRelaxations: summarizeRelaxations(entries),
    groceryNeeds: derivePlanLinkedGroceryNeeds(groceries, input.pantry, GROCERY_NEED_LIMIT),
  });
}
/** Replace one stable slot, keeping the rest of the plan and its confirmation intact. */
export function swapPlanMeal(
  plan: WeeklyMealPlan,
  key: string,
  input: PlanWeekInput
): WeeklyMealPlan | null {
  const target = plan.entries.find((entry) => mealEntryKey(entry) === key);
  const day = input.days.find((entry) => mealEntryKey(entry) === key);
  if (!target || !day) return null;
  const others = plan.entries.filter(
    (entry): entry is RecipeWeeklyEntry => entry.kind === 'recipe' && mealEntryKey(entry) !== key
  );
  const byId = new Map(input.recipes.map((recipe) => [recipe.id, recipe]));
  const groceries = others.flatMap((entry) => {
    const recipe = byId.get(entry.recipeId);
    return recipe ? [{ date: entry.date, recipe }] : [];
  });
  const { candidate } = chooseMeal(
    input,
    day,
    others,
    groceries,
    target.kind === 'recipe' ? target.recipeId : undefined,
    new Set(
      [
        plan.entries[plan.entries.indexOf(target) - 1],
        plan.entries[plan.entries.indexOf(target) + 1],
      ].flatMap((entry) => (entry?.kind === 'recipe' ? [entry.recipeId] : []))
    )
  );
  if (!candidate) return null;
  const entries = plan.entries.map((entry) =>
    mealEntryKey(entry) === key ? concreteEntry(input, day, candidate) : entry
  );
  const repeated = entries
    .filter((entry) => entry.kind === 'recipe')
    .map((entry) => entry.recipeId);
  return weeklyMealPlanSchema.parse({
    ...plan,
    entries,
    limitedVariety:
      input.variety === 'repeats'
        ? repeated.some(
            (id, index) =>
              repeated[index - 1] === id || repeated.filter((value) => value === id).length > 2
          )
        : new Set(repeated).size < repeated.length,
    statedRelaxations: summarizeRelaxations(entries),
    groceryNeeds: derivePlanLinkedGroceryNeeds(
      [...groceries, { date: day.date, recipe: candidate.recipe }],
      input.pantry,
      GROCERY_NEED_LIMIT
    ),
  });
}
