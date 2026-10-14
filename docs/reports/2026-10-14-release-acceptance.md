# Feedback release acceptance candidate

## Candidate and scope

Prepared on October 14, 2026 from `origin/master` at `091e524` in the isolated
`codex/feedback-acceptance` branch. The original mixed checkout and nested checkout
are preserved. Master already contains DE-02 pantry sync, DE-03 empty pantries,
and DE-04 ingredient previews; their implementations and the pantry SQL CI step
are retained. The September pantry contract's corrected historical wording is
also retained.

The remaining candidate includes the existing login/guest/callback work needed
by these flows, manual meal replacement, shared food styles, editable persistent
dislikes and session skips, two reviewed meal photos, optional photo preferences,
camera switching, loading/reduced motion, continuous onboarding, and reminder
error/date fixes. Nutrition and billing remain specifications. No paid tier,
checkout, production charge, new dependency, database migration, or external
communication automation is introduced.

Native compilation exposed an existing lockfile incompatibility: Reanimated
4.6.0 / Worklets 0.12.1 do not satisfy Expo Modules Core 57.0.10. The candidate
pins these existing transitive packages to Reanimated 4.5.1 / Worklets 0.10.1,
the pair in this Expo release's `bundledNativeModules.json`. This agrees with the
[Expo SDK 57 release notes](https://expo.dev/changelog/sdk-57).

## Evidence before opening the draft PR

- Full candidate `npm run check`: 961 passed, one opt-in live test skipped;
  lint, TypeScript, formatting, and Supabase structural checks passed.
- Candidate `npm run web:build`: static export succeeded.
- Separate opt-in live pantry test passed twice against the hosted database with
  two disposable accounts and three independently authenticated clients. It
  checked same-account add/delete, retries, cross-user read/write rejection,
  account switching, and sign-out clearing. Two initial runs failed during
  household resolution before instrumentation; no application change was needed
  for the subsequent passes. Do not infer their cause from those passes.
- Browser email/password sign-in reached required kitchen setup and an empty
  pantry. Three independent Firefox contexts then proved same-account rice
  addition/deletion and a separate account's empty pantry, with zero page errors.
  Prior guest browser evidence is in the October 12 record.
- `git diff --check` passed. No actual environment file, generated build,
  credential fixture, node_modules symlink, or nested checkout is included.
- Android native prebuild completed in a separate generated directory. Initial
  compilation found the dependency mismatch above and an unavailable PostHog CLI.
  The rebuilt test APK uses the corrected packages and excludes only the optional
  PostHog source-map upload task; no source maps are uploaded by this test build.
  Compilation is still in progress at this checkpoint.

## Gates still open at this checkpoint

The PR is a review and preview candidate, not approval to merge or a claim that
production is ready. Check the PR's current CI/deployment results for later
evidence; the historical CI on master does not cover this candidate.

1. Candidate CI, including all rollback SQL suites and catalog concurrency.
   Local Docker fails during startup on its `dockerInference` socket. No factory
   reset or Docker data deletion was attempted.
2. Hosted preview browser smoke checks, auth callback/reset origins and provider
   round trips. The local Supabase CLI token is expired; the connected database
   integration remains available.
3. Physical Android and iPhone/iPad camera and real Safari checks, native
   notification delivery/permissions/timezone/cancellation, and assistive
   technology review. The user confirmed these devices will be available later.
   Follow the [reminder matrix](../specs/2026-10-10-reminder-verification.md).
4. Marketing's approved billing details or explicit agreement to exclude billing
   from this release. The [worksheet](../specs/2026-10-10-billing-worksheet.md)
   intentionally contains no invented prices.
5. Only after applicable gates pass: merge using the repository's PR process,
   verify the exact deployed commit and production result, then run live smoke
   checks. No production merge or deployment was performed at this checkpoint.

GitHub's default branch is `master`. The branch-protection endpoint currently
reports no branch protection and the rulesets list is empty. This does not remove
the project's requirement to wait for passing checks and complete acceptance.

## Device evidence to collect later

Record device model, OS version, candidate commit/build, time, and result for each
row. A browser emulation or APK build alone cannot close a hardware row.

| Surface | Check |
|---|---|
| Android Chrome and iPhone/iPad Safari | Rear camera preference; Flip; rapid switching; denied permission; capture, review, cancel; stream release after leaving |
| Android native and iOS native | System camera/photo picker, capture and review; cancellation preserves pantry |
| Android native and iOS native | Reminder foreground/background/locked delivery; denial and recovery; lead time; swaps; disabling/canceling; timezone change |
| Real Safari | Login/guest, empty pantry, plan preview and one-slot replacement, photo save/skip, reload and back navigation |
| TalkBack/VoiceOver | Read labels and state, logical focus order, activate selections, dismiss dialogs, reach footer actions with enlarged text |

Use disposable test kitchens. Do not enter personal body measurements or upload
private household photos for acceptance. Browser reminders remain unsupported.
