import { BUNDLED_CATALOG, INGREDIENT_VOCABULARY, lookupIngredient } from '@/data/catalog';
import type { DietaryTag, IngredientId } from '@/engine/types';
import { COMMON_ALLERGENS, COMMON_PANTRY_IDS } from '@/store/kitchen';
import { PANTRY_STARTER_IDS } from '@/data/ingredient-presentation';
import { resolveIngredient } from '@/lib/ingredients/resolve';
import { canonicalSlug, slugify, SYNONYMS } from '@/lib/ingredients/normalize';

/**
 * Enough suggestions to scan and choose from comfortably without overwhelming.
 */
export const DEFAULT_SUGGESTION_COUNT = 16;

/**
 * Maximum number of search results to return for a text query.
 */
export const MAX_SEARCH_RESULTS = 24;

/**
 * Builds a deterministic ranked ingredient suggestion list from the canonical vocabulary.
 *
 * 1. Curated common pantry items (`COMMON_PANTRY_IDS`) come first.
 * 2. Followed by ingredients used in `BUNDLED_CATALOG`, ranked by recipe frequency
 *    (descending), with display name as a deterministic tie-breaker.
 * 3. Followed by any remaining vocabulary ingredients, sorted alphabetically by name.
 *
 * Deduplicated so each canonical ingredient ID appears exactly once.
 */
function buildRankedSuggestionVocabulary(): readonly IngredientId[] {
  const recipeFreq = new Map<IngredientId, number>();
  for (const recipe of BUNDLED_CATALOG) {
    for (const ing of recipe.ingredients) {
      recipeFreq.set(ing.id, (recipeFreq.get(ing.id) ?? 0) + 1);
    }
  }

  const seen = new Set<IngredientId>();
  const ranked: IngredientId[] = [];

  // 1. Common pantry items
  for (const id of COMMON_PANTRY_IDS) {
    if (!seen.has(id) && lookupIngredient(id) !== undefined) {
      seen.add(id);
      ranked.push(id);
    }
  }

  // 2. Catalog ingredients sorted by recipe frequency (descending), then displayName (ascending)
  const catalogIngredients = INGREDIENT_VOCABULARY.filter(
    (entry) => (recipeFreq.get(entry.id) ?? 0) > 0
  ).sort((a, b) => {
    const countA = recipeFreq.get(a.id) ?? 0;
    const countB = recipeFreq.get(b.id) ?? 0;
    if (countB !== countA) return countB - countA;
    return a.displayName.localeCompare(b.displayName);
  });

  for (const entry of catalogIngredients) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      ranked.push(entry.id);
    }
  }

  // 3. Remaining vocabulary entries sorted by displayName
  const remaining = INGREDIENT_VOCABULARY.filter((entry) => !seen.has(entry.id)).sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );

  for (const entry of remaining) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      ranked.push(entry.id);
    }
  }

  return ranked;
}

export const RANKED_SUGGESTION_VOCABULARY: readonly IngredientId[] =
  buildRankedSuggestionVocabulary();

/**
 * Returns a scannable, deterministic set of suggested ingredients not yet in the pantry.
 * As the user adds an ingredient, it is removed and the next eligible candidate is revealed.
 */
export function getReplenishingSuggestions(
  pantry: ReadonlyArray<IngredientId> | ReadonlySet<IngredientId>,
  limit: number = DEFAULT_SUGGESTION_COUNT
): IngredientId[] {
  const owned = pantry instanceof Set ? pantry : new Set(pantry);
  const results: IngredientId[] = [];

  for (const id of RANKED_SUGGESTION_VOCABULARY) {
    if (!owned.has(id)) {
      results.push(id);
      if (results.length >= limit) {
        break;
      }
    }
  }

  return results;
}

/**
 * Search the ingredient vocabulary by name, including synonyms and aliases,
 * excluding owned pantry items.
 */
export function searchIngredientSuggestions(
  query: string,
  pantry: ReadonlyArray<IngredientId> | ReadonlySet<IngredientId>,
  limit: number = MAX_SEARCH_RESULTS
): IngredientId[] {
  const term = query.trim().toLowerCase();
  if (term.length === 0) {
    return getReplenishingSuggestions(pantry, limit);
  }

  const owned = pantry instanceof Set ? pantry : new Set(pantry);
  const results: IngredientId[] = [];
  const seen = new Set<IngredientId>();

  const add = (id: IngredientId | null | undefined) => {
    if (id && !owned.has(id) && !seen.has(id) && lookupIngredient(id) !== undefined) {
      seen.add(id);
      results.push(id);
    }
  };

  // 1. Direct resolution through synonyms and canonical slugs
  const resolved = resolveIngredient(term);
  if (resolved.id) {
    add(resolved.id);
  }

  const slug = slugify(term);
  const canonical = canonicalSlug(term);
  if (canonical) {
    add(canonical);
  }

  for (const [synonymKey, targetId] of Object.entries(SYNONYMS)) {
    if (synonymKey === slug || synonymKey.startsWith(slug)) {
      add(targetId);
    }
  }

  // 2. Prefix matches on display name
  for (const entry of INGREDIENT_VOCABULARY) {
    if (entry.displayName.toLowerCase().startsWith(term)) {
      add(entry.id);
      if (results.length >= limit) return results;
    }
  }

  // 3. Substring matches on display name
  for (const entry of INGREDIENT_VOCABULARY) {
    if (entry.displayName.toLowerCase().includes(term)) {
      add(entry.id);
      if (results.length >= limit) return results;
    }
  }

  return results.slice(0, limit);
}

/** Initial count of recommended ingredients shown in the pantry before progressive disclosure. */
export const INITIAL_PANTRY_RECOMMENDATIONS = 3;

/** Number of additional recommendations revealed per "Show more ingredients" tap. */
export const PANTRY_RECOMMENDATION_BATCH_SIZE = 3;

/**
 * Returns candidate ingredient recommendations for the pantry, unowned by the user.
 * Unowned starter items come first, followed by ranked vocabulary suggestions.
 */
export function getPantryRecommendationCandidates(
  pantry: ReadonlyArray<IngredientId> | ReadonlySet<IngredientId>,
  starterIds: readonly IngredientId[] = PANTRY_STARTER_IDS
): IngredientId[] {
  const owned = pantry instanceof Set ? pantry : new Set(pantry);
  const unownedStarters = starterIds.filter((id) => !owned.has(id));
  const replenishing = getReplenishingSuggestions(owned, RANKED_SUGGESTION_VOCABULARY.length);
  return [...new Set([...unownedStarters, ...replenishing])];
}

/**
 * Checklist results deliberately retain owned ingredients: a checked search
 * result is how someone corrects a pantry without first clearing the query.
 */
export function getChecklistIngredientIds(
  query: string,
  pantry: ReadonlyArray<IngredientId> | ReadonlySet<IngredientId>,
  starterIds: readonly IngredientId[] = PANTRY_STARTER_IDS,
  limit: number = MAX_SEARCH_RESULTS,
  suggestionLimit?: number
): IngredientId[] {
  const owned = pantry instanceof Set ? pantry : new Set(pantry);
  const term = query.trim();

  if (term.length > 0) {
    const matching = searchIngredientSuggestions(term, [], limit);
    const checkedMatches = [...owned].filter((id) => {
      const entry = lookupIngredient(id);
      return entry?.displayName.toLowerCase().includes(term.toLowerCase()) || matching.includes(id);
    });
    return [...new Set([...checkedMatches, ...matching])].slice(0, limit);
  }

  const checked = [...owned];
  const candidates = getPantryRecommendationCandidates(owned, starterIds);
  const suggested =
    suggestionLimit !== undefined
      ? candidates.slice(0, suggestionLimit)
      : starterIds.filter((id) => !owned.has(id)).length > 0
        ? starterIds.filter((id) => !owned.has(id))
        : getReplenishingSuggestions(owned, 8);
  return [...new Set([...checked, ...suggested])];
}

/**
 * Checks whether an ingredient is safe given declared allergens and dietary restrictions.
 * Enforces that onboarding starters never preselect an item conflicting with prior choices.
 */
export function isStarterIngredientSafe(
  id: IngredientId,
  allergens: readonly string[],
  dietary: readonly DietaryTag[] = []
): boolean {
  const entry = lookupIngredient(id);
  if (!entry) return false;

  const declaredAllergenGroups = new Set(
    allergens.flatMap(
      (allergenId) => COMMON_ALLERGENS.find((a) => a.id === allergenId)?.groups ?? [allergenId]
    )
  );

  if (declaredAllergenGroups.has(entry.id)) return false;
  if (entry.allergenGroups.some((group) => declaredAllergenGroups.has(group))) return false;

  if (
    dietary.includes('gluten_free') &&
    (entry.allergenGroups.includes('gluten') || entry.allergenGroups.includes('wheat'))
  ) {
    return false;
  }
  if (dietary.includes('dairy_free') && entry.allergenGroups.includes('dairy')) {
    return false;
  }
  if (
    dietary.includes('vegan') &&
    (entry.allergenGroups.includes('dairy') || entry.allergenGroups.includes('egg'))
  ) {
    return false;
  }
  if (
    (dietary.includes('vegan') ||
      dietary.includes('vegetarian') ||
      dietary.includes('pescatarian')) &&
    ['beef', 'chicken', 'pork', 'lamb', 'bacon', 'ham'].includes(id)
  ) {
    return false;
  }
  if (
    (dietary.includes('vegan') || dietary.includes('vegetarian')) &&
    ['fish', 'salmon', 'tuna', 'shrimp', 'cod', 'anchovy'].includes(id)
  ) {
    return false;
  }

  return true;
}

/**
 * Returns only those starter ingredients that satisfy all declared allergens and dietary restrictions.
 */
export function filterSafeStarterIngredients(
  starterIds: readonly IngredientId[],
  allergens: readonly string[],
  dietary: readonly DietaryTag[] = []
): IngredientId[] {
  return starterIds.filter((id) => isStarterIngredientSafe(id, allergens, dietary));
}
