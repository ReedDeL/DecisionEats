# Recipe catalog

Build the app catalog without a provider API, API key, model call, or network access:

```sh
python -m tools.catalog.pipeline --usda-cache tools/catalog/usda-foundation-cache.json
```

The committed release contains 2,278 recipes and 946 canonical ingredients:

| Content                                       | Count |
| --------------------------------------------- | ----: |
| Existing DecisionEats authored recipes            |    33 |
| Wikibooks adaptations (6 existing + 66 added) |    72 |
| Public-domain cookbook adaptations            |    13 |
| DecisionEats meal-template variations             | 2,160 |

Template variations are complete combinations of six proteins, twelve vegetable
pairings, six flavors and five bases. They have full quantities and instructions,
but are **not 2,160 independently published or individually kitchen-tested recipes**.
They currently cover stove meals at a conservative 45 minutes. The original
microwave and quick-meal recipes remain. Imported sides and condiments have
empty meal slots so they do not become standalone weekly meals.

The app reads the full committed catalog through its existing adapter. The
separate protected hosted release still curates a maximum of 100 recipes as
its offline subset. That subset is not the app's full recipe limit.
The engine's small answer lists remain intentional.

Hosted release `873e2700-d896-4d05-b9c5-4a2fb156b21f` is active as of
September 10, 2026, with the same recipe and ingredient counts. The SQL exporter
stages data using the existing protected schema; activation is separate:

```sh
python -m tools.catalog.export_sql --output output/catalog-expansion/new-hosted-release
```

Inspect and execute the numbered transactional SQL batches in order, verify
counts and content, then execute the separate activation file. Existing releases
are retained. The hosted schema currently omits meal slots, servings and
per-recipe attribution URLs; the bundled catalog retains them for Now and Plan.

## Source extraction and review

The extractor writes candidates, not app recipes. It verifies a downloaded
archive's SHA-256 before parsing and retains source text, revision URLs and
upstream checksums. Raw historical claims still need verification against the
underlying cookbook. Do not approve a dataset solely from its uploader's label.

```sh
python -m tools.catalog.import_sources extract wikibooks /path/to/dump.xml.bz2 \
  --sha256 e3ef78fe67cf66bbfd65be49f8427e6b494913a390f5064960d4bd26a075b181 \
  --output output/catalog-expansion/wikibooks-candidates.jsonl
python -m tools.catalog.import_sources extract historical /path/to/archive.zip \
  --sha256 02da777aa691335729ee3fa2f9ebf44ea4cdd8d2486c31ff3ff75b115d4d3639 \
  --output output/catalog-expansion/historical-candidates.jsonl
```

Pinned upstreams:

- [Wikimedia September 2026 dump](https://dumps.wikimedia.org/enwikibooks/20260901/enwikibooks-20260901-pages-articles.xml.bz2):
  3,767 candidate pages with ingredient and procedure sections.
- [Open Recipe Archive commit ae3bd2c](https://github.com/AdamBouhmad/open-recipe-archive/tree/ae3bd2c009a8899dfe63b9166fa98ae3fa8041a8):
  54,843 candidate records; accepted historical adaptations currently come from
  [Fannie Merritt Farmer's cookbook](https://www.gutenberg.org/ebooks/65061).

These are candidate counts, not additional usable recipe counts. Historical
records can omit quantities, refer to missing subrecipes, repeat dishes or
contain outdated preparations. Full automatic publication is deliberately absent.

Editorial selections specify canonical ingredients, measures, complete adapted
instructions, equipment, time, servings where known, dietary claims and meal
slots. Compilation binds reviews to the exact candidate fingerprint:

```sh
python -m tools.catalog.review_selection \
  output/catalog-expansion/wikibooks-candidates.jsonl \
  tools/catalog/reviews/wikibooks-selection.json /tmp/new-wikibooks-review
python -m tools.catalog.import_sources publish \
  /tmp/new-wikibooks-review/candidates.jsonl /tmp/new-wikibooks-review/reviews.jsonl \
  --output /tmp/new-wikibooks.jsonl
python -m tools.catalog.meal_templates --output /tmp/new-homechef-templates.jsonl
```

Use the historical selection file identically with historical candidates.
Commands refuse to overwrite release artifacts. Compare new outputs before
replacing a committed version and updating the rights-manifest checksum.
Prepared ingredients keep separate identities: canned beans cannot match dry
beans, and cooked chicken cannot match raw chicken.

## Licensing and provenance

Wikibooks source text, retained candidates and adaptations are distributed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Each imported recipe
retains the source revision, contributor attribution and modification notice.
The historical source is public domain in the United States according to
Project Gutenberg; DecisionEats's historical adaptations are dedicated under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
DecisionEats's original templates use the same original-content status as its seeds.
Images are excluded from these imports because image rights are separate.

For committed local archives, rights-manifest `sha256` hashes the **neutral
JSONL file**. `archiveUrl` is the source/provenance page; it is not necessarily
a downloadable neutral JSONL file. Use the local rebuild above, not the generic
remote archive downloader on those provenance URLs. The upstream binary SHA-256
is recorded separately in candidates/selections. Source text must never be
executed as code.

## USDA bulk enrichment

FoodData Central supplies ingredient nutrition, not cooking instructions.
The importer consumes the free [Foundation Foods April 2026 JSON ZIP](https://fdc.nal.usda.gov/download-datasets/).
Its SHA-256 is
`186e988ec542e913f51ef62b86a47758e8cdd0d1dc3889e7b055581f3c09c77a`.

```sh
python -m tools.catalog.usda_bulk /path/to/foundation.zip \
  tools/catalog/usda-foundation-mapping.json --output /tmp/usda-cache.json
```

The 24 explicit FDC mappings retain their descriptions and published kcal
values. Specific Atwater factors take precedence over generic energy and
general factors. Missing energy has no guessed fallback. USDA data is
[public domain/CC0](https://fdc.nal.usda.gov/api-guide/).

A recipe gets an energy estimate only when servings, every food match and every
mass conversion are available. This release has **zero complete calorie
estimates**. Cups, spoons and ingredient counts are not silently converted to
grams. The cache is useful groundwork, not a claim of complete nutrition coverage.

## Dataset evaluations

[DataHive recipes-with-nutrition](https://huggingface.co/datasets/datahiveai/recipes-with-nutrition)
lists 39,447 rows under CC BY-NC 4.0. Its published schema contains ingredients
and nutrition but no cooking instructions, preparation time or equipment. The
card describes noncommercial research and educational use, drawing from public
recipe websites. It is excluded from the production catalog: it supplies neither
commercial reuse permission nor the complete preparation data DecisionEats needs.
Its nutrition totals should also not be assumed to be per serving without validation.

The [Gossminn Wikibooks dataset](https://huggingface.co/datasets/gossminn/wikibooks-cookbook)
is another CC BY-SA source representation, largely overlapping the official
dump; it is not an independent set of new dishes. Keep revision provenance when
using it to improve parsing.

## Checks

```sh
python -m pytest tools/
python -m ruff check tools/
python -m ruff format --check tools/
python -m mypy --strict tools/catalog
npm run check
```

Coverage includes archive checksums, stale-review rejection, deterministic
materialization, canonical prepared ingredients, source attribution, meal slots,
allergy exclusion and the existing bounded decision flow.
