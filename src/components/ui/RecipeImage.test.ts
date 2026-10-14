import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RecipeImage } from '@/components/ui/RecipeImage';

describe('RecipeImage', () => {
  it('shows only an explicitly reviewed meal photo', () => {
    const markup = renderToStaticMarkup(
      createElement(RecipeImage, {
        recipeId: 'hc-staple-pbj',
        title: 'Peanut Butter and Jelly Sandwich',
      })
    );
    expect(markup).toContain('Representative serving of Peanut Butter and Jelly Sandwich');
    expect(markup).not.toContain('Meal photo unavailable');
    expect(markup).not.toContain('meal-art');
  });
  it.each([undefined, 'hc-mw-01', 'unknown'])(
    'uses a neutral fallback for unreviewed recipe %s',
    (recipeId) => {
      const markup = renderToStaticMarkup(
        createElement(RecipeImage, {
          recipeId,
          title: 'Meal',
          uri: 'https://example.test/unreviewed.jpg',
        })
      );
      expect(markup).toContain('Meal photo unavailable');
      expect(markup).not.toContain('<img');
      expect(markup).not.toContain('unreviewed.jpg');
      expect(markup).not.toContain('meal-art');
    }
  );
});
