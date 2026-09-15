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

import { TimeSlider, TIME_SLIDER_OPTIONS } from '@/components/ui/TimeSlider';

describe('TimeSlider', () => {
  it('defines 15, 30, and 60+ as the time options', () => {
    expect(TIME_SLIDER_OPTIONS.map((o) => o.minutes)).toEqual([15, 30, 60]);
    expect(TIME_SLIDER_OPTIONS.map((o) => o.label)).toEqual(['15 min', '30 min', '60+ min']);
  });

  it('renders active value display and descriptor for 30 min default', () => {
    const markup = renderToStaticMarkup(
      createElement(TimeSlider, {
        value: 30,
        onChange: () => undefined,
      })
    );

    expect(markup).toContain('30 min');
    expect(markup).toContain('Standard prep');
    expect(markup).toContain('15 min');
    expect(markup).toContain('60+ min');
  });

  it('renders active value display and descriptor for 15 min', () => {
    const markup = renderToStaticMarkup(
      createElement(TimeSlider, {
        value: 15,
        onChange: () => undefined,
      })
    );

    expect(markup).toContain('Quick meal');
    expect(markup).toContain('aria-valuenow="15"');
  });

  it('renders active value display and descriptor for 60+ min', () => {
    const markup = renderToStaticMarkup(
      createElement(TimeSlider, {
        value: 60,
        onChange: () => undefined,
      })
    );

    expect(markup).toContain('Take your time');
    expect(markup).toContain('aria-valuenow="60"');
    expect(markup).toContain('60 minutes or more');
  });

  it('exposes adjustable slider semantics for assistive technologies', () => {
    const markup = renderToStaticMarkup(
      createElement(TimeSlider, {
        value: 30,
        onChange: () => undefined,
      })
    );

    expect(markup).toContain('role="slider"');
    expect(markup).toContain('aria-valuemin="15"');
    expect(markup).toContain('aria-valuemax="60"');
    expect(markup).toContain('aria-valuenow="30"');
  });
});
