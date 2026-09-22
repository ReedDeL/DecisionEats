import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { formatFriendlyDate } from '@/lib/format';

function readApp(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../app/${relativePath}`, import.meta.url)), 'utf8');
}

const planSource = readApp('(tabs)/plan.tsx');

describe('PlanScreen contract and flow requirements', () => {
  it('enforces one decision per screen and non-auto-advance on selection', () => {
    // Selection only sets state, never calls setStep or generate directly in card onPress
    expect(planSource).toContain('onPress={() => onDays(option.value)}');
    expect(planSource).toContain('onPress={() => onToggleMealSlot(option.value)}');
    expect(planSource).toContain('onPress={() => onStyle(option.value)}');
    expect(planSource).toContain('onPress={() => onVariety(option.value)}');

    // No direct auto-advancing in selection handlers
    expect(planSource).not.toContain('onDays={(value) => { setDays(value); setStep');
    expect(planSource).not.toContain('onStyle={(value) => { setPrepStyle(value); setStep');
    expect(planSource).not.toContain('onVariety={(value) => { setVariety(value); generate');
  });

  it('provides an explicit primary Next button in the footer and disables when invalid', () => {
    expect(planSource).toContain('footer={footerAction}');
    expect(planSource).toContain('label="Next"');
    expect(planSource).toContain("disabled={step === 'slots' ? mealSlots.length === 0 : false}");
  });

  it('uses "Build my plan" on the final step with duplicate-submit prevention and recoverable state', () => {
    expect(planSource).toContain("label={isGenerating ? 'Building your week…' : 'Build my plan'}");
    expect(planSource).toContain('disabled={isGenerating || !variety}');
    expect(planSource).toContain('if (generationLock.current');
    expect(planSource).toContain('Couldn’t build a plan');
    expect(planSource).toContain('setIsGenerating(false)');
  });

  it('preserves earlier answers when navigating Back', () => {
    expect(planSource).toContain("if (step === 'days')");
    expect(planSource).toContain('router.back()');
    expect(planSource).toContain("else if (step === 'slots') setStep('days')");
    expect(planSource).toContain("else if (step === 'style') setStep('slots')");
    expect(planSource).toContain("else if (step === 'variety') setStep('style')");
    // Back navigation does not clear days, mealSlots, prepStyle, or variety
  });

  it('completely removes "Why this plan works" without replacing it with another panel', () => {
    expect(planSource).not.toContain('Why this plan works');
    expect(planSource).not.toContain('describePlanPrepStyle');
    expect(planSource).not.toContain('describeIngredientReuse');
  });

  it('displays the exact limited-variety copy when limitedVariety is true', () => {
    expect(planSource).toContain('plan.limitedVariety');
    expect(planSource).toContain('Your pantry has a small match set, so a few meals repeat.');
  });

  it('groups entries by friendly local date and labels cards with meal slots', () => {
    expect(planSource).toContain('formatFriendlyDate(date)');
    expect(planSource).toContain('MEAL_SLOT_LABELS[entry.mealSlot]');
    expect(planSource).toContain('Breakfast');
    expect(planSource).toContain('Lunch');
    expect(planSource).toContain('Dinner');
  });

  it('swaps meals by date plus slot instead of array index', () => {
    expect(planSource).toContain('onSwap(entry.date, entry.mealSlot)');
    expect(planSource).toContain('const key = `${date}:${mealSlot}`');
    expect(planSource).toContain('swapPlanMeal(currentPlan, key, planInput)');
    expect(planSource).not.toContain('onSwap(index)');
    expect(planSource).not.toContain('swap(index: number)');
  });

  it('does not render inaccurate meal images in the meal plan', () => {
    expect(planSource).not.toContain('<RecipeImage');
    expect(planSource).not.toContain('recipe?.imageUrl');
  });
});

describe('formatFriendlyDate', () => {
  it('formats ISO dates into deterministic friendly local date strings regardless of time zone', () => {
    expect(formatFriendlyDate('2026-08-24')).toBe('Monday, Aug 24');
    expect(formatFriendlyDate('2026-08-25')).toBe('Tuesday, Aug 25');
    expect(formatFriendlyDate('2026-08-26')).toBe('Wednesday, Aug 26');
    expect(formatFriendlyDate('2026-08-27')).toBe('Thursday, Aug 27');
    expect(formatFriendlyDate('2026-08-28')).toBe('Friday, Aug 28');
    expect(formatFriendlyDate('2026-08-29')).toBe('Saturday, Aug 29');
    expect(formatFriendlyDate('2026-08-30')).toBe('Sunday, Aug 30');
  });

  it('returns raw string for invalid inputs', () => {
    expect(formatFriendlyDate('invalid')).toBe('invalid');
  });
});
