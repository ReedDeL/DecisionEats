> **Historical analytics design.** Cook-mode milestones are legacy. Current events should describe the Now, Plan, Pantry, Show more, recipe, and What to get journeys.

# DecisionEats PostHog Analytics Integration Design

**Date:** 2026-08-12
**Status:** Approved for implementation

## Goal

Integrate PostHog into the Expo Router app so analytics initializes at app launch, every route view is recorded, and the product's core onboarding, pantry, recipe, cooking, feedback, and settings milestones are tracked through a stable helper API.

## Approach

Use the official `posthog-react-native` SDK with a `PostHogProvider` at the root of `app/_layout.tsx`. A small `src/lib/analytics` module owns the SDK-facing calls and event contract. A route observer in the root layout calls the helper for each route change.

This keeps screen components independent of the analytics vendor and prevents event names or property shapes from being reimplemented inconsistently. The same SDK/provider works across the app's iOS, Android, and web targets.

## Components and responsibilities

### SDK configuration

- Add `posthog-react-native` and its Expo-supported peer dependencies using Expo's installer.
- Add the `posthog-react-native/expo` config plugin to `app.json`.
- Add `EXPO_PUBLIC_POSTHOG_API_KEY` and `EXPO_PUBLIC_POSTHOG_HOST` to `.env.example`.
- Initialize the provider from those variables in the root layout.
- Leave analytics enabled in development when configured so the integration can be verified; an unset key must disable tracking without breaking startup.
- Do not enable session replay, error tracking, or user identification in this change.

### Analytics helper module

`src/lib/analytics.ts` will expose named helpers for page views and the approved product events. The helpers accept typed event-specific properties, call PostHog when the provider/client is available, and otherwise no-op safely. Screens use helpers rather than importing PostHog directly.

The helper surface will include:

- `trackPageView(route)`
- `trackOnboardingCompleted(properties)`
- `trackPantryScanStarted(properties)`
- `trackPantryScanCompleted(properties)`
- `trackPantryScanFailed(properties)`
- `trackPantryItemAdded(properties)`
- `trackPantryItemRemoved(properties)`
- `trackRecipeViewed(properties)`
- `trackRecipeDisliked(properties)`
- `trackCookModeStarted(properties)`
- `trackCookModeCompleted(properties)`
- `trackRecipeFeedbackSubmitted(properties)`
- `trackSettingsUpdated(properties)`

The module will expose a testable client boundary so unit tests can verify event names and properties without requiring native PostHog modules.

### Navigation observer

The root layout will observe Expo Router segments and emit one page-view event after the active route changes. The route will be normalized from segments so route groups such as `(onboarding)` do not leak as implementation-only route names. Dynamic recipe/cook IDs may be included as a route parameter only through non-sensitive identifiers.

The observer will avoid duplicate emissions for the same normalized route during re-renders.

## Event contract

All events use snake_case names. Properties contain IDs, enum values, counts, and operational outcomes only. No image bytes, image URIs, raw ingredient photos, email addresses, or other personal information are sent.

| Event | Required properties |
| --- | --- |
| `page_view` | `route` |
| `onboarding_completed` | `pantry_count`, `equipment_tier`, `allergen_count`, `dietary_restriction_count` |
| `pantry_scan_started` | `source` (`camera` or `library`) |
| `pantry_scan_completed` | `photo_count`, `candidate_count`, `accepted_count` |
| `pantry_scan_failed` | `photo_count`, `failure_stage` |
| `pantry_item_added` | `source`, `item_count` |
| `pantry_item_removed` | `source`, `item_count` |
| `recipe_viewed` | `recipe_id`, `source` |
| `recipe_disliked` | `recipe_id` |
| `cook_mode_started` | `recipe_id`, `step_count` |
| `cook_mode_completed` | `recipe_id`, `liked`, `removed_ingredients` |
| `recipe_feedback_submitted` | `recipe_id`, `liked` |
| `settings_updated` | `setting`, `value` |

The implementation may add bounded contextual properties where the existing screen already has them, but it will not add free-form user content or sensitive data.

## Data flow

```text
app launch
  -> PostHogProvider reads public project config
  -> root route observer sees active segments
  -> trackPageView(normalizedRoute)

screen interaction
  -> typed analytics helper
  -> PostHog client capture(event, properties)
```

PostHog delivery is asynchronous and must never block navigation, pantry updates, recipe rendering, or cooking flows. A missing configuration or SDK failure is contained inside the analytics boundary.

## Testing

Tests will cover:

1. Each helper maps to the correct PostHog event name and forwards the expected properties.
2. Helpers safely no-op when analytics is not configured.
3. Route normalization produces stable route names for grouped and dynamic routes.
4. Repeated renders of the same route do not emit duplicate page views.

Existing project lint, typecheck, unit tests, and formatting checks remain required. Native build verification may be limited by the local environment; the final report will distinguish checks that ran from platform builds that were unavailable.

## Out of scope

- Session replay
- Error tracking and source-map upload
- User identity, auth correlation, or profile enrichment
- PostHog feature flags, experiments, surveys, or dashboards
- Consent-management UI
- Replacing existing product behavior or adding analytics to backend Edge Functions
