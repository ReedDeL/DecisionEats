import { decide } from '@/engine/decide';
import type {
  DecisionResult,
  IngredientId,
  Minutes,
  Recipe,
  Relaxation,
  UserPreferences,
} from '@/engine/types';

/** The time tiers offered on the home screen. Widening moves up one at a time. */
export const TIME_TIERS: readonly Minutes[] = [15, 30, 60, 120];

/** Below this many fully-ready recipes, the bundled catalog counts as thin (§4.2). */
export const TARGET_READY_COUNT = 3;

export interface RelaxedDecision extends DecisionResult {
  /**
   * The bundled catalog was still thin after the soft concessions. The caller — which is
   * allowed to do I/O — decides whether the other three §4.2 conditions hold,
   * fetches Spoonacular, and calls back in with a merged catalog.
   *
   * The engine cannot do this itself without becoming async, which would cost
   * the property that makes it testable.
   */
  shouldFetchSpoonacular: boolean;
}

/**
 * Relaxation is a first-class code path with its own tests, not an error
 * handler (Technical Spec §4.3). Order is fixed and deliberate —
 * cheapest concession first:
 *
 *   1. Expand the time limit by one tier.
 *   2. Drop the cuisine preference.
 *   3. Fetch Spoonacular when permitted (reported, executed by the caller).
 *   4. Surface `missing_few` as the primary result.
 *   5. Widen to `missing_some`.
 *
 * Equipment, allergens, and dietary restrictions are never relaxed.
 *
 * Every concession is reported so the UI can state it out loud. Silent filter
 * changes are how an app teaches a user not to trust it.
 */
export function decideWithRelaxation(
  catalog: readonly Recipe[],
  pantry: ReadonlySet<IngredientId>,
  prefs: UserPreferences,
  timeLimit: Minutes
): RelaxedDecision {
  const base = decide(catalog, pantry, prefs, timeLimit);
  if (base.buckets.ready.length >= TARGET_READY_COUNT) {
    return { ...base, shouldFetchSpoonacular: false };
  }

  const chosen = findFirstNonEmpty(catalog, pantry, prefs, timeLimit, base) ?? {
    result: base,
    timeLimit,
    cuisineDropped: false,
  };

  const appliedRelaxations: Relaxation[] = [];

  // Rung 1 before rung 2: the order is part of the contract, so it is built
  // here rather than discovered by the search.
  if (chosen.timeLimit !== timeLimit) {
    appliedRelaxations.push({ kind: 'time_widened', from: timeLimit, to: chosen.timeLimit });
  }
  if (chosen.cuisineDropped && prefs.preferredCuisine !== null) {
    appliedRelaxations.push({ kind: 'cuisine_dropped', cuisine: prefs.preferredCuisine });
  }

  // Rungs 4 and 5: when nothing is fully ready, the next-best bucket becomes
  // the headline result instead of a secondary list.
  const { buckets } = chosen.result;
  if (buckets.ready.length === 0) {
    if (buckets.missing_few.length > 0) {
      appliedRelaxations.push({ kind: 'bucket_promoted', bucket: 'missing_few' });
    } else if (buckets.missing_some.length > 0) {
      appliedRelaxations.push({ kind: 'bucket_promoted', bucket: 'missing_some' });
    }
  }

  return {
    buckets,
    appliedRelaxations,
    shouldFetchSpoonacular: buckets.ready.length < TARGET_READY_COUNT,
  };
}

interface Candidate {
  result: DecisionResult;
  timeLimit: Minutes;
  cuisineDropped: boolean;
}

/**
 * Walks the concession space in spec order and returns the first combination
 * that yields any result at all. Searching for the *minimal* concession rather
 * than accumulating every attempted rung is what keeps the UI banner honest:
 * we report widening to 30 minutes, not to 120, when 30 is what worked.
 */
function findFirstNonEmpty(
  catalog: readonly Recipe[],
  pantry: ReadonlySet<IngredientId>,
  prefs: UserPreferences,
  timeLimit: Minutes,
  base: DecisionResult
): Candidate | null {
  const tiers = [timeLimit, ...TIME_TIERS.filter((t) => t > timeLimit)];
  const cuisineOptions = prefs.preferredCuisine === null ? [false] : [false, true];

  for (const cuisineDropped of cuisineOptions) {
    const effectivePrefs = cuisineDropped ? { ...prefs, preferredCuisine: null } : prefs;

    for (const tier of tiers) {
      const result =
        !cuisineDropped && tier === timeLimit
          ? base
          : decide(catalog, pantry, effectivePrefs, tier);
      if (isNonEmpty(result)) {
        return { result, timeLimit: tier, cuisineDropped };
      }
    }
  }

  return null;
}

function isNonEmpty(result: DecisionResult): boolean {
  return Object.values(result.buckets).some((b) => b.length > 0);
}
