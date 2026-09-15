/**
 * The entire public data contract of the decision engine.
 *
 * Everything here is plain data. No Supabase row types, no React, no promises.
 * The data layer converts into these types (src/lib/adapters/) and the engine
 * never learns where a recipe came from — the bundled catalog or a live catalog result.
 */
import type { BodyGoal, NutritionConfidence, NutritionProvenance } from '@/contracts/meal-journeys';
import type { MealSlot } from '@/contracts/meal-slots';

/**
 * Canonical ingredient identifier from src/data/ingredients.json.
 *
 * The engine compares these by equality, so "scallion", "green onion", and
 * "spring onion" MUST already have collapsed to one id before reaching here.
 * Free-text ingredient names are a bug at this boundary.
 */
export type IngredientId = string;

export type Minutes = number;

/**
 * Closed equipment enumeration (Technical Spec §5.2 step 4).
 *
 * Closed is what makes the equipment filter a set operation instead of a
 * string-matching problem. snake_case is canonical; the catalog pipeline emits
 * exactly these values and nothing else.
 */
export const EQUIPMENT = [
  'microwave',
  'stove',
  'oven',
  'air_fryer',
  'kettle',
  'blender',
  'rice_cooker',
  'toaster_oven',
  'none',
  /**
   * Tagging failed; we do not know what this recipe needs. Deliberately NOT
   * `none` -- `none` is a verified claim that nothing is required, and
   * collapsing the two is what served stove recipes to microwave-only users.
   */
  'unclassified',
] as const;

export type Equipment = (typeof EQUIPMENT)[number];

export const DIETARY_TAGS = [
  'vegetarian',
  'vegan',
  'gluten_free',
  'dairy_free',
  'halal',
  'kosher',
  'pescatarian',
  'keto',
] as const;

export type DietaryTag = (typeof DIETARY_TAGS)[number];

export interface RecipeIngredient {
  id: IngredientId;
  /** Display text as written in the source, e.g. "2 1/2 tbsp". */
  measure: string;
  /**
   * Allergen groups this ingredient belongs to, e.g. `butter` -> `['dairy']`.
   * Attached by the adapter from the bundled ingredient vocabulary so that
   * allergen checking stays a set operation instead of a substring search.
   *
   * Substring matching is the bug this field exists to prevent: `"egg"`
   * matches `"eggplant"`, `"nut"` matches `"coconut"`.
   */
  allergenGroups: IngredientId[];
}

export interface RecipeAttribution {
  sourceId: string;
  sourceVersion: string;
  sourceRecipeId?: string;
  attribution: string;
  url: string;
  licenseName?: string;
  licenseUrl?: string;
}

export interface Recipe {
  id: string;
  title: string;
  imageUrl: string | null;
  cuisine: string | null;
  /** Verified meal occasions; missing metadata is not eligible for planning. */
  mealSlots: MealSlot[];
  totalTimeMinutes: Minutes;
  equipmentRequired: Equipment[];
  dietaryTags: DietaryTag[];
  ingredients: RecipeIngredient[];
  instructions: string;
  baseServings: number | null;
  energyKcalPerServing: number | null;
  nutritionProvenance: NutritionProvenance | null;
  nutritionConfidence: NutritionConfidence;
  /**
   * Which source supplied this recipe. The engine ignores it entirely; it exists
   * so the persistence layer can enforce the Spoonacular field whitelist and
   * the UI can render attribution.
   */
  source: 'bundled' | 'spoonacular';
  /** Rights metadata copied from the active catalog release. */
  attribution?: RecipeAttribution | null;
}

export interface UserPreferences {
  equipment: Equipment[];
  /** Canonical ingredient ids the user must never be shown. */
  allergens: IngredientId[];
  dietary: DietaryTag[];
  /** Strong negative signal — suppress permanently. */
  dislikedRecipeIds: Set<string>;
  /** Weak negative signal — de-rank, do not eliminate. */
  skippedRecipeIds: Set<string>;
  /** Soft cuisine or broad food-style preference; dropped during relaxation after time. */
  preferredCuisine: string | null;
  /** Optional goal used only as a soft ranking signal. */
  bodyGoal?: BodyGoal | null;
}

export interface DailyPlanPreference {
  /** ISO local calendar date supplied by the caller. */
  date: string;
  mealSlot: MealSlot;
  selectedLimit: Minutes;
  /** Local wall-clock time with seconds and a numeric UTC offset. */
  mealTime: string;
}

export type Bucket = 'ready' | 'missing_few' | 'missing_some' | 'grocery_run';

export interface ScoredRecipe {
  recipe: Recipe;
  missing: IngredientId[];
  bucket: Bucket;
  score: number;
}

/**
 * Which soft constraints the engine had to give up to avoid an empty screen.
 * Every one of these is stated out loud in the UI — silent filter changes are
 * how an app teaches a user not to trust it.
 *
 * `spoonacular_expansion` is the one exception: it adds options without removing
 * constraints, so there is nothing to disclose (Technical Spec §4.3).
 */
export type Relaxation =
  | { kind: 'time_widened'; from: Minutes; to: Minutes }
  | { kind: 'cuisine_dropped'; cuisine: string }
  | { kind: 'spoonacular_expansion' }
  | { kind: 'bucket_promoted'; bucket: Bucket };

export interface DecisionResult {
  buckets: Record<Bucket, ScoredRecipe[]>;
  appliedRelaxations: Relaxation[];
}

export interface VisibleDecision {
  buckets: Partial<Record<Bucket, ScoredRecipe[]>>;
  appliedRelaxations: Relaxation[];
}
