# Wikibooks Cookbook source design

**Date:** 2026-08-13
**Status:** Candidate — feasible source, not approved release input

## Decision summary

Use English Wikibooks Cookbook as the first researched open-content source for
the owned recipe catalog. Acquire it from an official Wikimedia dump at build
time, extract it into DecisionEats's neutral JSONL contract, and keep it
release-ineligible until checksum, attribution, parser-quality, hard-constraint,
and parity gates pass.

Do not add a live MediaWiki dependency to the app or to normal catalog builds.

## Source acquisition boundary

The official `enwikibooks` pages-and-articles XML/BZ2 dump is the discovery
source. Wikimedia's `latest` path is mutable, so it is acceptable only while
the manifest entry has `candidate` status. A release must instead identify an
immutable dated dump, verify it independently, preserve its provenance, and
produce a checksum-pinned neutral JSONL archive.

The extractor must stream the archive, select `Cookbook:` content pages, and
retain enough page/revision metadata to reproduce attribution. The existing
catalog pipeline begins at neutral JSONL; raw MediaWiki XML is not an approved
`RightsSource`.

## Why Wikibooks

A live API feasibility sample on 2026-08-13 found structured recipe pages with
ingredient and procedure sections, recipe-summary templates, linked ingredient
concepts, measurement templates, and linked equipment. Those observations
justify building an extractor; they are not release counts or a promise of
usable yield.

Declared preparation time may be used when trustworthy. Otherwise the existing
deterministic estimator may supply a clearly derived value. Missing or
ambiguous data must quarantine the record when it affects a hard constraint.

Useful structured signals include:

1. `recipesummary` fields such as servings, time, and difficulty;
2. `Cookbook:` ingredient links as normalization evidence;
3. `convert` templates with separate quantity and unit arguments;
4. linked equipment as an additional classification signal.

All signals are hints. The normalized output still has to satisfy the same
source-neutral contract and safety gates as any other source.

## Content and provenance contract

Every emitted source record must include:

- stable source and recipe IDs;
- canonical page URL and revision identity;
- recipe title, ingredients, and instructions;
- source license and attribution text;
- whether DecisionEats modified or derived displayed text;
- deterministic parser version and rejection reason when quarantined.

Attribution must survive normalization, hosted loading, offline subset
generation, and recipe-detail rendering. A record without recoverable
page-level provenance is not releasable.

## License obligations

Wikibooks states that most text is available under CC BY-SA 4.0 and the GFDL,
while individual media can have different terms. DecisionEats must preserve
page-level evidence rather than assuming every asset shares one license.

For reused or adapted recipe text, the release design must support:

1. contributor/source attribution and a link to the source page;
2. a link to the applicable license;
3. an indication when content was modified;
4. share-alike handling for adapted licensed text;
5. no additional technical restrictions on the licensed content.

Source registration is not legal approval. Attribution and share-alike behavior
require review before public activation.

## Image policy

Recipe text and imagery are separate rights decisions. The initial source can
ship with no images. If Commons images are added later, each file must have
machine-readable authorship, source, and a positively allowed commercial
license. Unknown, non-commercial, ambiguous, and fair-use media are rejected.
A missing image is better than an unsafe or misleading one.

## Hard-constraint gate

A larger archive is useful only if recipes can safely enter the decision set.
Unknown equipment, allergen, or dietary status excludes rather than admits. The
source report must therefore show:

- extracted, parsed, normalized, quarantined, and accepted counts;
- rejection reasons and parser coverage;
- equipment classification coverage;
- allergen and dietary evidence coverage;
- useful-answer parity against the transitional offline bundle.

The review must set a go/no-go threshold from measured data before approval; a
projected API sample is not a release gate.

## Approval criteria

Wikibooks can become an approved catalog source only when:

- the dated upstream dump and neutral JSONL output are checksum-pinned;
- extraction and normalization are deterministic and fixture-tested;
- every accepted recipe has recoverable page-level provenance;
- attribution and share-alike behavior pass review;
- hard constraints continue to exclude unknowns;
- the curated offline subset remains useful without hosted access;
- activation is auditable and separate from build generation.
