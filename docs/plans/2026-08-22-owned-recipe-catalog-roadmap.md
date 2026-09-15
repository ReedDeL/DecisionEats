# Owned recipe catalog roadmap

Updated September 10, 2026. This document replaces the older starter-catalog
roadmap. Product direction remains in [00_PRODUCT_DIRECTION.md](../00_PRODUCT_DIRECTION.md).

## Current release

The local app catalog contains **2,278 complete recipe records and 946 canonical
ingredients**. Its composition is 33 original DecisionEats recipes, 72 Wikibooks
adaptations, 13 public-domain cookbook adaptations and 2,160 DecisionEats
meal-template variations.

The template variations are complete meal preparations, not independently
published recipes. They expand ingredient combinations while the published
recipe collection grows. They have not each been kitchen-tested.
They currently cover stove meals at 45 minutes; quick and microwave coverage
still comes primarily from the original seed recipes.

Now, Plan and recipe details continue to use the full bundled catalog.
No provider API, runtime model generation, new screen or decision-engine rewrite
is required for these additions. The hosted release's separate 100-recipe offline
subset is not a cap on the full catalog.

## Implemented

Hosted release `873e2700-d896-4d05-b9c5-4a2fb156b21f` was activated on
September 10, 2026 at 05:55 UTC with 2,278 recipes, 946 ingredients, five sources
and a 100-recipe protected offline subset. Recipe instructions and all 19,728
ingredient rows were fingerprint-checked against the local build before activation.
The previous 39-recipe release is retained for rollback. Application version is 0.2.0.

- Checksum-verified streaming extraction of the official Wikibooks XML dump.
- Extraction of public-domain-labeled historical cookbook archives.
- Exact-source review fingerprints, retained original text and revision attribution.
- Reviewed publication of 79 additional source recipes.
- Deterministic generation of 2,160 complete DecisionEats meal variations.
- Explicit meal slots and servings in source ingestion.
- Separate prepared-food identities so canned/cooked ingredients do not match raw ones.
- Preservation of the broad pantry vocabulary during rebuilds.
- Offline USDA bulk import with 24 explicit FDC mappings.
- Regression checks for source boundaries and existing engine constraints.

## Next priorities

1. **Grow independently sourced dishes into the thousands.** The current
   immutable snapshots contain 3,767 Wikibooks candidates and 54,843 historical
   candidates. These counts include incomplete, duplicated and unsuitable
   preparations. Improve parsing and review complete modern meals, keeping
   source evidence and reporting accepted counts separately from candidates.
2. **Improve coverage, not just total count.** Prioritize breakfast, microwave-only,
   no-cook and short-preparation recipes, cuisines, dietary requirements and
   realistic pantry coverage. Template variations alone do not solve these gaps.
3. **Validate preparations.** Kitchen-test representative template components and
   combinations. Add compatibility exclusions if a combination is impractical.
4. **Complete nutrition mapping.** The current release has zero complete
   per-serving calorie estimates. Add reviewed portion-to-mass conversions and
   broader USDA mappings before enabling calorie-based guidance.
5. **Move large catalogs out of the bundle when measured size warrants it.**
   Hosted hooks exist, but the active user journeys still read bundled recipes.
   The current hosted schema does not yet persist meal slots, servings or
   per-recipe attribution URLs; carry those fields before switching the journeys.
   Integrate hosted candidates and detail fallback behind the same engine
   contract, with performance and offline coverage checks before switching.
6. **Retire provider-era tooling.** The optional TheMealDB refresh code is still
   legacy tooling. The supported release command is the local rights-manifest
   pipeline, which performs no provider requests.

## Source decisions

- **Wikibooks:** accepted under CC BY-SA 4.0 with revision attribution and
  change notices. Images require separate rights review.
- **Historical cookbooks:** accepted only after checking the underlying work;
  modernize incomplete preparation details explicitly and preserve provenance.
- **USDA FoodData Central:** free bulk ingredient/nutrition data under CC0;
  it does not provide meal instructions.
- **DataHive recipes-with-nutrition:** researched and excluded. The dataset's
  39,447 rows use CC BY-NC 4.0 and lack cooking instructions, equipment and
  preparation time. Public availability does not establish commercial reuse rights.

## Release gates

The engine stays pure and synchronous over Recipe[]. Equipment, allergies,
dietary requirements and meal-slot suitability remain hard constraints.
Unknown metadata excludes a recipe. Source text is never executable input.
No candidate count may be presented as the count of usable meals.

Hosted releases must load while inactive, verify counts and provenance, and
activate atomically. Preserve the previous release for rollback. App access must
remain read-only through the existing RLS/RPC boundary. No paid recipe service
or recurring model generation is introduced.

See [catalog build instructions and source evidence](../../tools/catalog/README.md)
for exact sources, checksums, reproduction commands and current limitations.
