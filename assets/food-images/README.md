# Ingredient photography

These 35 Wikimedia Commons thumbnails are bundled locally. The app does not
contact Wikimedia or a stock-photo API while displaying them.

The authoritative file-level author, source, license, checksum, ingredient
mapping, and review notes are in
[the image manifest](../../tools/catalog/image-manifest.json).
The app exposes the same credits at **Settings > Image credits** and from recipe
pages. CC BY and CC BY-SA images retain their respective licenses; public-domain
and CC0 records retain their source evidence. The app crops thumbnails to fit
its display. No ownership of these photographs is claimed.

These are ingredient references. Meal previews assemble up to three photos of
ingredients explicitly listed in that recipe. They are labeled **Ingredients**;
they are not photographs of cooked HomeChef recipes. Existing recipe-specific
serving illustrations take precedence over ingredient previews. Unknown recipes
and failed images retain the neutral fallback.

## Updating the collection

1. Find the original file on Wikimedia Commons and review its photo, author,
   license, source history, and any restrictions.
2. Reject unrelated dishes, noncommercial-only licenses, ambiguous provenance,
   branding-heavy pictures, or mismatched preparations. Raw and cooked food are
   not interchangeable mappings.
3. Obtain a Commons thumbnail, record its SHA-256 and exact URL, and add an
   explicit ingredient-ID mapping to the manifest only after review.
4. Place the unchanged thumbnail in this directory. Mark it reviewed and record
   the review evidence. An open-license search result alone is not approval.
5. Run the image build and verify commands listed below.
6. Run npm run check and python3 -m pytest tools/.

Build: python3 -m tools.catalog.images build

Verify: python3 -m tools.catalog.images verify

Recover missing bundled files: python3 -m tools.catalog.images fetch

Fetch uses only reviewed URLs and rejects redirects, oversized responses, and
changed checksums. Existing files are verified, not replaced.

Builds are offline and deterministic. A new source file, changed file, or broader
ingredient mapping requires a fresh review. Storage and bandwidth are governed
by the app's hosting allowance; the image sources have no licensing fee.

Open Food Facts is a possible later source for packaged-product images. It is
not integrated here because HomeChef currently uses ingredient identities, not
product barcodes.
