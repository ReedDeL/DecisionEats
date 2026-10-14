import type {
  ContinuousOnboardingProgress,
  ContinuousOnboardingPromptKind,
  ContinuousOnboardingPromptState,
  MealJourney,
} from '@/contracts/meal-journeys';

type CompletionField = Exclude<keyof ContinuousOnboardingProgress, 'updatedAt'>;

const COMPLETION_FIELDS: Record<ContinuousOnboardingPromptKind, CompletionField> = {
  safety: 'safetyCompleted',
  week_preference: 'weekPreferenceCompleted',
  photo_taste: 'photoTasteCompleted',
  body_profile: 'bodyProfileCompleted',
  reminder: 'reminderCompleted',
};

export interface ChooseContinuousOnboardingPromptInput {
  journey: MealJourney;
  progress: ContinuousOnboardingProgress;
  state: ContinuousOnboardingPromptState;
  /** Missing UI defers a prompt without spending the session slot. */
  availablePrompts?: readonly ContinuousOnboardingPromptKind[];
}

export interface ContinuousOnboardingPrompt {
  kind: ContinuousOnboardingPromptKind;
  state: ContinuousOnboardingPromptState;
}

export interface ResolveContinuousOnboardingPromptInput {
  outcome: 'answered' | 'skipped';
  progress: ContinuousOnboardingProgress;
  state: ContinuousOnboardingPromptState;
}

export interface ContinuousOnboardingResolution {
  progress: ContinuousOnboardingProgress;
  state: ContinuousOnboardingPromptState;
}

export function chooseContinuousOnboardingPrompt(
  input: ChooseContinuousOnboardingPromptInput
): ContinuousOnboardingPrompt | null {
  if (input.state.shownThisSession) return null;

  const kind = firstEligiblePrompt(input.journey, input.progress, input.availablePrompts);
  if (kind === null) return null;

  return {
    kind,
    state: { shownThisSession: true, activePrompt: kind },
  };
}

export function resolveContinuousOnboardingPrompt(
  input: ResolveContinuousOnboardingPromptInput
): ContinuousOnboardingResolution {
  const activePrompt = input.state.activePrompt;
  const progress =
    input.outcome === 'answered' && activePrompt !== null
      ? { ...input.progress, [COMPLETION_FIELDS[activePrompt]]: true }
      : input.progress;

  return {
    progress,
    state: { shownThisSession: true, activePrompt: null },
  };
}

function firstEligiblePrompt(
  journey: MealJourney,
  progress: ContinuousOnboardingProgress,
  availablePrompts?: readonly ContinuousOnboardingPromptKind[]
): ContinuousOnboardingPromptKind | null {
  const available = (kind: ContinuousOnboardingPromptKind) =>
    availablePrompts === undefined || availablePrompts.includes(kind);
  if (!progress.safetyCompleted && available('safety')) return 'safety';
  if (journey === 'week' && !progress.weekPreferenceCompleted && available('week_preference'))
    return 'week_preference';
  if (!progress.photoTasteCompleted && available('photo_taste')) return 'photo_taste';
  if (!progress.bodyProfileCompleted && available('body_profile')) return 'body_profile';
  if (!progress.reminderCompleted && available('reminder')) return 'reminder';
  return null;
}
