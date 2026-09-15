# DecisionEats UI/UX Specification

**Decision date:** August 26, 2026  
**Status:** Current experience direction  
**Release:** Version 1.0 ships when ready

## Experience principle

DecisionEats reduces decisions. It does not move search filters into prettier
cards.

Each step asks one question, or two closely related questions. Defaults come
from the pantry, kitchen profile, restrictions, and prior choices. The next
action is always obvious.

## Visual direction

The interface should meet the quality level of modern food apps such as Cal AI
without copying their layout or identity.

DecisionEats uses:

- strong food photography;
- bold, clean system type;
- a warm cream canvas with restrained oat surfaces;
- forest green as the primary brand and action color;
- herb green for ready matches;
- amber for small pantry gaps;
- red only for allergen warnings;
- large rounded controls;
- generous spacing;
- restrained shadows and borders;
- short, conversational copy.

Motion should show progress or continuity. It must never slow the decision.

Mobile is edge-to-edge and single-column. Desktop uses the same journeys in a
centered, responsive workspace. Onboarding and decision-tree steps remain
focused at every width.

## Primary navigation

The three primary destinations are:

- **Now**
- **Plan**
- **Pantry**

Web icons use inline SVG geometry so navigation and controls stay recognizable
when fonts are blocked or fail to load. Icons remain decorative beside accessible
labels and do not require a separate network request.

Settings is a labeled secondary button with a gear icon. Swap uses a compact
icon-and-label button inside each meal card. Primary actions use 56pt minimum
height, rounded corners, visible keyboard focus, and labels that can wrap.
Loading actions retain their label, show a progress indicator, and cannot be
submitted again. Selected tabs use a subtle warm pill behind their icon.

Recipe photos take precedence when available. Missing or failed photos use
bundled, recipe-specific serving illustrations; unknown recipes use a neutral
place setting. The recipe page discloses generated imagery. Artwork never
determines ingredients, allergens, equipment, or portions.

Settings is secondary. Reminders is a secondary destination reachable from
Settings and a confirmed weekly plan. It is not a fourth primary tab.

Legacy cook-mode routes may remain during transition, but they are not part of
the current product and should not shape new UI work.

## Onboarding

Onboarding captures only what later removes decisions:

1. equipment;
2. dietary needs and allergens;
3. starter pantry items or an optional photo scan.

One topic appears per screen. Camera access is optional.

## Now decision tree

### Step 1: Time

Ask: **How much time do you have?**

Use a small set of large choices. Do not use a slider.

### Step 2: Optional preference

Ask one lightweight question such as cuisine or meal mood. The user can skip it.

Do not combine time, cuisine, pantry editing, and equipment into one filter
panel. Equipment and restrictions are already known.

### Step 3: Recommendations

Lead with a few strong matches. Each card shows:

- food image;
- recipe name;
- time;
- pantry fit;
- one short reason it was selected.

Keep **Show more matches** below the first set. It reveals the next ranked set
without changing constraints or replacing the first recommendations.

Organize pantry fit in plain language:

- **Ready now**
- **Missing a few**
- **More to get**

Never show empty bucket headings.

If time or cuisine is relaxed, explain it and offer an undo path. Equipment,
allergens, and dietary needs are never relaxed.

## Recipe screen

The recipe page includes:

- hero image;
- name, time, cuisine, and equipment;
- pantry-match summary;
- ingredients owned and missing;
- one-tap pantry corrections;
- complete instructions;
- source attribution where required.

There is no separate cook mode. Instructions should be clean, readable, and
easy to follow from the recipe page.

## Plan decision tree

Plan is a separate primary destination.

### Step 1: Week size

Ask how many days to plan.

### Step 2: Preparation style

Offer a small choice:

- mostly quick meals;
- batch prep;
- a mix.

### Step 3: Variety

Ask whether the user prefers variety or comfortable repeats.

### Step 4: Proposal

Generate one recommended week. Do not open on an empty calendar.

Show:

- each planned meal;
- prep style and time;
- pantry coverage;
- repeated ingredients that reduce waste;
- a single action to replace one meal.

### Step 5: What to get

After the plan is confirmed, show the ingredient gap beyond the pantry under
the heading **What to get**.

This list belongs to the current plan. It is not a reusable shopping list,
checkout flow, or barcode-scanning surface.

The user may confirm or remove a suggested ingredient. Future ingredient
recommendations must remain explainable and user-approved.

## Pantry

The pantry screen supports three quick actions:

- scan with a photo;
- search and add manually;
- tap to remove or correct.

Photo results always pass through confirmation. Uncertain items use friendly
copy such as “Not sure about this one.” They are never saved silently.

## Copy

Write like a capable friend:

- second person;
- short sentences;
- contractions;
- no blame;
- no internal terminology;
- no fake urgency.

Prefer “Here are three strong matches” over “Search results.”

## Accessibility

Accessibility is part of the product:

- minimum 44×44pt touch targets;
- readable contrast;
- Dynamic Type to 200%;
- meaningful roles, labels, and hints;
- visible focus;
- screen-reader announcements for result updates;
- reduced-motion support;
- allergen warnings announced with priority.

## Out of scope

- dedicated cook mode;
- hands-free or voice cooking;
- barcode scanning;
- general shopping lists;
- macro tracking;
- social sharing;
- roommate-management UI.
