import { describe, expect, it } from 'vitest';
import { buildWeekDays, defaultPlanMealTime } from './plan-week-days';

describe('new plan dates', () => {
  it('can fill a first-day breakfast placeholder on its existing plan date', () => {
    const time = defaultPlanMealTime('2026-10-05', 'breakfast');
    const instant = new Date(`2026-10-05T${time}`);
    expect(instant.getDate()).toBe(5);
    expect(instant.getHours()).toBe(8);
    expect(instant.getMinutes()).toBe(0);
  });
  it('starts a Saturday plan today when its selected meal is still ahead', () => {
    const days = buildWeekDays('quick', new Date(2026, 9, 10, 10), ['dinner'], 3);
    expect(days.map(({ date }) => date)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12']);
  });

  it('starts tomorrow once the first selected slot has arrived, preserving all slots', () => {
    const anchor = new Date(2026, 9, 10, 12, 30);
    const days = buildWeekDays('balanced', anchor, ['lunch', 'dinner'], 3);
    expect(days.map(({ date, mealSlot }) => `${date}/${mealSlot}`)).toEqual([
      '2026-10-11/lunch',
      '2026-10-11/dinner',
      '2026-10-12/lunch',
      '2026-10-12/dinner',
      '2026-10-13/lunch',
      '2026-10-13/dinner',
    ]);
    expect(days.every(({ date, mealTime }) => new Date(`${date}T${mealTime}`) > anchor)).toBe(true);
  });

  it('keeps local meal hours across a daylight-saving boundary', () => {
    const days = buildWeekDays('batch', new Date(2026, 9, 31, 10), ['dinner'], 3);
    expect(days.map(({ date }) => date)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
    for (const { date, mealTime } of days) {
      const instant = new Date(`${date}T${mealTime}`);
      expect(instant.getHours()).toBe(18);
      expect(instant.getMinutes()).toBe(30);
    }
  });
});
