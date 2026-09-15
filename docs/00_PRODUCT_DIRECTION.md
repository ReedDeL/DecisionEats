# DecisionEats Product Direction

**Owner:** Founding team  
**Decision date:** August 26, 2026  
**Status:** Current product direction

DecisionEats reduces decision fatigue around food. The first question is still
“What should I make right now?”, but the wider job is to help busy people make
fewer food decisions across both today and the week ahead.

This document supersedes fixed-date MVP language, cook-mode requirements, and
older weekly-planning boundaries when they conflict.

## Product principle

DecisionEats is a guided decision tree, not a search page.

Each screen asks for one decision, or two closely related decisions. The user
should never need to build a complex query in their head. We use what DecisionEats
already knows—pantry, equipment, allergens, dietary needs, and prior choices—to
remove questions instead of adding them.

Hard constraints remain absolute. Allergens, dietary needs, and equipment are
never relaxed.

## Two product journeys

### Make something now

This journey turns the current pantry into an immediate meal decision.

1. Ask how much time the user has.
2. Ask one optional preference, such as cuisine or meal mood.
3. Show a small first set of strong matches.
4. Let the user open a recipe or choose **Show more matches**.

The first result set stays intentionally small. “Show more matches” is
progressive disclosure: it demonstrates catalog breadth and ingredient
recognition without making the first screen exhausting.

Results explain why they fit in plain language:

- ready with what you have;
- missing a few ingredients;
- a larger pantry gap.

A recipe page includes the image, time, equipment, ingredients, and
instructions. Dedicated cook mode and hands-free cooking are not part of the
current product.

### Plan my week

This journey reverses the same engine. Instead of asking what the pantry can
make now, it proposes a week and then identifies the ingredient gaps.

The decision tree asks only a few questions:

1. How many days should DecisionEats plan?
2. Which meals should be planned: breakfast, lunch, dinner, or a combination?
3. Is the week mostly quick meals, batch prep, or a mix?
4. Does the user want variety or comfortable repeats?
5. Confirm the proposed week.

Selecting a preference changes the answer; **Next** advances to the next question.
The final preference step uses **Build my plan**. Plans group meals by date and
label every meal slot. Existing single-meal plans retain their meals as dinner.

Existing equipment, allergens, dietary needs, pantry contents, and learned
preferences apply automatically.

DecisionEats produces one recommended weekly plan, not a calendar full of choices.
The user may replace one meal at a time. After confirmation, DecisionEats shows
**What to get**: the ingredients needed beyond the pantry.

“What to get” is plan-linked guidance, not a general shopping-list product. It
does not introduce a reusable checklist, store workflow, or barcode scanner.

## Recommendation behavior

- Lead with a few strong recommendations.
- Keep **Show more matches** available below the first set.
- Never weaken hard constraints.
- State any relaxation of time or cuisine.
- Never end on an unexplained empty screen.
- Treat pantry corrections as normal product behavior.
- Learn from selections without making hidden pantry changes.

Future ingredient recommendations may use recipe selections and weekly-plan
choices to predict likely needs. Suggestions require user confirmation before
they affect the pantry or a plan.

## Navigation

The primary destinations are:

- **Now** — decide what to make from the current pantry.
- **Plan** — build one practical weekly meal plan.
- **Pantry** — scan, review, add, and correct ingredients.

Settings remains secondary. Reminders is also a secondary destination, reachable from
Settings and a confirmed weekly plan; it never becomes a primary tab.

## Visual direction

The interface should feel current, confident, and food-first. Cal AI and other
modern food apps are useful quality references, not layouts to copy.

Use:

- strong food photography;
- bold, clean type;
- generous spacing;
- large rounded controls;
- restrained surfaces and shadows;
- short conversational copy;
- clear progress through each decision tree;
- purposeful motion that never slows the decision.

DecisionEats keeps its own warm palette and accessibility standards. The visual
design should communicate momentum: one question, one answer, one next step.

## Release policy

The MVP no longer has a fixed calendar date. Version 1.0 ships when the core
journeys are complete, tested, understandable, and trustworthy.

The release bar is:

- the Now decision tree works end to end;
- the Plan decision tree produces a useful week and accurate ingredient gaps;
- pantry scanning and manual correction are dependable;
- hard constraints are enforced;
- the first result set stays focused and Show more works;
- the responsive UI meets accessibility and quality expectations.

Dates may guide planning, but quality defines release readiness.

## Scope

### Current scope

- pantry photo recognition and confirmation;
- manual pantry correction;
- Now recommendations;
- progressive Show more results;
- recipe details and instructions;
- weekly meal planning;
- plan-linked ingredient guidance;
- learning from explicit user choices.

### Out of scope

- dedicated cook mode;
- hands-free or voice cooking;
- barcode scanning;
- general shopping lists;
- social sharing;
- macro tracking;
- roommate-management UI.

Barcode scanning and shopping lists remain ideas for later evaluation. They are
not current commitments.
