"""Deterministic ingestion and release construction for neutral JSONL archives."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections.abc import Iterator, Mapping
from pathlib import Path

from pydantic import BaseModel, Field, ValidationError

from tools.catalog.equipment import coerce_equipment
from tools.catalog.measurements import parse_measure
from tools.catalog.models import (
    CatalogIngredient,
    CatalogRecipe,
    Provenance,
    RecipeAttribution,
    SourceRecipe,
    VocabularyEntry,
)
from tools.catalog.normalize import (
    allergen_groups_for,
    canonical_cuisine,
    canonical_id,
    display_name,
    is_staple,
)
from tools.catalog.nutrition import enrich_recipes, load_usda_cache
from tools.catalog.rights import ReleaseSource, RightsManifest, RightsSource
from tools.catalog.seed_loader import (
    AUTHORED_SOURCE_ID,
    authored_release_source,
    load_seed_recipes,
    load_seed_vocabulary,
    merge_seed,
)

OFFLINE_RECIPE_CAP = 100


class QuarantineEntry(BaseModel):
    """A machine-readable rejection linked to its archive coordinate."""

    model_config = {"extra": "forbid"}

    code: str
    coordinate: str
    detail: str


class IngestResult(BaseModel):
    recipes: list[CatalogRecipe]
    quarantine: list[QuarantineEntry]


class ReleaseBuild(BaseModel):
    """A local artifact ready for later protected load/activation work."""

    model_config = {"extra": "forbid", "populate_by_name": True}

    recipes: list[CatalogRecipe]
    offline_recipes: list[CatalogRecipe] = Field(alias="offlineRecipes")
    vocabulary: list[VocabularyEntry]
    sources: list[ReleaseSource]
    quarantine: list[QuarantineEntry]
    counts: dict[str, int]


def iter_jsonl_records(archive: Path) -> Iterator[tuple[int, object]]:
    """Yield one JSON value at a time; archives never enter memory wholesale."""
    with archive.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if line.strip():
                try:
                    yield line_number, json.loads(line)
                except json.JSONDecodeError as error:
                    yield line_number, error


def ingest_archive(source: RightsSource, archive: Path) -> IngestResult:
    """Validate and normalize one local approved archive without network I/O."""
    if source.status != "approved":
        raise ValueError(f"source {source.id!r} is not approved for ingestion")
    if source.archive_format != "jsonl":
        raise ValueError(f"unsupported neutral archive format {source.archive_format!r}")
    if _file_sha256(archive) != source.sha256:
        raise ValueError("archive checksum does not match the rights manifest")

    quarantine: list[QuarantineEntry] = []
    records_by_id: dict[str, list[tuple[SourceRecipe, str]]] = {}
    for line_number, raw in iter_jsonl_records(archive):
        coordinate = _coordinate(source, raw, line_number)
        try:
            if isinstance(raw, Exception):
                raise ValueError("invalid JSONL record")
            recipe = SourceRecipe.model_validate(raw)
        except (ValidationError, ValueError) as error:
            quarantine.append(
                QuarantineEntry(code="malformed_record", coordinate=coordinate, detail=str(error))
            )
            continue

        records_by_id.setdefault(recipe.source_recipe_id, []).append((recipe, coordinate))

    recipes: list[CatalogRecipe] = []
    for source_recipe_id in sorted(records_by_id):
        records = records_by_id[source_recipe_id]
        fingerprints = {_source_fingerprint(recipe) for recipe, _ in records}
        if len(fingerprints) > 1:
            quarantine.extend(
                QuarantineEntry(
                    code="duplicate_conflict",
                    coordinate=coordinate,
                    detail="source recipe id differs materially",
                )
                for _, coordinate in records
            )
            continue
        recipe, coordinate = records[0]
        normalized, issue = _normalize_recipe(source, recipe, coordinate)
        if issue is not None:
            quarantine.append(issue)
        elif normalized is not None:
            recipes.append(normalized)

    return IngestResult(recipes=recipes, quarantine=_sorted_quarantine(quarantine))


def build_release(manifest: RightsManifest, archives: Mapping[str, Path]) -> ReleaseBuild:
    """Build a deterministic non-empty local release from approved local archives."""
    approved = sorted(manifest.approved_sources(), key=lambda item: (item.id, item.version))
    if not approved:
        raise ValueError("cannot publish an empty release without approved sources")

    all_recipes: list[CatalogRecipe] = []
    quarantine: list[QuarantineEntry] = []
    for source in approved:
        archive = archives.get(source.id)
        if archive is None:
            raise ValueError(f"approved source {source.id!r} has no local archive")
        result = ingest_archive(source, archive)
        all_recipes.extend(result.recipes)
        quarantine.extend(result.quarantine)

    recipes, duplicate_quarantine = _deduplicate(all_recipes)
    quarantine.extend(duplicate_quarantine)
    if not recipes:
        raise ValueError("cannot publish a release without valid external recipes")
    recipes = merge_seed(recipes, load_seed_recipes())
    recipes = sorted(recipes, key=lambda recipe: recipe.id)
    offline = _build_offline_subset(recipes)
    vocabulary = _build_vocabulary(recipes, load_seed_vocabulary())
    authored_source = authored_release_source()
    if any(source.id == authored_source.id for source in approved):
        raise ValueError(
            f"approved source {authored_source.id!r} conflicts with HomeChef-authored seeds"
        )
    release_sources = sorted(
        [*(source.to_release_source() for source in approved), authored_source],
        key=lambda source: (source.id, source.version),
    )
    return ReleaseBuild(
        recipes=recipes,
        offlineRecipes=offline,
        vocabulary=vocabulary,
        sources=release_sources,
        quarantine=_sorted_quarantine(quarantine),
        counts={
            "recipes": len(recipes),
            "offlineRecipes": len(offline),
            "quarantined": len(quarantine),
        },
    )


def write_release(release: ReleaseBuild, destination: Path, *, overwrite: bool = False) -> Path:
    """Write canonical JSON with an explicit overwrite boundary."""
    validate_release(release)
    if destination.exists() and not overwrite:
        raise FileExistsError(f"refusing to overwrite {destination}; pass overwrite=True")
    destination.parent.mkdir(parents=True, exist_ok=True)
    payload = release.model_dump(by_alias=True)
    destination.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return destination


def load_release(path: Path) -> ReleaseBuild:
    """Parse and validate a complete local release before any handoff boundary."""
    release = ReleaseBuild.model_validate(json.loads(path.read_text(encoding="utf-8")))
    validate_release(release)
    return release


def validate_release(release: ReleaseBuild) -> None:
    """Enforce locally knowable release invariants without hosted state access."""
    if not release.recipes:
        raise ValueError("release recipes must not be empty")
    if not release.sources:
        raise ValueError("release sources must not be empty")
    if any(source.status != "approved" for source in release.sources):
        raise ValueError("release sources must all be approved")
    identities = [(source.id, source.version) for source in release.sources]
    if len(identities) != len(set(identities)):
        raise ValueError("release sources contain duplicate source/version entries")
    source_ids = [source.id for source in release.sources]
    if len(source_ids) != len(set(source_ids)):
        raise ValueError("release sources contain duplicate source ids")

    recipe_by_id = {recipe.id: recipe for recipe in release.recipes}
    if len(recipe_by_id) != len(release.recipes):
        raise ValueError("release recipe ids must be unique")
    expected_counts = {
        "recipes": len(release.recipes),
        "offlineRecipes": len(release.offline_recipes),
        "quarantined": len(release.quarantine),
    }
    if release.counts != expected_counts:
        raise ValueError("release counts do not match its contents")

    source_by_identity = {(source.id, source.version): source for source in release.sources}
    for recipe in release.recipes:
        _validate_recipe_hard_constraints(recipe)
        _validate_recipe_provenance(recipe, source_by_identity)

    if len(release.offline_recipes) > OFFLINE_RECIPE_CAP:
        raise ValueError(f"offline recipes exceed the cap of {OFFLINE_RECIPE_CAP}")
    offline_ids: set[str] = set()
    for recipe in release.offline_recipes:
        if recipe.id in offline_ids:
            raise ValueError("offline recipe ids must be unique")
        offline_ids.add(recipe.id)
        candidate = recipe_by_id.get(recipe.id)
        if candidate is None or candidate.model_dump() != recipe.model_dump():
            raise ValueError("offline recipes must be identical candidate recipes")
        if not _is_offline_safe(recipe):
            raise ValueError("offline recipes require verified hard constraints")

    required_authored_ids = {recipe.id for recipe in load_seed_recipes()}
    if not required_authored_ids <= offline_ids:
        raise ValueError("offline recipes must retain all HomeChef-authored seeds")
    expected_offline = _build_offline_subset(release.recipes)
    if [recipe.model_dump() for recipe in release.offline_recipes] != [
        recipe.model_dump() for recipe in expected_offline
    ]:
        raise ValueError("offline recipes differ from the canonical offline subset")

    if [entry.model_dump() for entry in release.vocabulary] != [
        entry.model_dump() for entry in _build_vocabulary(release.recipes, load_seed_vocabulary())
    ]:
        raise ValueError("release vocabulary does not match recipes")


def _validate_recipe_provenance(
    recipe: CatalogRecipe, source_by_identity: Mapping[tuple[str, str], ReleaseSource]
) -> None:
    if not recipe.provenance:
        raise ValueError(f"recipe {recipe.id!r} has no provenance")
    identities = {
        (item.source_id, item.source_version, item.source_recipe_id, item.archive_sha256)
        for item in recipe.provenance
    }
    if len(identities) != len(recipe.provenance):
        raise ValueError(f"recipe {recipe.id!r} has duplicate provenance")
    for provenance in recipe.provenance:
        source = source_by_identity.get((provenance.source_id, provenance.source_version))
        if source is None or source.sha256 != provenance.archive_sha256:
            raise ValueError(f"recipe {recipe.id!r} provenance does not match a release source")


def _coordinate(source: RightsSource, raw: object, line_number: int) -> str:
    source_recipe_id = "<unknown>"
    if isinstance(raw, dict) and isinstance(raw.get("sourceRecipeId"), str):
        source_recipe_id = raw["sourceRecipeId"]
    return f"{source.id}:{source_recipe_id}:{line_number}"


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(64 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _normalize_recipe(
    source: RightsSource, recipe: SourceRecipe, coordinate: str
) -> tuple[CatalogRecipe | None, QuarantineEntry | None]:
    if not recipe.ingredients:
        return None, QuarantineEntry(
            code="no_ingredients", coordinate=coordinate, detail="recipe has none"
        )
    equipment = coerce_equipment(recipe.equipment)
    if equipment == ["unclassified"]:
        return None, QuarantineEntry(
            code="unknown_equipment", coordinate=coordinate, detail="not verified"
        )
    if recipe.allergen_status != "verified":
        return None, QuarantineEntry(
            code="unknown_allergen_status", coordinate=coordinate, detail="not verified"
        )
    if recipe.dietary_status != "verified":
        return None, QuarantineEntry(
            code="unknown_dietary_status", coordinate=coordinate, detail="not verified"
        )

    ingredients: list[CatalogIngredient] = []
    for item in recipe.ingredients:
        ingredient_id = canonical_id(item.name)
        if not ingredient_id:
            return None, QuarantineEntry(
                code="malformed_record", coordinate=coordinate, detail="blank ingredient"
            )
        measure = parse_measure(item.measure)
        ingredients.append(
            CatalogIngredient(
                id=ingredient_id,
                raw_measure=measure.raw,
                quantity=measure.quantity,
                unit=measure.unit,
                allergen_groups=allergen_groups_for(ingredient_id),
            )
        )
    recipe_id = _homechef_id(recipe, ingredients)
    return (
        CatalogRecipe(
            id=recipe_id,
            title=recipe.title,
            image_url=recipe.image_url,
            cuisine=canonical_cuisine(recipe.cuisine),
            total_time_minutes=recipe.total_time_minutes,
            equipment_required=equipment,
            allergen_status=recipe.allergen_status,
            dietary_status=recipe.dietary_status,
            dietary_tags=sorted(set(recipe.dietary_tags)),
            ingredients=ingredients,
            instructions=recipe.instructions,
            base_servings=recipe.base_servings,
            mealSlots=recipe.meal_slots,
            attribution=RecipeAttribution(
                source_id=source.id,
                source_version=source.version,
                source_recipe_id=recipe.source_recipe_id,
                attribution=recipe.attribution_text or source.attribution,
                url=recipe.source_url or source.archive_url,
                license_name=source.license_name,
                license_url=source.license_url,
            ),
            provenance=[
                Provenance(
                    source_id=source.id,
                    source_version=source.version,
                    source_recipe_id=recipe.source_recipe_id,
                    archive_sha256=source.sha256,
                )
            ],
        ),
        None,
    )


def _homechef_id(recipe: SourceRecipe, ingredients: list[CatalogIngredient]) -> str:
    identity = {
        "cuisine": canonical_cuisine(recipe.cuisine),
        "dietaryTags": sorted(recipe.dietary_tags),
        "equipment": sorted(recipe.equipment),
        "ingredients": sorted((item.id, item.raw_measure) for item in ingredients),
        "instructions": recipe.instructions,
        "title": recipe.title.lower(),
        "totalTimeMinutes": recipe.total_time_minutes,
    }
    encoded = json.dumps(
        identity, sort_keys=True, separators=(",", ":"), ensure_ascii=True
    ).encode()
    return f"hc-{hashlib.sha256(encoded).hexdigest()[:20]}"


def _source_fingerprint(recipe: SourceRecipe) -> str:
    return json.dumps(recipe.model_dump(by_alias=True), sort_keys=True, separators=(",", ":"))


def _deduplicate(recipes: list[CatalogRecipe]) -> tuple[list[CatalogRecipe], list[QuarantineEntry]]:
    by_id: dict[str, CatalogRecipe] = {}
    quarantine: list[QuarantineEntry] = []
    for recipe in recipes:
        existing = by_id.get(recipe.id)
        if existing is None:
            by_id[recipe.id] = recipe
            continue
        merged = {
            (row.source_id, row.source_version, row.source_recipe_id, row.archive_sha256): row
            for row in [*existing.provenance, *recipe.provenance]
        }
        existing.provenance = [merged[key] for key in sorted(merged)]
    return [by_id[key] for key in sorted(by_id)], quarantine


def _is_offline_safe(recipe: CatalogRecipe) -> bool:
    return (
        recipe.allergen_status == "verified"
        and recipe.dietary_status == "verified"
        and "unclassified" not in recipe.equipment_required
    )


def _build_offline_subset(recipes: list[CatalogRecipe]) -> list[CatalogRecipe]:
    """Curate offline data by retaining seeds, then quickest stable external recipes.

    The 100-item cap protects the app bundle. HomeChef-authored microwave seeds
    are always retained; remaining capacity goes to verified external recipes
    ordered by positive total time and then their stable HomeChef ID.
    """
    authored = sorted(
        (recipe for recipe in recipes if _is_authored_seed(recipe)), key=lambda recipe: recipe.id
    )
    if len(authored) > OFFLINE_RECIPE_CAP:
        raise ValueError("HomeChef-authored seeds exceed the offline recipe cap")
    external = sorted(
        (
            recipe
            for recipe in recipes
            if not _is_authored_seed(recipe) and _is_offline_safe(recipe)
        ),
        key=lambda recipe: (recipe.total_time_minutes, recipe.id),
    )
    return sorted(
        [*authored, *external[: OFFLINE_RECIPE_CAP - len(authored)]], key=lambda recipe: recipe.id
    )


def _is_authored_seed(recipe: CatalogRecipe) -> bool:
    return any(provenance.source_id == AUTHORED_SOURCE_ID for provenance in recipe.provenance)


def _validate_recipe_hard_constraints(recipe: CatalogRecipe) -> None:
    equipment = recipe.equipment_required
    if not equipment or "unclassified" in equipment or coerce_equipment(equipment) != equipment:
        raise ValueError(f"recipe {recipe.id!r} has non-canonical equipment")
    if recipe.allergen_status != "verified":
        raise ValueError(f"recipe {recipe.id!r} has unverified allergen status")
    if recipe.dietary_status != "verified":
        raise ValueError(f"recipe {recipe.id!r} has unverified dietary status")
    if not recipe.ingredients:
        raise ValueError(f"recipe {recipe.id!r} has no ingredients")
    if recipe.dietary_tags != sorted(set(recipe.dietary_tags)):
        raise ValueError(f"recipe {recipe.id!r} has non-canonical dietary tags")


def _build_vocabulary(
    recipes: list[CatalogRecipe],
    seed_vocabulary: list[VocabularyEntry] | None = None,
) -> list[VocabularyEntry]:
    """Merge the broad pantry language with ingredients used by this release."""
    by_id = {entry.id: entry for entry in seed_vocabulary or []}
    ingredient_ids = {item.id for recipe in recipes for item in recipe.ingredients}
    for ingredient_id in ingredient_ids:
        by_id[ingredient_id] = VocabularyEntry(
            id=ingredient_id,
            display_name=display_name(ingredient_id),
            allergen_groups=allergen_groups_for(ingredient_id),
            is_staple=is_staple(ingredient_id),
        )
    return [by_id[ingredient_id] for ingredient_id in sorted(by_id)]


def _sorted_quarantine(entries: list[QuarantineEntry]) -> list[QuarantineEntry]:
    return sorted(entries, key=lambda item: (item.coordinate, item.code, item.detail))


def rebuild_committed_catalog(
    output_dir: Path | None = None, *, usda_cache_path: Path | None = None
) -> ReleaseBuild:
    """Build the approved release from committed archives and seeds, writing to src/data."""
    catalog_output_dir = (
        output_dir
        if output_dir is not None
        else Path(__file__).resolve().parents[2] / "src" / "data"
    )
    manifest_path = Path(__file__).resolve().parent / "rights-manifest.json"
    manifest = RightsManifest.model_validate_json(manifest_path.read_text(encoding="utf-8"))
    archives_dir = Path(__file__).resolve().parent / "archives"
    archives = {
        source.id: archives_dir / f"{source.id}-{source.version[:7]}.jsonl"
        for source in manifest.approved_sources()
    }
    release = build_release(manifest, archives)
    if usda_cache_path is not None:
        release.recipes = enrich_recipes(release.recipes, load_usda_cache(usda_cache_path))
        enriched = {recipe.id: recipe for recipe in release.recipes}
        release.offline_recipes = [enriched[recipe.id] for recipe in release.offline_recipes]
    catalog_output_dir.mkdir(parents=True, exist_ok=True)
    recipes_payload = [r.model_dump(by_alias=True) for r in release.recipes]
    vocabulary_payload = [v.model_dump(by_alias=True) for v in release.vocabulary]

    (catalog_output_dir / "recipes.json").write_text(
        json.dumps(recipes_payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (catalog_output_dir / "ingredients.json").write_text(
        json.dumps(vocabulary_payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (catalog_output_dir / "catalog-attributions.json").write_text(
        json.dumps(
            [
                {
                    "sourceId": source.id,
                    "sourceVersion": source.version,
                    "title": source.title,
                    "url": source.archive_url,
                    "licenseName": source.license_name,
                    "licenseUrl": source.license_url,
                    "attribution": source.attribution,
                }
                for source in release.sources
            ],
            indent=2,
            sort_keys=True,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    return release


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--usda-cache", type=Path)
    args = parser.parse_args()
    release = rebuild_committed_catalog(args.output_dir, usda_cache_path=args.usda_cache)
    print(f"Wrote {len(release.recipes)} recipes and {len(release.vocabulary)} ingredients.")
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
