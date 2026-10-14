# Feedback release file inventory

Snapshot: October 12, 2026, branch `feat/body-metric-recommendations`, base commit
`84ce74733b60945f6740d8eb5504e9a98f77ce0a`. All listed changes are local and unstaged.
This inventory records paths, not ownership of every line. Many edited files
already contained work when this run began; a whole-file stage would include it.
Nothing below authorizes silently including ambiguous prior auth/sync work.

`M` means modified tracked file; `??` means untracked. Tests, assets, and imports
must be committed together with the implementation they support. See the
[execution record](2026-10-12-feedback-execution.md) for outcomes and incomplete gates.

## Files edited or added during this run

| Git state | Path |
|---|---|
| `M` | `app/(tabs)/index.tsx` |
| `M` | `app/(tabs)/plan.tsx` |
| `M` | `app/_layout.tsx` |
| `M` | `app/image-credits.tsx` |
| `M` | `app/loading.tsx` |
| `M` | `app/recipe/[id].tsx` |
| `M` | `app/reminders.tsx` |
| `M` | `app/scan.tsx` |
| `M` | `app/settings.tsx` |
| `M` | `docs/07_WEB_LAUNCH.md` |
| `M` | `docs/README.md` |
| `M` | `src/app-plan-screen.test.ts` |
| `M` | `src/app-screen-contracts.test.ts` |
| `M` | `src/components/CameraCapture.web.tsx` |
| `M` | `src/components/ui/IngredientChecklist.tsx` |
| `M` | `src/components/ui/RecipeCard.test.ts` |
| `M` | `src/components/ui/RecipeCard.tsx` |
| `M` | `src/components/ui/RecipeImage.test.ts` |
| `M` | `src/components/ui/RecipeImage.tsx` |
| `M` | `src/components/ui/Screen.tsx` |
| `M` | `src/components/ui/SelectableCard.tsx` |
| `M` | `src/data/catalog.ts` |
| `M` | `src/data/food-images.test.ts` |
| `M` | `src/data/food-images.ts` |
| `M` | `src/engine/decide.test.ts` |
| `M` | `src/engine/decide.ts` |
| `M` | `src/engine/plan-week.test.ts` |
| `M` | `src/engine/plan-week.ts` |
| `M` | `src/engine/types.ts` |
| `M` | `src/lib/meal-prep-notification-scheduler.test.ts` |
| `M` | `src/lib/meal-prep-notification-scheduler.ts` |
| `M` | `src/lib/plan-week-days.ts` |
| `M` | `src/store/kitchen.test.ts` |
| `M` | `src/store/kitchen.ts` |
| `??` | `assets/meal-photos/grilled-cheese.jpg` |
| `??` | `assets/meal-photos/pbj.jpg` |
| `??` | `docs/09_FEEDBACK_ROADMAP.md` |
| `??` | `docs/reports/2026-10-12-feedback-execution.md` |
| `??` | `docs/reports/2026-10-12-release-file-inventory.md` |
| `??` | `docs/specs/2026-10-10-billing-worksheet.md` |
| `??` | `docs/specs/2026-10-10-nutrition-and-intake.md` |
| `??` | `docs/specs/2026-10-10-reminder-verification.md` |
| `??` | `src/components/ContinuousOnboardingPrompt.tsx` |
| `??` | `src/components/FoodGenreOptions.tsx` |
| `??` | `src/components/PantrySyncStatus.tsx` |
| `??` | `src/components/PhotoTastePicker.tsx` |
| `??` | `src/components/PlanReplacementPicker.tsx` |
| `??` | `src/components/ui/LoadingSkeleton.tsx` |
| `??` | `src/data/meal-image-credits.json` |
| `??` | `src/data/meal-image-sources.ts` |
| `??` | `src/lib/plan-week-days.test.ts` |
| `??` | `src/lib/selection-keyboard.ts` |
| `??` | `src/lib/use-reduced-motion.ts` |
| `??` | `src/lib/use-step-opacity.ts` |

## Preserved earlier work, requiring a separate inclusion decision

| Git state | Path |
|---|---|
| `M` | `.env.example` |
| `M` | `app/(onboarding)/staples.tsx` |
| `M` | `app/(tabs)/pantry.tsx` |
| `M` | `docs/00_PRODUCT_DIRECTION.md` |
| `M` | `docs/01_TECHNICAL_SPEC.md` |
| `M` | `docs/04_UIUX_SPEC.md` |
| `M` | `docs/plans/2026-09-04-ux-production-fix-prompts.md` |
| `M` | `docs/specs/2026-08-22-dual-meal-journeys-design.md` |
| `M` | `src/app-pantry-screen.test.ts` |
| `M` | `src/components/ui/BucketSection.test.ts` |
| `M` | `src/components/ui/BucketSection.tsx` |
| `M` | `src/components/ui/RecommendationSections.tsx` |
| `M` | `src/engine/cuisine-preference.ts` |
| `M` | `src/engine/onboarding-prompt.test.ts` |
| `M` | `src/engine/onboarding-prompt.ts` |
| `M` | `src/engine/plan-grocery-needs.test.ts` |
| `M` | `src/engine/plan-grocery-needs.ts` |
| `M` | `src/engine/score-recipe.ts` |
| `M` | `src/lib/auth/app-gate.test.ts` |
| `M` | `src/lib/auth/app-gate.ts` |
| `M` | `src/lib/auth/google.test.ts` |
| `M` | `src/lib/auth/google.ts` |
| `M` | `src/lib/auth/session-route.test.ts` |
| `M` | `src/lib/auth/session-route.ts` |
| `M` | `src/lib/auth/useAuthSession.ts` |
| `M` | `src/lib/cuisines.test.ts` |
| `M` | `src/lib/cuisines.ts` |
| `M` | `src/lib/format.ts` |
| `M` | `src/lib/ingredients/suggestions.ts` |
| `M` | `src/lib/queries/inventory.ts` |
| `M` | `src/lib/queries/preferences.ts` |
| `M` | `src/lib/webcam.test.ts` |
| `M` | `src/lib/webcam.ts` |
| `??` | `app/auth/callback.tsx` |
| `??` | `app/auth/reset-password.tsx` |
| `??` | `app/login.tsx` |
| `??` | `docs/specs/2026-09-26-pantry-sync-contract.md` |
| `??` | `src/lib/auth/callback.test.ts` |
| `??` | `src/lib/auth/callback.ts` |
| `??` | `src/lib/auth/email.test.ts` |
| `??` | `src/lib/auth/email.ts` |
| `??` | `src/lib/auth/guest-access.test.ts` |
| `??` | `src/lib/auth/guest-access.ts` |
| `??` | `src/lib/auth/redirect-uri.test.ts` |
| `??` | `src/lib/auth/redirect-uri.ts` |
| `??` | `src/lib/pantry-sync-api.test.ts` |
| `??` | `src/lib/pantry-sync-api.ts` |
| `??` | `src/lib/pantry-sync-live.ts` |
| `??` | `src/lib/pantry-sync.live.test.ts` |
| `??` | `src/lib/pantry-sync.test.ts` |
| `??` | `src/lib/pantry-sync.ts` |
| `??` | `src/lib/query-client.ts` |
| `??` | `supabase/tests/pantry_sync_verification.sql` |

## Exclude

- `DecisionEats/`: preexisting nested checkout, left untouched.
- `dist/`, `output/`, `.playwright-cli/`, local environment/credential files,
  local databases, browser state, and test-account fixtures: generated/private
  artifacts, not source for the release.

There are no dependency, migration, or workflow changes in this run. The existing
untracked pantry RLS test is earlier work, not a new migration. Do not infer
production delivery from this inventory or the successful local build.
