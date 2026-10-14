# DE-13: Reminder verification record

Local scheduler checks cover enabled/disabled permission handling, future-only
delivery times, max(recipe cooking time, selected lead time), cancellation, and
partial scheduling failure. The failure regression was first reproduced: an OS
schedule rejection previously resolved the scheduler promise as success. The fix
retains successful IDs for cleanup and rejects the incomplete sync; the Reminders
screen now offers retry. Weekly swaps preserve the target meal time, change only
the selected slot, and trigger the existing confirmed-plan reminder synchronization.

Browser review also found that a new three-day plan created on Saturday started
on the preceding Monday. New plans now start today if the first selected meal
time is still ahead, otherwise tomorrow. Tests under `TZ=America/New_York` cover
the exact slot boundary, consecutive local days, and DST offsets. Existing plan
dates are preserved; filling a “Decide that day” slot derives its default meal
time from that exact slot date rather than moving it with a new-plan calculation.

Physical-device delivery is not verified by these tests. Keep DE-13 open until the
following evidence exists for each supported native platform:

| Scenario | Required device evidence | Status |
|---|---|---|
| Foreground/background/locked delivery | Device/OS/build, meal time, lead time, observed delivery | Pending |
| Permission denied/revoked/restored | No false success; recovery from device Settings | Pending |
| Single swap and rapid repeated swaps | Old IDs canceled, one notification per concrete slot | Pending |
| Cancel plan / disable reminders | No later notifications from removed plan | Pending |
| DST, timezone travel, local-day boundary | Declared time semantics and actual trigger timestamp | Pending |
| Partial OS rejection and retry | Clear status, successful IDs cleaned up, no duplicates | Pending |

Existing plans store an offset-bearing instant. Changing device timezone does not
currently reinterpret an old plan as a new local wall-clock time. Confirm that
product behavior on a device; redesign wall-clock travel behavior separately if
required. Inspect app-resume permission changes as part of the same matrix.

## Separate web-delivery design task

Web is explicitly unsupported by `meal-prep-notifications.web.ts`; no browser
reminders were added. Before implementation, decide whether delivery must work with
the tab and browser closed. If yes, design opt-in push/service-worker delivery,
server scheduling, subscription ownership, timezone semantics, plan cancellation,
deduplication, permission recovery, and retention. If no, label in-tab reminders
as such and explain their lifecycle. Keep this separate from native verification.
