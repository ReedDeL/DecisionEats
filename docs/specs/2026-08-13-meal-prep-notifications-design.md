> **Supporting future design.** Weekly planning is current MVP scope; notifications are optional follow-on work and do not define release readiness.

# DecisionEats Meal-Prep Notification Foundation Design

**Date:** 2026-08-13
**Status:** Approved for implementation

## Goal

Prepare DecisionEats to send local start-cooking reminders for future weekly meal-prep
plans. Users can enable or disable reminders and choose how much extra time they
want before cooking begins. One-off meal decisions never schedule a notification.

## Scope

This change provides the notification integration, settings controls, scheduling
logic, and tests. It deliberately does not create weekly meal-prep screens, plan
storage, recipe selection, or recurring-plan management. Those are a later
feature and are the sole caller of the scheduling boundary introduced here.

## Product rules

- Reminders apply only to entries in an active weekly meal-prep plan.
- A user may enable or disable meal-prep reminders in Settings.
- When enabled, Settings offers fixed extra-early lead times: `0`, `10`, `15`,
  `30`, or `60` minutes. `0` means notify at the time cooking needs to start.
- A reminder is scheduled at `plannedMealTime - max(recipe.totalTimeMinutes,
  selectedLeadMinutes)`. It can never be later than the recipe's required start
  time.
- A past or invalid planned meal time produces no notification.
- Disabling reminders, revoking permission, or replacing a plan removes the
  application's previously scheduled meal-prep notifications.
- Notifications are local and device-only. The preference is local app state;
  no database migration, server data, push token, or Edge Function is involved.

For example, a meal planned for 7:00 PM with a 30-minute cook time and a
10-minute selected lead time alerts at 6:30 PM. If the selected lead time is
60 minutes, it alerts at 6:00 PM.

## Architecture

`expo-notifications` supplies the native scheduling API and Expo configuration.
`src/lib/meal-prep-notifications.ts` is the only module that imports it. It owns
permission requests, Android channel setup, the local notification content, and
replacement of scheduled identifiers. A `.web` sibling exports the same API as
safe no-ops, because browser notifications are not part of this foundation.

The calculation itself lives in `src/lib/meal-prep-reminder.ts`, a dependency-free
module. It accepts a small future-plan contract and returns the start/reminder
times to schedule. Keeping that calculation separate makes it directly testable
and keeps Expo/native APIs out of policy logic. It does not belong in
`src/engine/`: the decision engine remains pure and only ranks recipes.

The future weekly meal-prep feature supplies an active plan through one boundary:

```ts
type MealPrepReminderEntry = {
  id: string;
  recipeId: string;
  recipeTitle: string;
  totalTimeMinutes: number;
  plannedMealTime: Date;
};

syncMealPrepReminders(entries: readonly MealPrepReminderEntry[]): Promise<void>;
```

The future feature calls that boundary after it persists a changed active plan;
it calls it with an empty array when the plan is removed or inactive. It never
calls it from Home, Results, or an individual recipe screen.

## Settings and permission flow

The existing Settings screen receives a **Meal-prep reminders** section:

- An accessible switch controls whether reminders are enabled.
- The lead-time preset choices appear only when enabled.
- Turning the switch on requests local-notification permission. If permission is
  granted, the enabled preference is saved. If it is denied, the switch returns
  to off, any scheduled DecisionEats reminders are cleared, and the user receives
  calm explanatory copy with a route to the operating system settings where the
  platform supports it.
- Turning the switch off immediately saves the preference and clears scheduled
  DecisionEats reminders.

The store holds `mealPrepRemindersEnabled` and `mealPrepReminderLeadMinutes` so
the preference survives app restarts. The default is off and `0` extra minutes.
Settings does not ask for typical meal times; weekly meal prep owns meal times
because notifications exist only for its concrete planned entries.

## Scheduling lifecycle

When `syncMealPrepReminders` runs with reminders enabled and permission granted:

1. Cancel the identifiers saved for the preceding sync.
2. Ignore entries whose computed reminder time is not in the future.
3. Schedule one local notification per remaining entry, recording each new
   identifier locally.

The notification title is **Time to start cooking**. Its body names the recipe
and the planned meal time; it does not include pantry, dietary, allergy, or
other sensitive data. Scheduling is best-effort: a single native scheduling
failure is contained, reported for development visibility, and does not block
the meal-prep flow. An Android notification channel is created before scheduling.

The first version schedules concrete future dates only. The weekly plan feature
must resync after plan edits and on app launch; no repeating OS trigger is used,
which avoids stale alerts after recipes, dates, or reminders change.

## Dependencies and platform configuration

- Add `expo-notifications` through Expo's version-compatible installer.
- Add its Expo config plugin and a clear Android notification icon/color only if
  required by the plugin's supported configuration.
- Native platforms receive local notifications. The web implementation no-ops
  without requesting browser permission.
- No third-party key, remote push credential, or public environment variable is
  added.

## Testing

Unit tests cover the pure reminder calculation:

1. Recipe duration wins when it exceeds the selected lead time.
2. The selected lead time wins when it exceeds recipe duration.
3. A reminder exactly at the recipe-required start time is valid.
4. Entries with non-positive duration, invalid dates, or elapsed reminder times
   are excluded.

The native module is tested through a narrow injected client boundary:

1. Disabled reminders neither request permission nor schedule work.
2. Enabling requests permission and keeps the preference off if denied.
3. A sync cancels identifiers from the preceding sync before scheduling current
   eligible entries.
4. An empty sync clears existing identifiers.
5. Notification contents contain the recipe title and no sensitive fields.

Settings tests cover persisted defaults, enabling/disabling behavior, and all
five lead-time presets. Run the relevant Vitest files, then `npm run check`.

## Out of scope

- Weekly meal-prep user interface and persistence
- Typical meal-time collection
- One-off recipe or Home/Results reminders
- Remote push notifications, push tokens, backend scheduling, or Edge Functions
- Notifications for shopping, pantry changes, expiry, macros, or roommates
