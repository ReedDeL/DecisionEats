"""Check materialized preparations and the source archive boundary."""

import json
from pathlib import Path

from tools.catalog.meal_templates import BASES, FLAVORS, PROTEINS, VEGETABLES, generate_recipes
from tools.catalog.normalize import allergen_groups_for, canonical_id


def test_materialized_templates_are_complete_distinct_and_reproducible() -> None:
    rows = generate_recipes()
    assert len(rows) == len(BASES) * len(FLAVORS) * len(PROTEINS) * len(VEGETABLES) == 2160
    assert len({row.title for row in rows}) == len(rows)
    assert len({row.source_recipe_id for row in rows}) == len(rows)
    assert len({tuple(sorted(item.name for item in row.ingredients)) for row in rows}) == len(rows)
    archive = Path(__file__).parents[1] / "archives/homechef-templates-2026-09.jsonl"
    assert [json.loads(line) for line in archive.read_text().splitlines()] == [
        row.model_dump(by_alias=True) for row in rows
    ]
    for row in rows:
        assert row.equipment == ["stove"]
        assert row.meal_slots == ["lunch", "dinner"]
        assert row.total_time_minutes == 45
        assert row.base_servings == 2
        assert all(item.measure for item in row.ingredients)
        assert all(canonical_id(item.name) == item.name for item in row.ingredients)
        assert "individually kitchen-tested" in (row.attribution_text or "")
        if any(item.name in {"chicken_breast", "ground_turkey"} for item in row.ingredients):
            assert "165 F" in row.instructions
            assert "vegan" not in row.dietary_tags
        else:
            assert "vegan" in row.dietary_tags
        if any(
            item.name in {"canned_chickpeas", "canned_cannellini_beans", "canned_black_beans"}
            for item in row.ingredients
        ):
            assert "not dried beans" in row.instructions


def test_template_allergen_bearing_components_have_explicit_tags() -> None:
    for ingredient, groups in {
        "tofu": {"soy"},
        "peanut_butter": {"peanut"},
        "soy_sauce": {"soy", "gluten", "wheat"},
        "pasta": {"gluten", "wheat"},
        "couscous": {"gluten", "wheat"},
    }.items():
        assert groups <= set(allergen_groups_for(ingredient))
