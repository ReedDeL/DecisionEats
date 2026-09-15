# DecisionEats Collaboration Blueprint

**Updated:** August 26, 2026  
**Release:** Version 1.0 ships when the product is ready.

## Purpose

A small founding team should not spend its time rediscovering decisions or
waiting for meetings. This system answers three questions:

1. What matters now?
2. Who owns it?
3. What proves it is done?

## Decision rights

| Area | Owner |
|---|---|
| Product direction, positioning, scope, and priority | CEO |
| Architecture, data model, security, and code quality | CTO |
| Work crossing product and architecture | Both founders |
| Assigned delivery work | Named owner |

Hard-constraint safety, privacy, recurring cost, and release readiness require
both founders.

Reversible decisions should move quickly. Record the choice and continue.
Irreversible decisions require explicit agreement.

## Source control

Use focused branches and reviewable pull requests.

A pull request states:

- what changed;
- why it matters to the user;
- what was verified;
- what remains.

Do not mix unrelated work. Review the final diff. Merge only after required
checks pass or an exception is documented.

## Project tracking

Use the existing Notion **Project Management** database. The **By Status** board
and **Feature Gantt** remain the shared planning views.

Statuses stay simple:

- Not started
- In progress
- Done

One item has one owner. “Done” means the agreed outcome is complete and
verified, not that work started.

Dates are planning signals, not a substitute for the release bar in
`00_PRODUCT_DIRECTION.md`.

## Current product priorities

1. Complete the Now decision tree.
2. Add progressive Show more recommendations.
3. Complete the Plan decision tree.
4. Produce accurate plan-linked **What to get** guidance.
5. Modernize the shared visual system.
6. Keep pantry scanning and correction trustworthy.
7. Enforce hard constraints and privacy.

Dedicated cook mode, hands-free cooking, barcode scanning, and general shopping
lists are not current priorities.

## Definition of Done

A product change is done when:

- behavior matches Product Direction and the relevant spec;
- the UI asks no more than one or two related decisions at a time;
- hard constraints remain enforced;
- responsive and accessibility behavior is verified;
- tests and static checks relevant to the change pass;
- the final diff contains only intentional work;
- Notion reflects the completed outcome when shared tracking is affected.

Documentation changes are done when conflicting current sources are updated or
clearly marked historical.

## Communication

Use asynchronous updates by default.

A useful update says:

- **What changed**
- **Why it matters**
- **Next step**

Write customer impact first. Keep code paths, diff statistics, and branch detail
out of non-technical status reports unless someone asks.

External Notion and Discord activity is handled through connected sessions.
Repository hooks, workflows, scripts, and environment entries must not post to
or edit those systems.

## Release readiness

There is no fixed MVP date.

Version 1.0 is ready when:

- Now works end to end;
- Plan works end to end;
- Show more preserves ranking and hard constraints;
- What to get accurately reflects the plan and pantry;
- pantry capture and correction are dependable;
- the UI is understandable, modern, responsive, and accessible;
- safety, privacy, and release checks pass.

Quality defines release readiness.
