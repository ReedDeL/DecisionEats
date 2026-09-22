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

import {
  TimeSlider,
  TIME_SLIDER_OPTIONS,
  getClosestOptionIndex,
  getClosestOptionIndexFromRatio,
  getPercentForOptionIndex,
} from '@/components/ui/TimeSlider';

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
    expect(markup).toContain('aria-valuenow="30"');
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
    expect(markup).toContain('15 minutes or less');
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
    expect(markup).toContain('tabindex="0"');
  });

  it('applies interactive cursor and touch styles on web', () => {
    const markup = renderToStaticMarkup(
      createElement(TimeSlider, {
        value: 30,
        onChange: () => undefined,
      })
    );

    expect(markup).toContain('r-cursor-1loqt21');
    expect(markup).toContain('r-touchAction-19z077z');
    expect(markup).toContain('r-userSelect-lrvibr');
    expect(markup).toContain('transition:left 160ms');
    expect(markup).toContain('transition:width 160ms');
  });

  describe('snapping and calculations', () => {
    it('snaps minutes to closest discrete option index', () => {
      expect(getClosestOptionIndex(15)).toBe(0);
      expect(getClosestOptionIndex(30)).toBe(1);
      expect(getClosestOptionIndex(60)).toBe(2);

      // Intermediate values snap to nearest
      expect(getClosestOptionIndex(10)).toBe(0);
      expect(getClosestOptionIndex(20)).toBe(0);
      expect(getClosestOptionIndex(25)).toBe(1);
      expect(getClosestOptionIndex(40)).toBe(1);
      expect(getClosestOptionIndex(50)).toBe(2);
      expect(getClosestOptionIndex(90)).toBe(2);
    });

    it('snaps ratio cleanly between the options with midpoint thresholds', () => {
      // 15 min bucket: ratio < 0.25
      expect(getClosestOptionIndexFromRatio(0.0)).toBe(0);
      expect(getClosestOptionIndexFromRatio(0.1)).toBe(0);
      expect(getClosestOptionIndexFromRatio(0.24)).toBe(0);

      // 30 min bucket: 0.25 <= ratio <= 0.75
      expect(getClosestOptionIndexFromRatio(0.25)).toBe(1);
      expect(getClosestOptionIndexFromRatio(0.4)).toBe(1);
      expect(getClosestOptionIndexFromRatio(0.5)).toBe(1);
      expect(getClosestOptionIndexFromRatio(0.75)).toBe(1);

      // 60+ min bucket: ratio > 0.75
      expect(getClosestOptionIndexFromRatio(0.76)).toBe(2);
      expect(getClosestOptionIndexFromRatio(0.9)).toBe(2);
      expect(getClosestOptionIndexFromRatio(1.0)).toBe(2);

      // Clamped ratios outside [0, 1]
      expect(getClosestOptionIndexFromRatio(-0.5)).toBe(0);
      expect(getClosestOptionIndexFromRatio(1.5)).toBe(2);
    });

    it('returns exact percentage for each option index', () => {
      expect(getPercentForOptionIndex(0)).toBe(0);
      expect(getPercentForOptionIndex(1)).toBe(50);
      expect(getPercentForOptionIndex(2)).toBe(100);

      // Clamped
      expect(getPercentForOptionIndex(-1)).toBe(0);
      expect(getPercentForOptionIndex(5)).toBe(100);
    });
  });
});
