import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');
}

describe('goals onboarding acceptance contract', () => {
  it('keeps the four-step onboarding sequence contiguous', () => {
    expect(source('app/(onboarding)/equipment.tsx')).toContain(
      "router.push('/(onboarding)/restrictions')"
    );
    expect(source('app/(onboarding)/restrictions.tsx')).toContain(
      "router.push('/(onboarding)/goals')"
    );
    expect(source('app/(onboarding)/goals.tsx')).toContain("router.push('/(onboarding)/staples')");
    expect(source('app/(onboarding)/staples.tsx')).toContain('fallbackHref="/(onboarding)/goals"');

    expect(source('app/(onboarding)/equipment.tsx')).toContain('currentStep={1} totalSteps={4}');
    expect(source('app/(onboarding)/restrictions.tsx')).toContain('currentStep={2} totalSteps={4}');
    expect(source('app/(onboarding)/goals.tsx')).toContain('currentStep={3} totalSteps={4}');
    expect(source('app/(onboarding)/staples.tsx')).toContain('currentStep={4} totalSteps={4}');
  });

  it('makes the neutral goals skip explicit, local, and forward-only', () => {
    const goals = source('app/(onboarding)/goals.tsx');

    expect(goals).toContain("label: 'Not now / Skip'");
    expect(goals).toContain('clearBodyData();');
    expect(goals).toContain("router.push('/(onboarding)/staples');");
    expect(goals).toContain("accessibilityHint: 'Skips goals and keeps standard recommendations'");
    expect(goals).not.toContain('track');
  });

  it('exposes accessible goal and optional metric semantics with privacy copy', () => {
    const goals = source('app/(onboarding)/goals.tsx');

    expect(goals).toContain('accessibilityRole="radiogroup"');
    expect(goals).toContain('accessibilityLabel="Weight goal"');
    expect(goals).toContain('accessibilityHint="Choose a goal to adjust meal recommendations"');
    expect(goals).toContain('accessibilityLabel="Current weight"');
    expect(goals).toContain("'Height in centimeters'");
    expect(goals).toContain('accessibilityLabel="Height in inches"');
    expect(goals).toContain('Current weight');
    expect(goals).toContain('Height');
    expect(goals).toContain('placeholder="Optional"');
    expect(goals).toContain('Stored on this device and used for portion estimates.');
    expect(goals).not.toContain(
      'Height and weight are optional. Used only to personalize portion estimates on this device.'
    );
  });
});

describe('shared Settings action acceptance contract', () => {
  const currentEntryPoints = [
    'app/(tabs)/index.tsx',
    'app/(tabs)/pantry.tsx',
    'app/(tabs)/plan.tsx',
  ];

  it('uses the shared action and settings route across Now/results, Pantry, and Plan', () => {
    for (const path of currentEntryPoints) {
      const screen = source(path);
      expect(screen, path).toContain("from '@/components/ui/SettingsAction'");
      expect(screen, path).toContain("router.push('/settings')");
      expect(screen, path).not.toContain('⚙️');
    }

    // Now owns both the initial decision and its results state; both entry
    // points must stay available without introducing a second control style.
    expect(
      source('app/(tabs)/index.tsx').match(/<SettingsAction/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(2);
  });

  it('keeps the shared action usable at the touch-target floor', () => {
    const settingsAction = source('src/components/ui/SettingsAction.tsx');
    const action = source('src/components/ui/ActionButton.tsx');

    expect(settingsAction).toContain('<ActionButton');
    expect(settingsAction).toContain('accessibilityHint =');
    expect(settingsAction).not.toContain('⚙️');
    expect(action).toContain('minHeight: touchTarget.standard');
    expect(action).toContain('minWidth: touchTarget.standard');
    expect(action).toContain('accessibilityRole="button"');
    expect(action).toContain('accessibilityLabel={accessibilityLabel ?? label}');
  });
});

describe('photo safety acceptance contract', () => {
  it('discloses provider processing and review responsibility', () => {
    const scan = source('app/scan.tsx');
    const settings = source('app/settings.tsx');

    for (const screen of [scan, settings]) {
      const lowerScreen = screen.toLowerCase();
      expect(lowerScreen).toContain('third-party photo-recognition provider');
      expect(lowerScreen).toContain('does not save');
      expect(lowerScreen).toContain('not medical');
      expect(lowerScreen).toContain('do not include people');
    }
  });
});

describe('pantry starter onboarding acceptance contract', () => {
  it('exposes photo scan, search, and virtualized checklist in order', () => {
    const staples = source('app/(onboarding)/staples.tsx');

    expect(staples).toContain('Scan pantry with a photo');
    expect(staples).toContain('placeholder="Search ingredients"');
    expect(staples).toContain('<IngredientChecklist');
    expect(staples).not.toContain('IngredientChip');
    expect(staples).toContain("router.push('/scan')");
    expect(staples).toContain('completeOnboarding');
  });
});
