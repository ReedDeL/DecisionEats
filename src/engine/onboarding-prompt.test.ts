import { describe, expect, it } from 'vitest';
import { makeOnboardingProgress, makeOnboardingPromptState } from '@/engine/__fixtures__';
import {
  chooseContinuousOnboardingPrompt,
  resolveContinuousOnboardingPrompt,
} from '@/engine/onboarding-prompt';

describe('chooseContinuousOnboardingPrompt', () => {
  it.each([
    {
      expected: 'safety',
      journey: 'week',
      completed: {},
    },
    {
      expected: 'week_preference',
      journey: 'week',
      completed: { safetyCompleted: true },
    },
    {
      expected: 'photo_taste',
      journey: 'now',
      completed: { safetyCompleted: true },
    },
    {
      expected: 'body_profile',
      journey: 'now',
      completed: { safetyCompleted: true, photoTasteCompleted: true },
    },
    {
      expected: 'reminder',
      journey: 'now',
      completed: {
        safetyCompleted: true,
        photoTasteCompleted: true,
        bodyProfileCompleted: true,
      },
    },
  ] as const)('selects $expected at its frozen priority', ({ expected, journey, completed }) => {
    expect(
      chooseContinuousOnboardingPrompt({
        journey,
        progress: makeOnboardingProgress(completed),
        state: makeOnboardingPromptState(),
      })
    ).toEqual({
      kind: expected,
      state: { shownThisSession: true, activePrompt: expected },
    });
  });

  it('defers unavailable prompts and offers the next usable one', () => {
    const progress = makeOnboardingProgress({ safetyCompleted: true });
    expect(
      chooseContinuousOnboardingPrompt({
        journey: 'now',
        progress,
        state: makeOnboardingPromptState(),
        availablePrompts: ['body_profile', 'reminder'],
      })
    ).toEqual({
      kind: 'body_profile',
      state: { shownThisSession: true, activePrompt: 'body_profile' },
    });
    expect(
      chooseContinuousOnboardingPrompt({
        journey: 'now',
        progress,
        state: makeOnboardingPromptState(),
        availablePrompts: [],
      })
    ).toBeNull();
  });

  it('offers the week-critical preference only during the week journey', () => {
    const progress = makeOnboardingProgress({
      safetyCompleted: true,
      photoTasteCompleted: true,
      bodyProfileCompleted: true,
      reminderCompleted: true,
    });

    expect(
      chooseContinuousOnboardingPrompt({
        journey: 'now',
        progress,
        state: makeOnboardingPromptState(),
      })
    ).toBeNull();
    expect(
      chooseContinuousOnboardingPrompt({
        journey: 'week',
        progress,
        state: makeOnboardingPromptState(),
      })?.kind
    ).toBe('week_preference');
  });

  it('returns null when all eligible durable prompts are complete', () => {
    expect(
      chooseContinuousOnboardingPrompt({
        journey: 'week',
        progress: makeOnboardingProgress({
          safetyCompleted: true,
          weekPreferenceCompleted: true,
          photoTasteCompleted: true,
          bodyProfileCompleted: true,
          reminderCompleted: true,
        }),
        state: makeOnboardingPromptState(),
      })
    ).toBeNull();
  });

  it.each([
    makeOnboardingPromptState({ shownThisSession: true, activePrompt: null }),
    makeOnboardingPromptState({ shownThisSession: true, activePrompt: 'safety' }),
  ])('never selects another prompt after the session slot is consumed', (state) => {
    expect(
      chooseContinuousOnboardingPrompt({
        journey: 'week',
        progress: makeOnboardingProgress(),
        state,
      })
    ).toBeNull();
  });
});

describe('resolveContinuousOnboardingPrompt', () => {
  it('closes a skipped prompt without changing durable progress', () => {
    const progress = makeOnboardingProgress();
    const result = resolveContinuousOnboardingPrompt({
      outcome: 'skipped',
      progress,
      state: makeOnboardingPromptState({
        shownThisSession: true,
        activePrompt: 'photo_taste',
      }),
    });

    expect(result).toEqual({
      progress,
      state: { shownThisSession: true, activePrompt: null },
    });
    expect(result.progress).toBe(progress);
    expect(Object.keys(result)).not.toContain('tasteSignal');
  });

  it.each([
    ['safety', 'safetyCompleted'],
    ['week_preference', 'weekPreferenceCompleted'],
    ['photo_taste', 'photoTasteCompleted'],
    ['body_profile', 'bodyProfileCompleted'],
    ['reminder', 'reminderCompleted'],
  ] as const)('answering %s marks only %s complete', (activePrompt, completedField) => {
    const progress = makeOnboardingProgress();
    const expectedProgress = { ...progress, [completedField]: true };
    const result = resolveContinuousOnboardingPrompt({
      outcome: 'answered',
      progress,
      state: makeOnboardingPromptState({ shownThisSession: true, activePrompt }),
    });

    expect(result).toEqual({
      progress: expectedProgress,
      state: { shownThisSession: true, activePrompt: null },
    });
    expect(progress).toEqual(makeOnboardingProgress());
  });

  it.each(['answered', 'skipped'] as const)(
    '%s leaves a consumed session closed when no prompt is active',
    (outcome) => {
      const progress = makeOnboardingProgress();
      expect(
        resolveContinuousOnboardingPrompt({
          outcome,
          progress,
          state: makeOnboardingPromptState({ shownThisSession: true, activePrompt: null }),
        })
      ).toEqual({
        progress,
        state: { shownThisSession: true, activePrompt: null },
      });
    }
  );
});
