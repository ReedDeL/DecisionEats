import recipesJson from '@/data/recipes.json';
import ingredientsJson from '@/data/ingredients.json';
import attributionsJson from '@/data/catalog-attributions.json';
import { toCatalog } from '@/lib/adapters/to-recipe';
import type { Recipe } from '@/engine/types';

export interface VocabularyEntry {
  id: string;
  displayName: string;
  allergenGroups: string[];
  isStaple: boolean;
}

export interface CatalogAttribution {
  sourceId: string;
  sourceVersion: string;
  title: string;
  url: string;
  licenseName: string;
  licenseUrl: string;
  attribution: string;
}

/** Source and license metadata for every bundled release. */
export const BUNDLED_CATALOG_ATTRIBUTIONS: readonly CatalogAttribution[] =
  attributionsJson as CatalogAttribution[];

/**
 * The bundled catalog, combining verified curated staple recipes with the
 * generated offline catalog. Always present, works offline, and ensures common
 * pantry combinations immediately yield relevant suggestions.
 */
export const BUNDLED_CATALOG: readonly Recipe[] = toCatalog(recipesJson);

/**
 * The canonical ingredient vocabulary — the shared language between the vision
 * pipeline, the pantry, and the decision engine.
 */
export const INGREDIENT_VOCABULARY: readonly VocabularyEntry[] =
  ingredientsJson as VocabularyEntry[];

const BY_ID = new Map(INGREDIENT_VOCABULARY.map((entry) => [entry.id, entry]));

export function lookupIngredient(id: string): VocabularyEntry | undefined {
  return BY_ID.get(id);
}

/** Ingredient taxonomy only; these are never assumed to be in a user's pantry. */
export const STAPLE_INGREDIENT_IDS: readonly string[] = INGREDIENT_VOCABULARY.filter(
  (entry) => entry.isStaple
).map((entry) => entry.id);
