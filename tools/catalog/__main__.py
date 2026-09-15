"""Build the bundled catalog.

    python -m tools.catalog --limit 20

Writes ``src/data/recipes.json`` and ``src/data/ingredients.json``. Run
manually; the output is committed. See docs/01_TECHNICAL_SPEC.md 5.2.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from pydantic import ValidationError

from tools.catalog.build import build_vocabulary, load_catalog_recipes, to_catalog_recipe
from tools.catalog.fetch import fetch_all_meals
from tools.catalog.models import CatalogRecipe
from tools.catalog.nutrition import (
    enrich_recipes,
    load_usda_cache,
    refresh_usda_cache,
)
from tools.catalog.seed_loader import load_seed_recipes, load_seed_vocabulary, merge_seed

logger = logging.getLogger("catalog")

OUTPUT_DIR = Path(__file__).resolve().parents[2] / "src" / "data"
CATALOG_PATH = OUTPUT_DIR / "recipes.json"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the HomeChef bundled catalog.")
    parser.add_argument("--limit", type=int, default=None, help="stop after N recipes")
    parser.add_argument(
        "--refresh-mealdb",
        action="store_true",
        help="explicitly refresh the owned catalog from TheMealDB",
    )
    usda_group = parser.add_mutually_exclusive_group()
    usda_group.add_argument(
        "--usda-cache",
        type=Path,
        help="enrich from a checksum-verified USDA cache without network access",
    )
    usda_group.add_argument(
        "--refresh-usda-cache",
        type=Path,
        help="explicitly refresh USDA data using USDA_FDC_API_KEY",
    )
    parser.add_argument(
        "--output-dir", type=Path, default=OUTPUT_DIR, help="where to write the JSON files"
    )
    args = parser.parse_args(argv)
    if args.limit is not None and not args.refresh_mealdb:
        parser.error("--limit requires --refresh-mealdb")

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    if args.refresh_mealdb:
        recipes, skipped = _refresh_mealdb(args.limit)
        seed = load_seed_recipes()
        recipes = merge_seed(recipes, seed)
        logger.info("merged %d hand-curated seed recipes", len(seed))
    else:
        recipes = load_catalog_recipes(CATALOG_PATH)
        skipped = 0
        logger.info("loaded %d recipes from committed catalog", len(recipes))

    if not recipes:
        logger.error("no recipes produced; refusing to write an empty catalog")
        return 1

    try:
        if args.refresh_usda_cache is not None:
            ingredient_ids = sorted(
                {ingredient.id for recipe in recipes for ingredient in recipe.ingredients}
            )
            cache = refresh_usda_cache(args.refresh_usda_cache, ingredient_ids)
            recipes = enrich_recipes(recipes, cache)
        elif args.usda_cache is not None:
            recipes = enrich_recipes(recipes, load_usda_cache(args.usda_cache))
    except (OSError, ValueError, ValidationError) as error:
        logger.error("USDA nutrition enrichment failed: %s", error)
        return 1

    # Pantry recognition must not shrink to only ingredients used by recipes.
    vocabulary_by_id = {entry.id: entry for entry in load_seed_vocabulary()}
    vocabulary_by_id.update({entry.id: entry for entry in build_vocabulary(recipes)})
    vocabulary = [vocabulary_by_id[key] for key in sorted(vocabulary_by_id)]

    args.output_dir.mkdir(parents=True, exist_ok=True)
    _write(args.output_dir / "recipes.json", [r.model_dump(by_alias=True) for r in recipes])
    _write(args.output_dir / "ingredients.json", [v.model_dump(by_alias=True) for v in vocabulary])

    logger.info(
        "wrote %d recipes and %d ingredients (%d skipped)", len(recipes), len(vocabulary), skipped
    )
    _report_equipment_coverage(recipes)
    return 0


def _refresh_mealdb(limit: int | None) -> tuple[list[CatalogRecipe], int]:
    raw_meals = fetch_all_meals(limit=limit)
    logger.info("fetched %d meals", len(raw_meals))

    recipes: list[CatalogRecipe] = []
    skipped = 0
    for raw in raw_meals:
        try:
            recipes.append(to_catalog_recipe(raw))
        except ValidationError:
            # One bad record must not fail a 300-recipe build.
            skipped += 1
            logger.warning("skipping malformed meal %s", raw.get("idMeal", "<unknown>"))
    return recipes, skipped


def _write(path: Path, payload: object) -> None:
    # sort_keys and a trailing newline keep the committed diff readable.
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    logger.info("wrote %s", path)


def _report_equipment_coverage(recipes: list[CatalogRecipe]) -> None:
    """Surface how many recipes fell back to ``unclassified``.

    A high fallback rate means the keyword pass is not carrying the equipment
    wedge and the LLM enrichment step is doing real work, not decoration. These
    recipes are excluded from every user's results until enrichment classifies
    them, so this number is a backlog, not a statistic.
    """
    unclassified = sum(1 for r in recipes if r.equipment_required == ["unclassified"])
    logger.info(
        "equipment: %d/%d recipes unclassified (%.0f%%)",
        unclassified,
        len(recipes),
        100 * unclassified / len(recipes),
    )


if __name__ == "__main__":
    sys.exit(main())
