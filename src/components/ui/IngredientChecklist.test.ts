import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/theme/useTheme', () => ({
  useTheme: () => ({
    color: {
      bg: '#FFF8EF',
      surface: '#FFFFFF',
      surfaceAlt: '#F6EBDD',
      text: '#251B16',
      textMuted: '#706158',
      accent: '#247148',
      accentText: '#FFFFFF',
      border: '#E8D6C5',
    },
    shadow: {},
    isDark: false,
    themeMode: 'light',
  }),
}));

vi.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: ({ name }: { name: string }) =>
    createElement('span', { 'data-icon': name }),
}));

import { IngredientChecklist } from '@/components/ui/IngredientChecklist';

describe('IngredientChecklist', () => {
  it('renders ingredient rows with checkbox roles and labels', () => {
    const markup = renderToStaticMarkup(
      createElement(IngredientChecklist, {
        ids: ['rice', 'onion'],
        selectedIds: ['rice'],
        onToggle: () => undefined,
        emptyMessage: 'No ingredients found.',
      })
    );

    expect(markup).toContain('aria-label="rice"');
    expect(markup).toContain('aria-label="onion"');
    expect(markup).toContain('role="checkbox"');
    expect(markup).toContain('aria-checked="true"');
    // Does not use chip/capsule markup
    expect(markup).not.toContain('chip');
  });

  it('renders the empty message when no ids match', () => {
    const markup = renderToStaticMarkup(
      createElement(IngredientChecklist, {
        ids: [],
        selectedIds: [],
        onToggle: () => undefined,
        emptyMessage: 'No ingredients matching your search.',
      })
    );

    expect(markup).toContain('No ingredients matching your search.');
  });
});
