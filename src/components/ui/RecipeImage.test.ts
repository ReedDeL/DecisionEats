import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RecipeImage } from '@/components/ui/RecipeImage';
import { BUNDLED_CATALOG } from '@/data/catalog';
import { mealTypeArt } from '@/data/meal-type-art';
import { MEAL_ART_TILES } from '@/data/meal-art';

describe('RecipeImage', () => {
  it('shows a labeled meal-type default instead of raw ingredient collages', () => {
    const recipe = BUNDLED_CATALOG.find(
      (item) => !Object.hasOwn(MEAL_ART_TILES, item.id) && mealTypeArt(item.id)
    )!;
    const markup = renderToStaticMarkup(
      createElement(RecipeImage, {
        recipeId: recipe.id,
        title: recipe.title,
      })
    );
    expect(markup).toContain('Couscous bowl');
    expect(markup).toContain('Illustration');
    expect(markup).not.toContain('Ingredient reference:');
    expect(markup).not.toContain('thumb.wikimedia.org');
  });
  it('keeps supplied photos above bundled artwork', () => {
    const markup = renderToStaticMarkup(
      createElement(RecipeImage, {
        uri: 'https://example.test/food.jpg',
        recipeId: 'hc-mw-01',
        title: 'Mug Scrambled Eggs',
      })
    );
    expect(markup).toContain('aria-label="Mug Scrambled Eggs"');
    expect(markup).toContain('Serving illustration for Mug Scrambled Eggs');
    expect(markup).toContain('width:72px;height:72px');
  });

  it('renders the registered food tile rather than a cutlery glyph when a URL is missing', () => {
    const markup = renderToStaticMarkup(
      createElement(RecipeImage, {
        recipeId: 'hc-mw-01',
        uri: null,
        title: 'Mug Scrambled Eggs',
      })
    );
    expect(markup).toContain('left:-72px;top:-72px');
    expect(markup).toContain('Serving illustration');
    expect(markup).not.toContain('data-icon');
  });

  it('uses a neutral place setting for unknown recipes', () => {
    const markup = renderToStaticMarkup(createElement(RecipeImage, { title: 'New dish' }));
    expect(markup).toContain('left:-288px;top:-504px');
    expect(markup).not.toContain('data-icon');
  });

  it('does not attempt to render a blank remote URL', () => {
    const markup = renderToStaticMarkup(
      createElement(RecipeImage, { uri: '  ', title: 'New dish' })
    );
    expect(markup.match(/aria-label=/g)).toHaveLength(1);
  });
});
