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

import { EquipmentChecklist } from '@/components/ui/EquipmentChecklist';
import {
  COOKING_EQUIPMENT_OPTIONS,
  EQUIPMENT_CHECKLIST_OPTIONS,
  NO_COOKING_EQUIPMENT_OPTION,
} from '@/lib/equipment';

describe('EquipmentChecklist', () => {
  it('renders all equipment options with checkbox roles and labels', () => {
    const markup = renderToStaticMarkup(
      createElement(EquipmentChecklist, {
        selected: ['microwave', 'stove'],
        onToggle: () => undefined,
      })
    );

    expect(markup).toContain('aria-label="Cooking equipment checklist"');

    for (const option of EQUIPMENT_CHECKLIST_OPTIONS) {
      expect(markup).toContain(`aria-label="${option.label}"`);
    }

    // Verify all 8 appliances are rendered
    for (const option of COOKING_EQUIPMENT_OPTIONS) {
      expect(markup).toContain(option.label);
    }
    // Verify No cooking equipment is rendered
    expect(markup).toContain(NO_COOKING_EQUIPMENT_OPTION.label);

    // Verify checked state for selected items
    expect(markup).toContain('aria-checked="true"');
  });

  it('renders unchecked state when items are not selected', () => {
    const markup = renderToStaticMarkup(
      createElement(EquipmentChecklist, {
        selected: [],
        onToggle: () => undefined,
      })
    );

    // Should not have checked items
    expect(markup).not.toContain('aria-checked="true"');
    // Does not use chip/capsule markup
    expect(markup).not.toContain('chip');
  });
});
