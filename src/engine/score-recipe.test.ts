import { describe, expect, it } from 'vitest';
import { scoreRecipe } from '@/engine/score-recipe';
import { ingredient, makePrefs, makeRecipe, pantry } from '@/engine/__fixtures__';

describe('scoreRecipe', () => {
  it('is monotonic in ingredient coverage', () => {
    const recipe = makeRecipe({
      ingredients: [ingredient('a'), ingredient('b'), ingredient('c'), ingredient('d')],
    });
    const prefs = makePrefs();

    const none = scoreRecipe(recipe, pantry(), prefs, 30).score;
    const half = scoreRecipe(recipe, pantry('a', 'b'), prefs, 30).score;
    const all = scoreRecipe(recipe, pantry('a', 'b', 'c', 'd'), prefs, 30).score;

    expect(half).toBeGreaterThan(none);
    expect(all).toBeGreaterThan(half);
  });

  it('reports exactly the ingredients absent from the pantry', () => {
    const recipe = makeRecipe({
      ingredients: [ingredient('a'), ingredient('b'), ingredient('c')],
    });
    const scored = scoreRecipe(recipe, pantry('b'), makePrefs(), 30);
    expect(scored.missing).toEqual(['a', 'c']);
  });

  it('prefers a faster recipe when coverage is equal', () => {
    const fast = makeRecipe({ id: 'fast', totalTimeMinutes: 5 });
    const slow = makeRecipe({ id: 'slow', totalTimeMinutes: 30 });
    const prefs = makePrefs();

    expect(scoreRecipe(fast, pantry('egg', 'salt'), prefs, 30).score).toBeGreaterThan(
      scoreRecipe(slow, pantry('egg', 'salt'), prefs, 30).score
    );
  });

  it('rewards a cuisine match', () => {
    const prefs = makePrefs({ preferredCuisine: 'thai' });
    const matching = scoreRecipe(makeRecipe({ cuisine: 'thai' }), pantry(), prefs, 30);
    const nonMatching = scoreRecipe(makeRecipe({ cuisine: 'italian' }), pantry(), prefs, 30);

    expect(matching.score).toBeGreaterThan(nonMatching.score);
  });

  it('gives no cuisine bonus when the user has no preference', () => {
    const noPreference = scoreRecipe(makeRecipe({ cuisine: 'thai' }), pantry(), makePrefs(), 30);
    const withPreference = scoreRecipe(
      makeRecipe({ cuisine: 'thai' }),
      pantry(),
      makePrefs({ preferredCuisine: 'thai' }),
      30
    );

    expect(withPreference.score).toBeGreaterThan(noPreference.score);
  });

  it('penalises a recipe the user has skipped', () => {
    const recipe = makeRecipe({ id: 'r1' });
    const plain = scoreRecipe(recipe, pantry('egg'), makePrefs(), 30);
    const skipped = scoreRecipe(
      recipe,
      pantry('egg'),
      makePrefs({ skippedRecipeIds: new Set(['r1']) }),
      30
    );

    expect(skipped.score).toBeLessThan(plain.score);
  });

  it('is deterministic across repeated calls', () => {
    const recipe = makeRecipe();
    const prefs = makePrefs();
    const a = scoreRecipe(recipe, pantry('egg'), prefs, 30).score;
    const b = scoreRecipe(recipe, pantry('egg'), prefs, 30).score;
    expect(a).toBe(b);
  });

  it('does not divide by zero for a recipe with no ingredients', () => {
    const scored = scoreRecipe(makeRecipe({ ingredients: [] }), pantry(), makePrefs(), 30);
    expect(Number.isFinite(scored.score)).toBe(true);
    expect(scored.missing).toEqual([]);
  });

  it('does not divide by zero when the time limit is zero', () => {
    const scored = scoreRecipe(makeRecipe(), pantry(), makePrefs(), 0);
    expect(Number.isFinite(scored.score)).toBe(true);
  });

  it('clamps timeFit for a recipe that overruns the limit', () => {
    // Over-limit recipes are normally eliminated, but relaxation can surface
    // them. The score must not go negative-unbounded.
    const scored = scoreRecipe(makeRecipe({ totalTimeMinutes: 500 }), pantry(), makePrefs(), 10);
    expect(Number.isFinite(scored.score)).toBe(true);
    expect(scored.score).toBeGreaterThanOrEqual(-1);
  });
});

describe('scoreRecipe caloric goals', () => {
  const light = makeRecipe({
    id: 'light',
    energyKcalPerServing: 300,
    nutritionConfidence: 'high',
  });
  const dense = makeRecipe({
    id: 'dense',
    energyKcalPerServing: 800,
    nutritionConfidence: 'high',
  });

  it('prioritizes lower-calorie meals for an explicit weight-loss goal', () => {
    const prefs = makePrefs({ bodyGoal: 'lose' });
    expect(scoreRecipe(light, pantry(), prefs, 30).score).toBeGreaterThan(
      scoreRecipe(dense, pantry(), prefs, 30).score
    );
  });

  it('prioritizes nutrient-dense meals for a weight-gain goal', () => {
    const prefs = makePrefs({ bodyGoal: 'gain' });
    expect(scoreRecipe(dense, pantry(), prefs, 30).score).toBeGreaterThan(
      scoreRecipe(light, pantry(), prefs, 30).score
    );
  });

  it('leaves standard ranking unchanged for maintain and skipped goals', () => {
    const maintain = makePrefs({ bodyGoal: 'maintain' });
    const skipped = makePrefs({ bodyGoal: null });
    expect(scoreRecipe(light, pantry(), maintain, 30).score).toBe(
      scoreRecipe(dense, pantry(), maintain, 30).score
    );
    expect(scoreRecipe(light, pantry(), skipped, 30).score).toBe(
      scoreRecipe(dense, pantry(), skipped, 30).score
    );
  });

  it('leaves standard ranking unchanged when no goal has been supplied', () => {
    const prefs = makePrefs();
    expect(scoreRecipe(light, pantry(), prefs, 30).score).toBe(
      scoreRecipe(dense, pantry(), prefs, 30).score
    );
  });

  it('does not rank by calories when nutrition is unavailable', () => {
    const unavailableLight = { ...light, nutritionConfidence: 'unavailable' as const };
    const unavailableDense = { ...dense, nutritionConfidence: 'unavailable' as const };
    const prefs = makePrefs({ bodyGoal: 'lose' });
    expect(scoreRecipe(unavailableLight, pantry(), prefs, 30).score).toBe(
      scoreRecipe(unavailableDense, pantry(), prefs, 30).score
    );
  });

  describe('user sizing and body metrics', () => {
    const moderate400 = makeRecipe({
      id: 'moderate400',
      energyKcalPerServing: 400,
      nutritionConfidence: 'high',
    });
    const hearty750 = makeRecipe({
      id: 'hearty750',
      energyKcalPerServing: 750,
      nutritionConfidence: 'high',
    });
    const heavy1200 = makeRecipe({
      id: 'heavy1200',
      energyKcalPerServing: 1200,
      nutritionConfidence: 'high',
    });

    it('adapts weight-loss recommendation to user size', () => {
      // Petite user: ~430 kcal deficit meal target
      const petiteUserPrefs = makePrefs({
        bodyGoal: 'lose',
        bodyMetrics: { heightCentimeters: 150, weightKilograms: 45 },
      });
      // Tall/larger user: ~790 kcal deficit meal target
      const largerUserPrefs = makePrefs({
        bodyGoal: 'lose',
        bodyMetrics: { heightCentimeters: 190, weightKilograms: 100 },
      });

      // Petite user prefers 400 kcal over 750 kcal
      expect(scoreRecipe(moderate400, pantry(), petiteUserPrefs, 30).score).toBeGreaterThan(
        scoreRecipe(hearty750, pantry(), petiteUserPrefs, 30).score
      );

      // Larger user on deficit receives better fit from 750 kcal than 400 kcal
      expect(scoreRecipe(hearty750, pantry(), largerUserPrefs, 30).score).toBeGreaterThan(
        scoreRecipe(moderate400, pantry(), largerUserPrefs, 30).score
      );

      // Both users penalize excessive 1200 kcal meals
      expect(scoreRecipe(hearty750, pantry(), largerUserPrefs, 30).score).toBeGreaterThan(
        scoreRecipe(heavy1200, pantry(), largerUserPrefs, 30).score
      );
    });

    it('personalizes weight-gain recommendations for user size', () => {
      const userPrefs = makePrefs({
        bodyGoal: 'gain',
        bodyMetrics: { heightCentimeters: 175, weightKilograms: 70 },
      });

      // Gaining weight prefers 750 kcal over 400 kcal
      expect(scoreRecipe(hearty750, pantry(), userPrefs, 30).score).toBeGreaterThan(
        scoreRecipe(moderate400, pantry(), userPrefs, 30).score
      );
    });

    it('matches target meal calories when maintaining weight with body metrics', () => {
      // Maintenance target for 175cm, 70kg is ~717 kcal
      const userPrefs = makePrefs({
        bodyGoal: 'maintain',
        bodyMetrics: { heightCentimeters: 175, weightKilograms: 70 },
      });

      // 750 kcal is very close to 717 kcal target, beating both 400 kcal and 1200 kcal
      expect(scoreRecipe(hearty750, pantry(), userPrefs, 30).score).toBeGreaterThan(
        scoreRecipe(moderate400, pantry(), userPrefs, 30).score
      );
      expect(scoreRecipe(hearty750, pantry(), userPrefs, 30).score).toBeGreaterThan(
        scoreRecipe(heavy1200, pantry(), userPrefs, 30).score
      );
    });

    it('falls back to standard goal-only ranking when body metrics are invalid or incomplete', () => {
      const incompletePrefs = makePrefs({
        bodyGoal: 'lose',
        bodyMetrics: { heightCentimeters: null, weightKilograms: 70 },
      });
      const outOfBoundsPrefs = makePrefs({
        bodyGoal: 'lose',
        bodyMetrics: { heightCentimeters: 300, weightKilograms: 20 },
      });

      expect(scoreRecipe(light, pantry(), incompletePrefs, 30).score).toBeGreaterThan(
        scoreRecipe(dense, pantry(), incompletePrefs, 30).score
      );
      expect(scoreRecipe(light, pantry(), outOfBoundsPrefs, 30).score).toBeGreaterThan(
        scoreRecipe(dense, pantry(), outOfBoundsPrefs, 30).score
      );
    });

    it('leaves ranking neutral when body goal is null or skipped even if metrics are provided', () => {
      const skippedWithMetrics = makePrefs({
        bodyGoal: null,
        bodyMetrics: { heightCentimeters: 180, weightKilograms: 80 },
      });

      expect(scoreRecipe(light, pantry(), skippedWithMetrics, 30).score).toBe(
        scoreRecipe(dense, pantry(), skippedWithMetrics, 30).score
      );
    });
  });
});
