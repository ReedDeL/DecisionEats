import { describe, expect, it } from 'vitest';

import {
  getUpcomingMealPrepReminders,
  toMealPrepReminderEntries,
} from '@/lib/meal-prep-reminder-view';

const NOW = new Date('2026-08-28T15:00:00.000Z');

describe('toMealPrepReminderEntries', () => {
  it('projects only confirmed concrete bundled recipe entries', () => {
    const dates = [
      '2026-08-28',
      '2026-08-29',
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ] as const;
    const plan = {
      weekStart: dates[0],
      dayCount: 7 as const,
      mealSlots: ['dinner'] as const,
      limitedVariety: false,
      status: 'confirmed' as const,
      groceryNeeds: [],
      statedRelaxations: [],
      entries: dates.map((date, index) =>
        index === 1
          ? {
              kind: 'day_of_decision' as const,
              date,
              mealSlot: 'dinner' as const,
              reason: 'not_planned' as const,
            }
          : {
              kind: 'recipe' as const,
              date,
              mealSlot: 'dinner' as const,
              recipeId: 'recipe-1',
              plannedMealTime: date + 'T18:30:00-07:00',
              statedRelaxations: [],
              portionGuidance: null,
            }
      ),
    };
    const recipe = {
      id: 'recipe-1',
      title: 'Tomato pasta',
      totalTimeMinutes: 30,
    } as never;

    expect(toMealPrepReminderEntries(plan, [recipe])).toHaveLength(6);
    expect(toMealPrepReminderEntries({ ...plan, status: 'draft' }, [recipe])).toEqual([]);
    expect(toMealPrepReminderEntries(null, [recipe])).toEqual([]);
    expect(toMealPrepReminderEntries(plan, [])).toEqual([]);

    // Duplicate catalog IDs retain the first entry's title and duration.
    const replacement = {
      id: 'recipe-1',
      title: 'Replacement pasta',
      totalTimeMinutes: 45,
    } as never;
    expect(toMealPrepReminderEntries(plan, [recipe, replacement])[0]).toMatchObject({
      recipeTitle: 'Tomato pasta',
      totalTimeMinutes: 30,
    });
    // A later projection observes the supplied catalog; no stale cross-call cache.
    expect(toMealPrepReminderEntries(plan, [replacement])[0]).toMatchObject({
      recipeTitle: 'Replacement pasta',
      totalTimeMinutes: 45,
    });
  });

  it('includes date, meal slot, and recipe ID in reminder identity for multi-slot plans', () => {
    const plan = {
      weekStart: '2026-08-28',
      dayCount: 3 as const,
      mealSlots: ['lunch', 'dinner'] as const,
      limitedVariety: false,
      status: 'confirmed' as const,
      groceryNeeds: [],
      statedRelaxations: [],
      entries: [
        {
          kind: 'recipe' as const,
          date: '2026-08-28',
          mealSlot: 'lunch' as const,
          recipeId: 'recipe-1',
          plannedMealTime: '2026-08-28T12:00:00-07:00',
          statedRelaxations: [],
          portionGuidance: null,
        },
        {
          kind: 'recipe' as const,
          date: '2026-08-28',
          mealSlot: 'dinner' as const,
          recipeId: 'recipe-1',
          plannedMealTime: '2026-08-28T18:30:00-07:00',
          statedRelaxations: [],
          portionGuidance: null,
        },
        {
          kind: 'recipe' as const,
          date: '2026-08-29',
          mealSlot: 'lunch' as const,
          recipeId: 'recipe-2',
          plannedMealTime: '2026-08-29T12:00:00-07:00',
          statedRelaxations: [],
          portionGuidance: null,
        },
        {
          kind: 'recipe' as const,
          date: '2026-08-29',
          mealSlot: 'dinner' as const,
          recipeId: 'recipe-2',
          plannedMealTime: '2026-08-29T18:30:00-07:00',
          statedRelaxations: [],
          portionGuidance: null,
        },
        {
          kind: 'day_of_decision' as const,
          date: '2026-08-30',
          mealSlot: 'lunch' as const,
          reason: 'not_planned' as const,
        },
        {
          kind: 'day_of_decision' as const,
          date: '2026-08-30',
          mealSlot: 'dinner' as const,
          reason: 'not_planned' as const,
        },
      ],
    };
    const catalog = [
      { id: 'recipe-1', title: 'Tomato pasta', totalTimeMinutes: 30 } as never,
      { id: 'recipe-2', title: 'Bean burrito', totalTimeMinutes: 15 } as never,
    ];

    const entries = toMealPrepReminderEntries(plan, catalog);
    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.id)).toEqual([
      '2026-08-28:lunch:recipe-1',
      '2026-08-28:dinner:recipe-1',
      '2026-08-29:lunch:recipe-2',
      '2026-08-29:dinner:recipe-2',
    ]);
  });
});

describe('getUpcomingMealPrepReminders', () => {
  it('returns only future concrete entries in notification order', () => {
    const reminders = getUpcomingMealPrepReminders(
      [
        {
          id: 'later',
          recipeId: 'r-later',
          recipeTitle: 'Later meal',
          totalTimeMinutes: 20,
          plannedMealTime: new Date('2026-08-29T19:00:00.000Z'),
        },
        {
          id: 'first',
          recipeId: 'r-first',
          recipeTitle: 'First meal',
          totalTimeMinutes: 30,
          plannedMealTime: new Date('2026-08-28T17:00:00.000Z'),
        },
        {
          id: 'past',
          recipeId: 'r-past',
          recipeTitle: 'Past meal',
          totalTimeMinutes: 20,
          plannedMealTime: new Date('2026-08-28T14:00:00.000Z'),
        },
      ],
      10,
      NOW
    );

    expect(reminders.map((reminder) => reminder.id)).toEqual(['first', 'later']);
    expect(reminders[0]?.notificationTime.toISOString()).toBe('2026-08-28T16:30:00.000Z');
  });

  it('keeps an offset-bearing planned time as the source of truth across timezones', () => {
    const reminders = getUpcomingMealPrepReminders(
      [
        {
          id: 'offset',
          recipeId: 'r-offset',
          recipeTitle: 'Offset meal',
          totalTimeMinutes: 30,
          plannedMealTime: new Date('2026-08-29T18:30:00-07:00'),
        },
      ],
      0,
      NOW
    );

    expect(reminders[0]?.notificationTime.toISOString()).toBe('2026-08-30T01:00:00.000Z');
  });

  it.each([0, 10, 15, 30, 60] as const)('accepts the approved %i minute lead preset', (lead) => {
    const reminders = getUpcomingMealPrepReminders(
      [
        {
          id: 'preset-' + lead,
          recipeId: 'r-preset',
          recipeTitle: 'Preset meal',
          totalTimeMinutes: 15,
          plannedMealTime: new Date('2026-08-29T19:00:00.000Z'),
        },
      ],
      lead,
      NOW
    );

    expect(reminders).toHaveLength(1);
  });

  it('has no output for empty, draft, or day-of-decision projections', () => {
    expect(getUpcomingMealPrepReminders([], 15, NOW)).toEqual([]);
  });
});
