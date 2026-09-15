import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
      ready: '#34745A',
      near: '#A45F0A',
      far: '#81736A',
      danger: '#B93832',
      border: '#E8D6C5',
    },
    shadow: { sm: {}, lg: {} },
    isDark: false,
    themeMode: 'light',
  }),
}));

vi.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: ({ name }: { name: string }) =>
    createElement('span', { 'data-icon': name }),
}));

import { SettingsAction } from '@/components/ui/SettingsAction';
import { touchTarget } from '@/theme/tokens';

describe('SettingsAction (Prompt 8)', () => {
  it('renders a vector gear icon and never emoji or text characters', () => {
    const markup = renderToStaticMarkup(
      createElement(SettingsAction, {
        onPress: () => undefined,
      })
    );

    // Renders the real vector gear icon
    expect(markup).toContain('data-icon="cog-outline"');

    // Never renders Unicode gear or emoji
    expect(markup).not.toContain('⚙');
    expect(markup).not.toContain('⚙️');
    expect(markup).not.toContain('&#9881;');

    // A visible label keeps the action recognizable if the icon font is unavailable
    expect(markup).toContain('>Settings<');
  });

  it('exposes accessible name exactly as "Settings" with optional contextual hint', () => {
    const markup = renderToStaticMarkup(
      createElement(SettingsAction, {
        onPress: () => undefined,
        accessibilityHint: 'Opens app settings for theme and kitchen preferences',
      })
    );

    expect(markup).toContain('aria-label="Settings"');
    expect(markup).toContain('role="button"');
    expect(markup).toContain('>Settings<');
  });

  it('maintains a 44x44 minimum touch target', () => {
    expect(touchTarget.standard).toBeGreaterThanOrEqual(44);
  });

  it('supports hover, focus, and pressed visual states', () => {
    const actionSource = readFileSync(
      fileURLToPath(new URL('./ActionButton.tsx', import.meta.url)),
      'utf8'
    );

    expect(actionSource).toContain('onHoverIn');
    expect(actionSource).toContain('onHoverOut');
    expect(actionSource).toContain('onFocus');
    expect(actionSource).toContain('onBlur');
    expect(actionSource).toContain('pressed || hovered || focused');
    expect(actionSource).toContain('color.surfaceAlt');
    expect(actionSource).toContain('color.accent');
  });

  it('is consistently placed across all current entry points routing to /settings', () => {
    const entryPoints = ['app/(tabs)/index.tsx', 'app/(tabs)/pantry.tsx', 'app/(tabs)/plan.tsx'];

    for (const relativePath of entryPoints) {
      const source = readFileSync(
        fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)),
        'utf8'
      );
      expect(source, relativePath).toContain("from '@/components/ui/SettingsAction'");
      expect(source, relativePath).toContain('<SettingsAction');
      expect(source, relativePath).toContain("router.push('/settings')");
      expect(source, relativePath).not.toContain('⚙️');
    }
  });
});
