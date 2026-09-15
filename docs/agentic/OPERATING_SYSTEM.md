# DecisionEats Operating System

This file is the canonical operating guide for work in this repository.

## Decision order

When sources conflict, follow them in this order:

1. `docs/00_PRODUCT_DIRECTION.md`
2. the relevant current specification in `docs/`
3. an approved implementation plan
4. historical plans and reports

Historical documents describe earlier work. They do not override current
product direction.

## Product boundary

DecisionEats reduces food decision fatigue through two guided journeys:

- decide what to make now;
- plan a practical week and identify ingredient gaps.

Each screen should ask for one decision, or two closely related decisions.
Allergens, dietary needs, and equipment are hard constraints.

## Working agreement

Before substantial work:

1. read `docs/00_PRODUCT_DIRECTION.md`;
2. read the relevant specification;
3. inspect the existing diff;
4. keep the change focused;
5. run the relevant checks;
6. review the final diff before handoff.

Preserve unrelated work. Do not add dependencies, alter the data model, rotate
secrets, or contact external services without explicit approval.

## External systems

Do not add or restore repository hooks, workflows, scripts, or environment
entries that post to or edit external communication or project-management
systems. Notion, Discord, and similar sessions are managed outside this
repository.

## Delivery

When asked to commit, finish, ship, or save an implementation:

- stage only task-specific files;
- use one intentional local commit when working locally;
- do not push or open a pull request unless explicitly asked;
- run checks appropriate to the files changed.
