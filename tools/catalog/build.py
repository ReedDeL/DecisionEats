"""Pure transforms from TheMealDB payloads to the bundled catalog.

Deliberately free of network calls so the whole transformation is testable
without touching the API or spending a request.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from pydantic import TypeAdapter

from tools.catalog.equipment import tag_from_text
from tools.catalog.measurements import parse_measure
from tools.catalog.models import (
    MEALDB_INGREDIENT_SLOTS,
    CatalogIngredient,
    CatalogRecipe,
    MealDbMeal,
    VocabularyEntry,
)
from tools.catalog.normalize import (
    allergen_groups_for,
    canonical_cuisine,
    canonical_id,
    display_name,
    is_staple,
)

_DURATION = re.compile(r"(\d+)\s*(hour|hr|minute|min)", re.IGNORECASE)

# Used only when the instructions mention no duration at all. Deliberately
# generous: under-stating time surfaces a recipe the user does not have time
# for, which is the failure the time-first product promise cannot afford.
_DEFAULT_MINUTES = 30
_MAX_MINUTES = 6 * 60

_CATALOG_ADAPTER = TypeAdapter(list[CatalogRecipe])


def load_catalog_recipes(path: Path) -> list[CatalogRecipe]:
    """Load the committed catalog as the default network-free build input."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    return _CATALOG_ADAPTER.validate_python(payload)


def extract_ingredients(raw: dict[str, object]) -> list[CatalogIngredient]:
    """Unroll TheMealDB's strIngredient1..20 / strMeasure1..20 columns.

    Ingredients that normalize to an empty id are dropped: a blank slot is how
    the API represents "no more ingredients", not an ingredient without a name.
    """
    ingredients: list[CatalogIngredient] = []
    seen: set[str] = set()

    for slot in range(1, MEALDB_INGREDIENT_SLOTS + 1):
        name_value = raw.get(f"strIngredient{slot}")
        if not isinstance(name_value, str):
            continue

        ingredient_id = canonical_id(name_value)
        if not ingredient_id or ingredient_id in seen:
            continue
        seen.add(ingredient_id)

        measure_value = raw.get(f"strMeasure{slot}")
        measure = parse_measure(measure_value if isinstance(measure_value, str) else None)

        ingredients.append(
            CatalogIngredient(
                id=ingredient_id,
                measure=measure.raw or "to taste",
                allergen_groups=allergen_groups_for(ingredient_id),
            )
        )

    return ingredients


def estimate_total_minutes(instructions: str) -> int:
    """Estimate cook time from instruction text.

    Sums every duration mentioned, which over-estimates for parallel steps and
    under-estimates for unstated ones. Bounded on both ends so a parsing
    accident cannot produce a recipe that is instant or takes a week.
    """
    total = 0
    for amount, unit in _DURATION.findall(instructions):
        value = int(amount)
        total += value * 60 if unit.lower() in {"hour", "hr"} else value

    if total <= 0:
        return _DEFAULT_MINUTES
    return min(total, _MAX_MINUTES)


def to_catalog_recipe(raw: dict[str, object]) -> CatalogRecipe:
    """Convert one raw TheMealDB meal into the bundled catalog shape.

    Raises ``pydantic.ValidationError`` when the payload is not a meal.
    """
    meal = MealDbMeal.model_validate(raw)
    ingredients = extract_ingredients(raw)

    return CatalogRecipe(
        id=meal.id,
        title=meal.name,
        image_url=meal.image_url,
        cuisine=canonical_cuisine(meal.area),
        total_time_minutes=estimate_total_minutes(meal.instructions),
        equipment_required=tag_from_text(meal.instructions, meal.category, meal.name),
        # Left empty on purpose. A wrong dietary tag is worse than an absent
        # one: dietary is a hard constraint, so a false "vegan" ships a
        # violation to the user. Populated only by a verified pass.
        dietary_tags=[],
        ingredients=ingredients,
        instructions=meal.instructions,
    )


def build_vocabulary(
    recipes: list[CatalogRecipe], seed_vocabulary: list[VocabularyEntry] | None = None
) -> list[VocabularyEntry]:
    """Collect the canonical ingredient vocabulary across the whole catalog.

    Keep seed-only pantry entries and canonicalize ingredients used by recipes.
    Output is sorted and deduplicated by id, so unchanged input is byte stable.
    """
    by_id = {entry.id: entry for entry in seed_vocabulary or []}
    ingredient_ids = {item.id for recipe in recipes for item in recipe.ingredients}
    for ingredient_id in ingredient_ids:
        by_id[ingredient_id] = VocabularyEntry(
            id=ingredient_id,
            display_name=display_name(ingredient_id),
            allergen_groups=allergen_groups_for(ingredient_id),
            is_staple=is_staple(ingredient_id),
        )

    return [by_id[key] for key in sorted(by_id)]
