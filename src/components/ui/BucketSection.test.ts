import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

import { BucketSection } from '@/components/ui/BucketSection';
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
  missing: [],
  bucket: 'ready',
  score: 1.0,
};

describe('BucketSection', () => {
  it('renders section title and recipes', () => {
    const markup = renderToStaticMarkup(
      createElement(BucketSection, {
        section: 'ready_now',
        recipes: [scoredRecipe],
        onSelectRecipe: () => undefined,
      })
    );

    expect(markup).toContain('Ready now');
    expect(markup).toContain('Garlic Butter Pasta');
  });

  it('renders separate permanent and session hide actions', () => {
    const markup = renderToStaticMarkup(
      createElement(BucketSection, {
        section: 'ready_now',
        recipes: [scoredRecipe],
        onSelectRecipe: () => undefined,
        onDislikeRecipe: () => undefined,
        onSkipRecipe: () => undefined,
      })
    );

    expect(markup).toContain('Never again');
    expect(markup).toContain('Not right now');
  });

  it('returns null when recipes list is empty', () => {
    const markup = renderToStaticMarkup(
      createElement(BucketSection, {
        section: 'ready_now',
        recipes: [],
        onSelectRecipe: () => undefined,
      })
    );

    expect(markup).toBe('');
  });
});
