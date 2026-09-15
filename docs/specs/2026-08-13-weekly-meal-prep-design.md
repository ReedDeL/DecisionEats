# DecisionEats Weekly Meal Prep Specification

**Updated:** August 26, 2026  
**Status:** Current MVP journey

## Goal

Help a busy user plan meals for several days without making them build a
calendar or browse a catalog.

The weekly journey is the reverse of the Now journey:

- Now asks what the pantry can make.
- Plan proposes meals, then shows what the pantry is missing.

## Decision tree

Each step asks one question.

### 1. Days

Ask how many days DecisionEats should plan. Use a small set of common choices.

### 2. Preparation style

Ask whether the week should be:

- mostly quick meals;
- batch prep;
- a mix.

### 3. Variety

Ask whether the user wants variety or comfortable repeats.

Existing equipment, allergens, dietary needs, pantry contents, and learned
preferences apply automatically. Do not ask for them again.

Optional advanced preferences belong behind progressive disclosure. They must
not turn the first flow into a planning form.

## Proposal

DecisionEats generates one recommended plan.

The plan should:

- cover the selected number of days;
- respect every hard constraint;
- reuse ingredients where practical;
- reduce waste;
- fit the selected preparation style;
- state any relaxed time or cuisine preference;
- use a labeled day-of-decision fallback when no safe recipe fits.

The user reviews the proposal and may replace one meal at a time. There is no
empty calendar and no recipe-browser-first flow.

## What to get

After confirmation, derive the ingredients needed beyond the pantry.

Use the heading **What to get**.

The output:

- belongs only to the current plan;
- excludes ingredients already confirmed in the pantry;
- groups repeated needs;
- explains which meals use each ingredient;
- stays small enough to review;
- requires confirmation before changing pantry state.

This is plan-linked ingredient guidance, not a general shopping-list feature.
It does not add checkouts, store aisles, barcode scanning, retailer accounts, or
a reusable list.

## Ingredient recommendations

DecisionEats may learn from explicit recipe selections and confirmed weekly plans.

Future suggestions may consider:

- ingredients repeatedly needed by selected meals;
- ingredients that work across several planned recipes;
- pantry staples the user regularly confirms;
- choices the user replaces or rejects.

Recommendations remain suggestions. They do not become pantry facts and do not
affect a plan without user approval.

## Planner contract

The planner remains pure and deterministic. It receives:

- the bundled recipe catalog;
- the confirmed pantry;
- user restrictions and equipment;
- the answers from the weekly decision tree;
- explicit preference signals;
- the week start.

It returns:

- one draft plan;
- dated entries;
- stated relaxations;
- plan-linked ingredient gaps;
- a safe fallback for any unfilled day.

Borrowed live-recipe content cannot be persisted in a weekly plan. Hard
constraints are never relaxed.

## Navigation

Plan is a primary destination beside Now and Pantry.

The flow should show progress without presenting every question at once. Leaving
and returning should preserve the draft.

## Accessibility

- Every step has a clear heading and one primary action.
- Choice controls expose selected state.
- Plan entries announce date, meal, time, and pantry fit together.
- Ingredient gaps identify the meals that use them.
- Layouts support keyboard navigation, screen readers, reduced motion, and 200%
  text scaling.

## Success

The journey succeeds when a user can answer a few questions, understand one
proposed week, and identify what to get without feeling that they planned the
week manually.
