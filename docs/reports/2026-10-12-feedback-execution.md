# DE-03–DE-16 execution and release evidence

Updated October 13, 2026. Local implementation and acceptance evidence only.
No commit, push, production deployment, migration, payment, or external status
update was performed by this run. The worktree already contained changes to
roughly 50 tracked files, plus untracked auth, sync, test, and documentation work.
The nested `DecisionEats/` checkout was left untouched.

This record updates the same items in the [feedback roadmap](../09_FEEDBACK_ROADMAP.md).
It does not establish that the hosted product includes these changes.

## Outcomes

| Item | Local result | Remaining acceptance |
|---|---|---|
| DE-03 | Retained empty-by-default pantry implementation. Fresh guest started with zero ingredients; back navigation retained explicit selections. Existing store tests cover migration and confirmed scans. | Real capture/provider scan acceptance remains separate. |
| DE-04 | Retained per-meal missing names and aggregate draft preview. Browser inspection left saved plan, pantry, and grocery checks unchanged. | Hosted regression check. |
| DE-05 | Added a focused replacement picker, explicit selection/confirmation, current-constraint revalidation, cancel/no-safe states, and grocery recomputation. Browser draft and confirmed swaps changed exactly one slot while preserving its date/time and other entries. | Physical reminder rescheduling; hosted regression check. Nonempty grocery-check preservation was not verified or promised. |
| DE-06 | Audited the bundled catalog through the shared matcher. Now and Plan use one option component; Plan's cuisine is independent of Now. Added no unsupported styles. | Chinese/Japanese/Korean remain available with explained soft fallback; their strict catalog match counts are zero. |
| DE-07 | Retained session-only skips, persistent exclusions, individual restore, and undo. Corrected an obsolete card-label test. Browser reload cleared a skip and retained a permanent exclusion; individual restore and immediate undo worked. | Hosted regression check. |
| DE-08 | Added two reviewed, licensed, accurately mapped meal photos, credits, and a handwritten registry separate from generated ingredient sources. Unmapped meals retain neutral/text fallback. | Most of the catalog has no reviewed meal photo. |
| DE-09 | Added optional positive photo selections for Now and editable/clearable Settings controls. Photo choices only break score ties inside existing readiness buckets. Added separate weekly cuisine preference. | Broader reviewed photo coverage. |
| DE-10 | Retained Flip camera implementation and stale-stream protection. Browser no-camera state offered photo selection and Cancel without changing the pantry. | Real front/rear hardware, denial, rapid switching, close/reopen, and native system picker. |
| DE-11 | Added shared static skeletons for actual async waits and restrained step opacity transitions; respected reduced motion and removed an artificial planning wait. Fixed photo bounds, startup deep-link loss, and Space activation for selection controls after browser review. | Real screen-reader and 200% text acceptance; hosted/browser matrix. |
| DE-12 | Retained the continuous-onboarding shell and integrated the photo prompt. Browser observed neutral skip, one prompt per session, explicit-save persistence, later editing, body-unit conversion, and local deletion. | Real-device acceptance. Body metrics remain local. |
| DE-13 | Reproduced and fixed swallowed partial scheduling failure, surfaced retry, and corrected new plans starting in the past. Added local-day/DST and existing-slot-date checks. | Physical delivery/permission/timezone matrix; web remains unsupported. |
| DE-14 | Audited nutrition and wrote separate display/intake contracts, serving semantics, and unknown-value rules. | Data acceptance and later implementation; no calorie log or daily total was added. |
| DE-15 | Prepared a marketing tier/entitlement worksheet and test-mode architecture. | Marketing-approved tiers, prices, limits, and platform scope. No Stripe integration or charges. |
| DE-16 | Inspected intended changes, CI requirements, migrations, live policy metadata, configuration code, and release evidence. | Complete release gates, isolated commit/PR, exact-commit CI, production configuration, deployment, and live smoke tests. |

## Catalog and asset evidence

The October 12 adapter audit loaded 2,278 recipes. Counts use the existing cuisine
matcher, can overlap, and do not prove complete catalog coverage:

| Style | Matches |
|---|---:|
| American | 22 |
| British | 3 |
| Chinese | 0 |
| Japanese | 0 |
| Korean | 0 |
| Hispanic/Latin | 1 |
| African | 4 |
| Indian | 4 |
| Mediterranean | 3 |
| European | 7 |
| Southeast Asian, proposed | 0 |
| Middle Eastern, proposed | 0 |

Neither proposed style met the existing three-distinct-meal admission boundary.
Preserved the explicitly requested Chinese/Japanese/Korean options and soft
fallback explanations. Allergens, dietary needs, and equipment remain strict.

No recipe has non-null `energyKcalPerServing`: 2,067 are low confidence with partial
provenance and 211 are unavailable. See the
[nutrition and intake contract](../specs/2026-10-10-nutrition-and-intake.md).

The two photos are representative servings, not photographs of cooking these exact
instructions. Exact recipe mappings, author, license, source, modifications, review,
and content hashes are recorded in `src/data/meal-image-credits.json`:

- Peanut butter and jelly: Evan-Amos, public domain,
  [Wikimedia Commons source](https://commons.wikimedia.org/wiki/File:Peanut-Butter-Jelly-Sandwich.jpg).
- Grilled cheese: Willis Lam, CC BY-SA 2.0,
  [Wikimedia Commons source](https://commons.wikimedia.org/wiki/File:Classic_Grilled_Cheese_Sandwich_(25791331763).jpg).

These are real meal photos; ingredient references are separate. The catalog's
Python generator test verified that rebuilding ingredient sources does not drop
the meal registry.

## Browser evidence

Local static export at `http://127.0.0.1:8091`, Playwright Firefox, October 10 and 12.
All actions used a disposable local guest kitchen. No auth provider round trip,
camera upload, hosted sync, native device, or actual Safari run is implied.

- Empty pantry, selection/back navigation, proposal gaps, cancel, draft replacement,
  confirmation, and confirmed-plan replacement were exercised.
- Photo selection Save/Skip, reload, Settings edit/clear, and peanut restriction
  filtering were exercised. Skipping stored no positive or negative preference.
- Goal/body controls converted 80 kg to 176.4 lb and 180 cm to 5 ft 10.9 in;
  clearing removed both measurements.
- Actual light and dark themes were inspected at 390 × 844 with reduced-motion
  media enabled. Photo containers matched image bounds and the page did not
  overflow horizontally. Screenshots are local ignored artifacts at
  `output/playwright/feedback-photo-light.png` and `feedback-photo-dark.png`.
- Browser reported zero console errors and one recurring bundle warning.
- Final keyboard checks verified photo checkbox state and Save enablement, neutral
  cancel, pantry Space/Enter activation, no repeated toggles while holding Space,
  and Space selection of a focused plan card. Pantry returned to its initial empty state.
- A fresh three-day lunch/dinner proposal created after the day's meals started
  on October 13 and ended October 15; it did not create past slots.
- Settings and Scan initially lost their destination on reload. The app now waits
  for storage/auth before mounting the protected navigator. Final browser checks
  preserved both URLs on direct navigation and reload. An independent empty
  browser context still reached login, then required equipment setup after guest
  choice; private Settings controls were absent. Intentional account entry and
  the public cancellation callback remained accessible, with no page errors.

The startup failure matches the navigator's documented removal of unavailable
routes from history; see [Expo protected routes](https://docs.expo.dev/router/advanced/protected/).
The fix changes startup presentation, not server authorization or account ownership.

## Validation

The final October 12 `npm run check` passed: ESLint, TypeScript, Prettier, Supabase
structural checks, and **961 tests passed, one skipped** across 78 passing test
files and one skipped file. The skipped test needs a disposable two-account live
pantry fixture. The final `npm run web:build` exported `dist/` successfully.
The exact-slot date fix also passed 57 focused tests under `TZ=America/New_York`.

Additional October 12 checks passed: catalog boundary self-test, Python Ruff
format/lint, strict mypy (35 source files), and 321 Python tests. A current-tree
scan found no tracked actual environment files or matches for the CI secret-key
patterns. This is not a complete secret-history audit.

October 13 continuation: the previously interrupted final command completed.
`git diff --check`, formatting of the final routing/keyboard files, and the
non-disclosing current-tree secret-pattern check passed. The changed-file inventory
was unchanged; no implementation edits were made during this final continuation.

The complete local SQL release suite could not run: WSL has no available Docker
integration, the Windows Docker daemon pipe is absent, and an attempt to start
the installed Docker Desktop exited with code 1. No local database reset or hosted
substitute write was attempted. The disposable live-sync fixture and physical
devices are also unavailable. These are unresolved gates, not passing checks.

## Release inventory and boundaries

Task changes are concentrated in the planning engine/screen and replacement
picker, shared cuisine/photo controls, reviewed meal assets and credits, kitchen
photo preferences, Now tie-breaking, loading/motion helpers, reminder scheduling,
date helpers, regression tests, and these evidence/design documents. Some touched
files also contain preexisting changes. Auth, pantry-sync, camera, preference,
and continuous-onboarding work was already present and was preserved.
The final review also changed startup loading in the existing root gate to retain
authorized deep links, and added shared web Space-key handling to selection controls.

No dependency, workflow, or migration was added by this run. Exclude `dist/`,
`output/`, `.playwright-cli/`, local environment values, and the nested checkout
from a release commit. Do not stage the entire mixed worktree indiscriminately.

See the [file inventory](2026-10-12-release-file-inventory.md) for exact paths and
the boundary between files touched in this run and preserved earlier work.

Release gates still include:

1. Inventory and isolate the intended mixed diff before committing. No open PR was
   found for this branch. The observed successful CI runs cover `84ce747`, not this
   uncommitted work. GitHub's default branch is `master`; verify the existing Pages
   production branch and merge controls before using the older release guide.
   The GitHub deployments API returned no deployment records on October 12, so it
   could not verify Cloudflare's configured production branch or current deployed SHA.
2. Run the complete local database suite and independent-client pantry fixture.
   Hosted migration metadata matches all nine checked-in migrations, and the
   project reports healthy. Read-only policy inspection shows membership checks
   for inventory actions. Metadata inspection is not behavioral RLS or two-user
   isolation proof. No hosted data was changed.
3. Verify hosted auth callback/reset allowlists, provider round trips, runtime
   configuration, and the final production origin. Current callback code uses the
   initiating origin. Secret values were not printed; server credentials must stay
   server-side. No production configuration was changed.
4. Complete real-device camera, reminder, Safari, and accessibility acceptance.
   See the [reminder verification record](../specs/2026-10-10-reminder-verification.md).
5. Resolve marketing inputs before billing implementation; see the
   [billing worksheet](../specs/2026-10-10-billing-worksheet.md).
6. Only after the intended release passes its gates, use the verified production
   process, then record the deployed commit, result, origin, and focused live smoke
   tests. A build, push, or historic CI success alone is insufficient.

No destructive migration is proposed. The complete release is not ready for a
production-readiness claim.
