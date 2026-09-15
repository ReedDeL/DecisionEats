import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getResponsiveLayout } from '@/components/ui/responsive-layout';
import { COOKING_EQUIPMENT_OPTIONS, NO_COOKING_EQUIPMENT_OPTION } from '@/lib/equipment';

function readApp(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../app/${relativePath}`, import.meta.url)), 'utf8');
}

const kitchenSetupSource = readApp('kitchen-setup.tsx');
const remindersSource = readApp('reminders.tsx');
const settingsSource = readApp('settings.tsx');
const equipmentSource = readApp('(onboarding)/equipment.tsx');
const planSource = readApp('(tabs)/plan.tsx');
const homeSource = readApp('(tabs)/index.tsx');

describe('Kitchen Setup screen acceptance contract', () => {
  it('has accessible equipment checklist with save feedback', () => {
    expect(kitchenSetupSource).toContain('<EquipmentChecklist');
    expect(kitchenSetupSource).toContain('accessibilityLiveRegion="polite"');
    expect(kitchenSetupSource).toContain('Saved automatically');
  });

  it('keeps management non-destructive and provides both return destinations', () => {
    expect(kitchenSetupSource).toContain(
      'Your pantry, dietary restrictions, allergens, saved choices, and history stay exactly as'
    );
    expect(kitchenSetupSource).toContain("router.replace('/(tabs)')");
    expect(kitchenSetupSource).toContain("router.replace('/pantry')");
    expect(kitchenSetupSource).toContain('<PrimaryButton');
  });
});

describe('Reminders screen acceptance contract', () => {
  it('starts with first-visit guidance and the concrete-plan boundary', () => {
    expect(remindersSource).toContain("onboardingComplete ? 'complete' : 'explain'");
    expect(remindersSource).toContain('How reminders work');
    expect(remindersSource).toContain('only for concrete meals in a confirmed weekly plan');
    expect(remindersSource).toContain('Drafts');
    expect(remindersSource).toContain('Not now');
  });

  it('supports repeat visits, all approved presets, and chronological upcoming output', () => {
    expect(remindersSource).toContain('Reminder status');
    expect(remindersSource).toContain('Upcoming reminders');
    expect(remindersSource).toContain('getUpcomingMealPrepReminders');
    for (const label of [
      'At cook time',
      '10 min early',
      '15 min early',
      '30 min early',
      '60 min early',
    ]) {
      expect(remindersSource).toContain(label);
    }
    expect(remindersSource).toContain('Review reminder setup');
    expect(remindersSource).toContain('accessibilityRole="radiogroup"');
  });

  it('has explicit permission grant, denial, and unsupported branches', () => {
    expect(remindersSource).toContain("permission === 'unsupported'");
    expect(remindersSource).toContain("permission === 'granted'");
    expect(remindersSource).toContain('setPermissionError(true)');
    expect(remindersSource).toContain('Notifications are off, but this never blocks your plan');
    expect(remindersSource).toContain('Open device settings');
    expect(remindersSource).toContain('Reminders are unavailable on the web');
  });

  it('keeps Settings and confirmed-Plan navigation wired to the secondary destination', () => {
    expect(settingsSource).toContain("router.push('/reminders')");
    expect(planSource).toContain("router.push('/reminders')");
    expect(settingsSource).toContain('Open Reminders');
    expect(planSource).toContain('Open Reminders');
  });
});

describe('appliance option screen acceptance contract', () => {
  it('shares universal checklist component across onboarding and kitchen setup', () => {
    expect(equipmentSource).toContain('<EquipmentChecklist');
    expect(kitchenSetupSource).toContain('<EquipmentChecklist');
    expect(settingsSource).toContain("router.push('/kitchen-setup')");
    expect(COOKING_EQUIPMENT_OPTIONS.map((appliance) => appliance.label)).toEqual([
      'Microwave',
      'Stovetop',
      'Oven',
      'Electric kettle',
      'Air fryer',
      'Rice cooker',
      'Blender',
      'Toaster oven',
    ]);
    expect(NO_COOKING_EQUIPMENT_OPTION.label).toBe('No cooking equipment');
    expect(equipmentSource).not.toContain('Anything else?');
    expect(settingsSource).not.toContain('Anything else?');
    expect(kitchenSetupSource).not.toContain('Anything else?');
  });
});

describe('responsive Kitchen Setup contract', () => {
  it.each([960, 1180, 1920])('uses desktop composition at %ipx', (width) => {
    expect(getResponsiveLayout(width)).toMatchObject({
      mode: 'desktop',
      isDesktop: true,
      cuisineFilter: 'wrap',
      contentMaxWidth: 1600,
      gridColumns: 2,
    });
  });

  it('keeps a single-column, scroll-safe phone composition', () => {
    expect(getResponsiveLayout(390)).toMatchObject({
      mode: 'mobile',
      isDesktop: false,
      cuisineFilter: 'scroll',
      contentMaxWidth: undefined,
      gridColumns: 1,
    });
    expect(kitchenSetupSource).toContain('returnActions');
  });
});

describe('Home screen food-style choices contract', () => {
  it('renders broad food styles with wrapping on desktop and horizontal scroll on phone', () => {
    expect(homeSource).toContain("responsive.cuisineFilter === 'wrap'");
    expect(homeSource).toContain('styles.desktopCuisineRow');
    expect(homeSource).toContain('styles.cuisineScroll');
    expect(homeSource).toContain('horizontal');
  });

  it('provides Any food style and never auto-advances on selection', () => {
    expect(homeSource).toContain('label="Any"');
    expect(homeSource).toContain('FOOD_GENRE_OPTIONS.map');
    expect(homeSource).toContain('onSelectCuisine(cuisine === option.value ? null : option.value)');
  });
});
