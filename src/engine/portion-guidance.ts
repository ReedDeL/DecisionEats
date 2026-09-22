import type {
  ActivityLevel,
  BodyGoal,
  BodyProfile,
  CalculationSex,
  MealSatietyLevel,
  PortionGuidance,
} from '@/contracts/meal-journeys';
import type { Recipe } from '@/engine/types';

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const SEX_OFFSETS: Record<CalculationSex, number> = {
  female: -161,
  male: 5,
};

const GOAL_ADJUSTMENTS: Record<BodyGoal, number> = {
  lose: -250,
  maintain: 0,
  gain: 200,
};

const GOAL_BASELINES: Record<BodyGoal, number> = {
  lose: 0.9,
  maintain: 1,
  gain: 1.1,
};

const SATIETY_ADJUSTMENTS: Record<MealSatietyLevel, number> = {
  still_hungry: 0.25,
  satisfied: 0,
  too_full: -0.25,
};

const DISCLAIMER = 'Estimate only—adjust to your hunger.' as const;

export interface PortionBodyMetrics {
  heightCentimeters: number | null;
  weightKilograms: number | null;
}

export interface PortionGuidanceInput {
  recipe: Recipe;
  bodyProfile: BodyProfile | null;
  /** Goal-only onboarding can provide this without collecting a full profile. */
  bodyGoal?: BodyGoal | null;
  /** Lightweight onboarding can personalize without inventing uncollected profile fields. */
  bodyMetrics?: PortionBodyMetrics | null;
  satietyLevel: MealSatietyLevel | null;
}

/**
 * Goal usability is independent from full-profile energy eligibility. This
 * boundary stays explicit because quarter rounding masks all three baselines
 * in the final presentation for the current satiety adjustments.
 */
export function getGoalBasedServingBaseline(
  profile: BodyProfile | null,
  fallbackGoal: BodyGoal | null | undefined = null
): number {
  const goal: unknown = profile?.goal ?? fallbackGoal;
  return isBodyGoal(goal) ? GOAL_BASELINES[goal] : GOAL_BASELINES.maintain;
}

export function getPortionGuidance(input: PortionGuidanceInput): PortionGuidance | null {
  const { energyKcalPerServing, nutritionConfidence } = input.recipe;
  if (
    (nutritionConfidence !== 'high' && nutritionConfidence !== 'medium') ||
    energyKcalPerServing === null ||
    !Number.isFinite(energyKcalPerServing) ||
    energyKcalPerServing <= 0
  ) {
    return null;
  }

  const profile = input.bodyProfile;
  const validProfile = isValidBodyProfile(profile) ? profile : null;
  const startingServings =
    validProfile !== null && !validProfile.pregnant && !validProfile.breastfeeding
      ? calculateEnergyBasedServings(validProfile, energyKcalPerServing)
      : getGoalBasedServingBaseline(profile, input.bodyGoal) +
        getBodyMetricsServingAdjustment(input.bodyMetrics);
  const satietyAdjustment =
    input.satietyLevel === null ? 0 : SATIETY_ADJUSTMENTS[input.satietyLevel];
  const servings = clamp(roundToNearestQuarter(startingServings + satietyAdjustment), 0.75, 1.5);

  return {
    servings,
    label: `Start with ${servings} ${servings === 1 ? 'serving' : 'servings'}`,
    disclaimer: DISCLAIMER,
  };
}

export function isValidPortionMetrics(
  metrics: PortionBodyMetrics | null | undefined
): metrics is { heightCentimeters: number; weightKilograms: number } {
  return (
    metrics !== null &&
    metrics !== undefined &&
    metrics.heightCentimeters !== null &&
    metrics.weightKilograms !== null &&
    Number.isFinite(metrics.heightCentimeters) &&
    Number.isFinite(metrics.weightKilograms) &&
    metrics.heightCentimeters >= 120 &&
    metrics.heightCentimeters <= 230 &&
    metrics.weightKilograms >= 35 &&
    metrics.weightKilograms <= 300
  );
}

export function calculateTargetMealKcal(
  profile: BodyProfile | null | undefined,
  goal: BodyGoal | null | undefined,
  metrics: PortionBodyMetrics | null | undefined
): number | null {
  if (profile && isValidBodyProfile(profile) && !profile.pregnant && !profile.breastfeeding) {
    const restingKcal =
      10 * profile.weightKilograms +
      6.25 * profile.heightCentimeters -
      5 * profile.ageYears +
      SEX_OFFSETS[profile.calculationSex];
    const targetDailyKcal =
      restingKcal * ACTIVITY_FACTORS[profile.activityLevel] + GOAL_ADJUSTMENTS[profile.goal];
    return targetDailyKcal / 3;
  }

  const effectiveGoal = profile?.goal ?? goal;
  if (!effectiveGoal || !isValidPortionMetrics(metrics)) {
    return null;
  }

  const restingKcal = 10 * metrics.weightKilograms + 6.25 * metrics.heightCentimeters - 200;
  const maintenanceDailyKcal = restingKcal * 1.35;
  const goalAdjustment = GOAL_ADJUSTMENTS[effectiveGoal];
  return (maintenanceDailyKcal + goalAdjustment) / 3;
}

function calculateEnergyBasedServings(profile: BodyProfile, energyKcalPerServing: number): number {
  const targetMealKcal = calculateTargetMealKcal(profile, profile.goal, null) ?? 0;
  return targetMealKcal / energyKcalPerServing;
}

function getBodyMetricsServingAdjustment(metrics: PortionBodyMetrics | null | undefined): number {
  if (!isValidPortionMetrics(metrics)) {
    return 0;
  }

  const bodySurfaceArea = Math.sqrt((metrics.heightCentimeters * metrics.weightKilograms) / 3600);
  return bodySurfaceArea < 1.5 ? -0.25 : bodySurfaceArea > 2 ? 0.25 : 0;
}

function isBodyGoal(value: unknown): value is BodyGoal {
  return value === 'lose' || value === 'maintain' || value === 'gain';
}

function isValidBodyProfile(profile: BodyProfile | null): profile is BodyProfile {
  return (
    profile !== null &&
    Number.isInteger(profile.ageYears) &&
    profile.ageYears >= 18 &&
    profile.ageYears <= 120 &&
    Number.isFinite(profile.heightCentimeters) &&
    profile.heightCentimeters >= 120 &&
    profile.heightCentimeters <= 230 &&
    Number.isFinite(profile.weightKilograms) &&
    profile.weightKilograms >= 35 &&
    profile.weightKilograms <= 300 &&
    profile.calculationSex in SEX_OFFSETS &&
    profile.activityLevel in ACTIVITY_FACTORS &&
    profile.goal in GOAL_ADJUSTMENTS &&
    typeof profile.pregnant === 'boolean' &&
    typeof profile.breastfeeding === 'boolean'
  );
}

function roundToNearestQuarter(value: number): number {
  return Math.round(value * 4) / 4;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
