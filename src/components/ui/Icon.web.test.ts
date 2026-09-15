import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/Icon', () => import('./Icon.web'));

import { Icon, type IconName } from './Icon.web';
import { SettingsAction } from './SettingsAction';
import { PRIMARY_TABS } from '@/lib/navigation';

const names: IconName[] = [
  'camera',
  'check',
  'close',
  'cog',
  'meal',
  'arrow-right',
  'arrow-left',
  'swap',
  'calendar',
  'pantry',
  'sunrise',
  'sun',
  'moon',
  'produce',
  'protein',
  'dairy',
  'dry-pantry',
  'seasoning',
  'ingredient',
];

describe('web icons without font loading', () => {
  it.each(names)('renders %s as inline geometry without a font or external asset', (name) => {
    const markup = renderToStaticMarkup(createElement(Icon, { name, color: '#fff', size: 28 }));
    expect(markup).toContain('<svg');
    expect(markup).toMatch(/<(path|circle|rect) /);
    expect(markup).toContain('width="28" height="28"');
    expect(markup).toContain('stroke="#fff"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('focusable="false"');
    expect(markup).not.toMatch(/font-family|<text|href=|src=/);
  });

  it('renders a real Settings gear while preserving the labeled button', () => {
    const markup = renderToStaticMarkup(
      createElement(SettingsAction, { onPress: () => undefined })
    );
    expect(markup).toContain('aria-label="Settings"');
    expect(markup).toContain('data-icon="cog"');
    expect(markup).toContain('<svg');
    expect(markup).toContain('>Settings<');
  });

  it('renders all three navigation icons in both selection states', () => {
    for (const tab of PRIMARY_TABS) {
      for (const name of [tab.icon, tab.activeIcon]) {
        const markup = renderToStaticMarkup(createElement(Icon, { name, color: '#fff' }));
        expect(markup).toContain('<svg');
        expect(markup).toMatch(/<(path|circle|rect) /);
      }
    }
  });
});
