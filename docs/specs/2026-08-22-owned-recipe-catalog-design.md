# Owned recipe catalog design

**Date:** 2026-08-22
**Status:** Approved for implementation

## Decision

DecisionEats is moving to a rights-first recipe catalog that it can host and
operate without recipe-provider APIs. Approved, checksum-pinned bulk archives
are the only source of new catalog releases. A small curated offline catalog
ships with the app so the decision experience begins immediately and remains
useful while hosted data is unavailable.

This replaces provider tiers and live recipe-provider escalation. Supabase and
Gemini remain: Supabase hosts the catalog and Gemini is only for photo-to-pantry.
No client, Edge Function, or build tool calls a recipe-provider API.

## Why

The product needs durable rights, reproducible builds, consistent hard-constraint
data, and reliable attribution. A live provider can change its terms, quota, or
payload without notice. A release built from an approved source manifest can be
audited, reproduced, activated atomically, and attributed accurately.

The current `src/data/*.json` bundle is a transitional, provider-derived
artifact. It is not rebuildable from the retired provider API. It remains
shipped with its existing attribution until an approved replacement reaches
parity; it must not be described as already removed. Today it contains 812
recipes and 897 ingredients; 76 recipes are `unclassified` and excluded by the
hard-constraint filter.

## Content and release model

1. A rights manifest records each candidate archive's source, version, license,
   attribution requirements, approval status, URL, and SHA-256 checksum.
2. The build pipeline downloads only an `approved` manifest entry, verifies the
   checksum, parses it through source-neutral models, and quarantines invalid or
   unsafe records with explicit reasons.
3. Normalization creates stable DecisionEats IDs, structured ingredient measures,
   provenance, deterministic deduplication, and safe equipment metadata.
4. Validation produces a candidate release and an offline subset. Unknown
   equipment, allergen, or dietary status excludes a recipe; it never admits.
5. An operator loads the inactive release into protected Supabase tables,
   verifies counts and attributions, then atomically activates it.

The pipeline is build-time Python tooling only. It is not a service and does
not make recipe-provider API calls. Every release remains attributable to its
approved source and checksum.

## Runtime model

The client reads a bounded hosted candidate set through authenticated RPCs and
has the curated offline catalog available immediately. It merges candidates by
stable DecisionEats ID, then passes plain `Recipe[]` values to the pure decision
engine. The engine never knows whether a recipe was hosted or offline.

```text
approved archive -> build/validate -> inactive Supabase release -> activate
                                              |
offline catalog ------------------------------+-> client candidates -> engine
```

The hosted RPCs expose candidates, recipe detail, and active attribution only.
They clamp candidate requests to 100 and prefilter hard constraints. The client
performs the final hard-constraint check through the pure engine. A network or
hosted-release failure silently retains offline results; it never creates an
empty results screen.

## Safety, privacy, and rights

- Equipment, allergens, and dietary restrictions are hard constraints and are
  never relaxed. Unknown status excludes.
- Every catalog table enables RLS in its creating migration. Clients have no
  direct catalog-table writes.
- Release loading and activation are privileged operational actions, never
  ordinary client mutations.
- Attribution is active-release data, not hardcoded copy. Transitional
  attribution remains until the replacement cutover is approved.
- No `pgvector`, hybrid search, shopping list, barcode scanning, or Python
  service layer is introduced by this decision.

## Acceptance gates

Replacement parity must be assessed before removing the transitional bundle or
its attribution. At minimum, assess candidate coverage, ingredient vocabulary,
equipment-tier coverage, hard-constraint behavior, result caps, source rights,
and attribution. Until approval, the transitional artifact remains read-only
and non-rebuildable.

## Related documents

- [Implementation roadmap](../plans/2026-08-22-owned-recipe-catalog-roadmap.md)
- [Technical specification](../01_TECHNICAL_SPEC.md)
- [Microwave seed catalog design](2026-08-06-microwave-seed-catalog-design.md)
