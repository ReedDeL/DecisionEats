import { MEAL_SLOTS, type MealSlot } from '@/contracts/meal-slots';
import type { PlanPrepStyle } from '@/engine/plan-proposal';
import type { DailyPlanPreference } from '@/engine/types';

const HOURS: Record<MealSlot, [number, number]> = {
  breakfast: [8, 0],
  lunch: [12, 30],
  dinner: [18, 30],
};

/** Default slot time on an existing plan date, without moving that date forward. */
export function defaultPlanMealTime(date: string, mealSlot: MealSlot): string {
  const value = new Date(`${date}T12:00:00`);
  value.setHours(...HOURS[mealSlot], 0, 0);
  const offset = -value.getTimezoneOffset();
  const absolute = Math.abs(offset);
  const zone =
    (offset >= 0 ? '+' : '-') +
    String(Math.floor(absolute / 60)).padStart(2, '0') +
    ':' +
    String(absolute % 60).padStart(2, '0');
  return (
    String(value.getHours()).padStart(2, '0') +
    ':' +
    String(value.getMinutes()).padStart(2, '0') +
    ':00' +
    zone
  );
}
export function buildWeekDays(
  style: PlanPrepStyle,
  anchorDate: Date,
  mealSlots: readonly MealSlot[] = ['dinner'],
  dayCount: 3 | 5 | 7 = 7
): DailyPlanPreference[] {
  const start = new Date(anchorDate);
  const firstSlot = MEAL_SLOTS.find((slot) => mealSlots.includes(slot));
  // A newly proposed week must not start earlier in the current calendar week.
  // Keep all selected slots together; if today's first slot passed, start tomorrow.
  if (firstSlot) {
    const firstMeal = new Date(anchorDate);
    firstMeal.setHours(...HOURS[firstSlot], 0, 0);
    if (firstMeal <= anchorDate) start.setDate(start.getDate() + 1);
  }
  return Array.from({ length: dayCount }, (_, index) =>
    MEAL_SLOTS.filter((slot) => mealSlots.includes(slot)).map((mealSlot) => {
      const value = new Date(start);
      value.setDate(start.getDate() + index);
      value.setHours(...HOURS[mealSlot], 0, 0);
      const date = [
        value.getFullYear(),
        String(value.getMonth() + 1).padStart(2, '0'),
        String(value.getDate()).padStart(2, '0'),
      ].join('-');
      return {
        date,
        mealSlot,
        selectedLimit: style === 'quick' ? 30 : style === 'batch' ? 120 : 60,
        mealTime: defaultPlanMealTime(date, mealSlot),
      };
    })
  ).flat();
}
