> **Supporting layout design.** Responsive workspace rules remain useful. Cook-mode references are superseded by the current recipe-page direction in `../04_UIUX_SPEC.md`.

# DecisionEats Responsive Web Layout Design

**Date:** August 12, 2026  
**Status:** Implemented — `src/components/ui/responsive-layout.ts`, consumed by
`MobileViewport` and `Screen`. **Supersedes UI/UX Spec §13.1.**  
**Scope:** Responsive web presentation for the existing DecisionEats app

## Goal

Improve the current web UI so DecisionEats feels intentional and usable on both a
desktop browser and a phone-sized viewport. Preserve the existing product
flow, decision-first UX, and feature set while allowing desktop layouts to use
available width instead of letterboxing the entire app at 430px.

## Design direction

DecisionEats uses a warm, focused “kitchen workspace” presentation. On desktop,
the app sits in a centered workspace with generous gutters, a quiet page
canvas, and responsive multi-column content. On mobile, the workspace collapses
to an edge-to-edge single-column flow optimized for thumb reach and vertical
scanning.

The existing warm palette, system typography, spacing scale, touch targets, and
accessibility rules remain the source of truth. Responsive changes should use
new layout tokens rather than scattered magic numbers.

## Shared UX contract

Desktop and mobile share the same:

- routes and navigation actions;
- store state and decision-engine inputs/outputs;
- time selection and recommendation behavior;
- pantry, recipe, scan, settings, loading, and error functionality;
- accessibility names, hints, roles, and minimum touch targets;
- color, typography, card, chip, and button primitives.

Presentation may differ when the available space changes the most usable
arrangement, but there must be no desktop-only or mobile-only product behavior.

## Responsive presentation

### App shell

Replace the current web-only 430px letterbox with a responsive shell:

- mobile: full-width content with 16–24px horizontal padding;
- desktop: full-browser canvas with a fluid centered workspace capped at
  1600px, keeping readable content widths and responsive gutters;
- tablet widths: fluid interpolation between the mobile and desktop states;
- native platforms: preserve the existing native behavior and safe-area handling.

### Home

Mobile keeps the focused time-first question, three time tiles, optional
cuisine row, primary CTA, and pantry link in one column. Desktop places the
primary decision surface beside a quiet pantry/context surface while preserving
the same actions. Results should use a responsive recipe grid rather than
stretching cards across one wide row.

### Results

Preserve the current relaxation behavior and bucket ordering. On desktop,
recipe cards can render in a 2-up grid and supporting banners can span the
available content width. On mobile, cards remain stacked and easy to scan.

### Pantry

Mobile keeps the current vertically ordered pantry and search flow. Desktop
uses separate content regions for owned ingredients and adding/searching for
ingredients, with the same chip actions and scan entry point.

### Recipe

Mobile remains a vertical reading flow. Desktop uses a split layout: image and
recipe summary on one side, ingredients and steps on the other, with the same
missing-ingredient correction and start-cooking actions.

### Onboarding and cook mode

These remain focused layouts on every viewport. Onboarding should gain only
comfortable desktop spacing and a bounded reading width; cook mode should keep
large step text and controls rather than becoming a dense multi-column view.

## Implementation boundaries

Use shared screen-level behavior and separate layout wrappers or presentation
components only where desktop and mobile composition genuinely differs. Avoid
duplicating engine/store logic. Keep layout decisions in responsive shell and
screen styles so existing component semantics remain stable.

If a component needs desktop-specific structure, expose a shared data/action
interface and render mobile/desktop branches from that interface. Do not fork
business rules or route behavior.

## Verification criteria

- Web shell no longer letterboxes the complete app to 430px on wide screens.
- Mobile remains usable at phone widths without horizontal overflow.
- Desktop uses multi-column layouts where specified without overly wide text
  blocks or stretched controls.
- Desktop and mobile expose equivalent functionality and navigation.
- Keyboard focus is visible for web interactions and reduced motion remains
  respected.
- `npm test`, `npm run typecheck`, and `npm run lint` pass.
- Existing unrelated working-tree changes are preserved.

