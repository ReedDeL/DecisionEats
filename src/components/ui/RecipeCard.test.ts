import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

import { RecipeCard } from '@/components/ui/RecipeCard';
import type { ScoredRecipe } from '@/engine/types';

const scoredRecipe: ScoredRecipe = {
  recipe: {
    id: 'test-recipe-1',
    title: 'Garlic Butter Pasta',
    imageUrl: null,
    cuisine: 'italian',
    totalTimeMinutes: 20,
    equipmentRequired: ['microwave'],
    dietaryTags: ['vegetarian'],
    ingredients: [
      { id: 'pasta', measure: '200g', allergenGroups: ['gluten', 'wheat'] },
      { id: 'garlic', measure: '2 cloves', allergenGroups: [] },
      { id: 'butter', measure: '2 tbsp', allergenGroups: ['dairy'] },
    ],
    instructions: 'Boil and mix.',
    baseServings: 2,
    energyKcalPerServing: null,
    nutritionProvenance: null,
    nutritionConfidence: 'unavailable',
    source: 'bundled',
    mealSlots: ['dinner'],
  },
  missing: ['garlic'],
  bucket: 'missing_few',
  score: 0.8,
};

describe('RecipeCard', () => {
  it('renders recipe title, time, and missing ingredient count', () => {
    const markup = renderToStaticMarkup(
      createElement(RecipeCard, {
        scored: scoredRecipe,
        onPress: () => undefined,
      })
    );

    expect(markup).toContain('Garlic Butter Pasta');
    expect(markup).toContain('20 min');
    expect(markup).toContain('Missing 1');
    expect(markup).toContain('aria-label="Garlic Butter Pasta. 20 min. Missing 1."');
  });

  it('renders "I don\'t like this" button when onDislike callback is provided', () => {
    const markup = renderToStaticMarkup(
      createElement(RecipeCard, {
        scored: scoredRecipe,
        onPress: () => undefined,
        onDislike: () => undefined,
      })
    );

    expect(markup).toContain('I don&#x27;t like this');
    expect(markup).toContain('aria-label="I don&#x27;t like this, Garlic Butter Pasta"');
  });

  it('omits dislike action when onDislike is not provided', () => {
    const markup = renderToStaticMarkup(
      createElement(RecipeCard, {
        scored: scoredRecipe,
        onPress: () => undefined,
      })
    );

    expect(markup).not.toContain('I don&#x27;t like this');
  });

  it('does not render inaccurate meal images', () => {
    const markup = renderToStaticMarkup(
      createElement(RecipeCard, {
        scored: scoredRecipe,
        onPress: () => undefined,
      })
    );

    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('data-testid="recipe-image"');
  });
});
