"""End-to-end transformation tests over raw TheMealDB payloads."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from tools.catalog.build import (
    build_vocabulary,
    estimate_total_minutes,
    extract_ingredients,
    load_catalog_recipes,
    to_catalog_recipe,
)
from tools.catalog.models import EQUIPMENT_VALUES, CatalogRecipe


def make_meal(**overrides: Any) -> dict[str, Any]:
    """A minimal well-formed TheMealDB payload."""
    meal: dict[str, Any] = {
        "idMeal": "52959",
        "strMeal": "Baked Eggs",
        "strCategory": "Breakfast",
        "strArea": "American",
        "strInstructions": "Bake in the oven for 15 minutes.",
        "strMealThumb": "https://example.test/img.jpg",
        "strIngredient1": "Eggs",
        "strMeasure1": "2",
        "strIngredient2": "Butter",
        "strMeasure2": "1 tbsp",
    }
    for slot in range(3, 21):
        meal[f"strIngredient{slot}"] = ""
        meal[f"strMeasure{slot}"] = ""
    meal.update(overrides)
    return meal


class TestExtractIngredients:
    def test_unrolls_populated_slots(self) -> None:
        ingredients = extract_ingredients(make_meal())
        assert [i.id for i in ingredients] == ["egg", "butter"]

    def test_skips_blank_slots(self) -> None:
        assert len(extract_ingredients(make_meal())) == 2

    def test_attaches_allergen_groups(self) -> None:
        by_id = {i.id: i for i in extract_ingredients(make_meal())}
        assert "dairy" in by_id["butter"].allergen_groups
        assert "egg" in by_id["egg"].allergen_groups

    def test_deduplicates_ingredients_that_normalize_together(self) -> None:
        meal = make_meal(strIngredient1="Scallion", strIngredient2="spring onions")
        assert [i.id for i in extract_ingredients(meal)] == ["green_onion"]

    def test_falls_back_to_to_taste_for_a_missing_measure(self) -> None:
        meal = make_meal(strMeasure1="")
        assert extract_ingredients(meal)[0].measure == "to taste"

    # Boundary: a recipe with no ingredients at all.
    def test_handles_a_meal_with_zero_ingredients(self) -> None:
        meal = make_meal(strIngredient1="", strIngredient2="")
        assert extract_ingredients(meal) == []

    # Boundary: all 20 slots filled.
    def test_handles_all_twenty_slots_filled(self) -> None:
        meal = make_meal()
        for slot in range(1, 21):
            meal[f"strIngredient{slot}"] = f"ingredient {slot}"
            meal[f"strMeasure{slot}"] = "1 cup"
        assert len(extract_ingredients(meal)) == 20

    def test_ignores_a_slot_whose_value_is_not_a_string(self) -> None:
        meal = make_meal(strIngredient1=None, strIngredient2=42)
        assert extract_ingredients(meal) == []


class TestEstimateTotalMinutes:
    def test_reads_minutes_from_instructions(self) -> None:
        assert estimate_total_minutes("Bake for 25 minutes.") == 25

    def test_converts_hours(self) -> None:
        assert estimate_total_minutes("Simmer for 2 hours.") == 120

    def test_sums_multiple_durations(self) -> None:
        assert estimate_total_minutes("Fry 5 min, then bake 20 minutes.") == 25

    def test_falls_back_when_no_duration_is_mentioned(self) -> None:
        assert estimate_total_minutes("Mix and serve.") == 30

    def test_is_bounded_so_a_parse_accident_cannot_produce_a_week(self) -> None:
        assert estimate_total_minutes("Rest for 9999 hours.") == 6 * 60

    def test_is_always_positive(self) -> None:
        # total_time_minutes is constrained gt=0; a zero would fail validation.
        assert estimate_total_minutes("Takes 0 minutes.") > 0


class TestToCatalogRecipe:
    def test_maps_the_core_fields(self) -> None:
        recipe = to_catalog_recipe(make_meal())
        assert recipe.id == "52959"
        assert recipe.title == "Baked Eggs"
        assert recipe.cuisine == "american"
        assert recipe.source == "bundled"

    def test_equipment_is_inside_the_closed_enum(self) -> None:
        recipe = to_catalog_recipe(make_meal())
        assert set(recipe.equipment_required) <= EQUIPMENT_VALUES

    def test_leaves_dietary_tags_empty(self) -> None:
        # A wrong dietary tag ships a hard-constraint violation to the user.
        assert to_catalog_recipe(make_meal()).dietary_tags == []

    def test_normalises_blank_strings_to_none(self) -> None:
        recipe = to_catalog_recipe(make_meal(strArea="", strMealThumb="null"))
        assert recipe.cuisine is None
        assert recipe.image_url is None

    @pytest.mark.parametrize("missing", ["idMeal", "strMeal", "strInstructions"])
    def test_rejects_a_payload_missing_a_required_field(self, missing: str) -> None:
        meal = make_meal()
        del meal[missing]
        with pytest.raises(ValidationError):
            to_catalog_recipe(meal)

    def test_tolerates_unknown_extra_columns(self) -> None:
        # TheMealDB adds columns without warning; that must not break a build.
        recipe = to_catalog_recipe(make_meal(strBrandNewColumn="surprise"))
        assert recipe.id == "52959"

    def test_serialises_to_the_camel_case_shape_the_engine_reads(self) -> None:
        payload = to_catalog_recipe(make_meal()).model_dump(by_alias=True)
        for key in (
            "imageUrl",
            "totalTimeMinutes",
            "equipmentRequired",
            "dietaryTags",
            "baseServings",
            "energyKcalPerServing",
            "nutritionProvenance",
            "nutritionConfidence",
        ):
            assert key in payload

    def test_unknown_nutrition_serialises_to_safe_defaults(self) -> None:
        payload = to_catalog_recipe(make_meal()).model_dump(by_alias=True)
        assert payload["baseServings"] is None
        assert payload["energyKcalPerServing"] is None
        assert payload["nutritionProvenance"] is None
        assert payload["nutritionConfidence"] == "unavailable"

    @pytest.mark.parametrize("confidence", ["low", "unavailable"])
    def test_rejects_energy_that_cannot_be_used_for_guidance(self, confidence: str) -> None:
        payload = to_catalog_recipe(make_meal()).model_dump(by_alias=True)
        payload["energyKcalPerServing"] = 400
        payload["nutritionConfidence"] = confidence

        with pytest.raises(ValidationError):
            CatalogRecipe.model_validate(payload)

    def test_rejects_guidance_energy_without_normalization_provenance(self) -> None:
        payload = to_catalog_recipe(make_meal()).model_dump(by_alias=True)
        payload["energyKcalPerServing"] = 400
        payload["nutritionConfidence"] = "high"

        with pytest.raises(ValidationError):
            CatalogRecipe.model_validate(payload)


class TestBuildVocabulary:
    def test_collects_every_ingredient_once(self) -> None:
        recipes = [to_catalog_recipe(make_meal()), to_catalog_recipe(make_meal(idMeal="2"))]
        vocabulary = build_vocabulary(recipes)
        assert [entry.id for entry in vocabulary] == ["butter", "egg"]

    def test_is_deduplicated_by_id(self) -> None:
        recipes = [to_catalog_recipe(make_meal()) for _ in range(5)]
        ids = [entry.id for entry in build_vocabulary(recipes)]
        assert len(ids) == len(set(ids))

    def test_is_sorted_so_the_file_diff_is_stable(self) -> None:
        vocabulary = build_vocabulary([to_catalog_recipe(make_meal())])
        ids = [entry.id for entry in vocabulary]
        assert ids == sorted(ids)

    def test_carries_allergen_groups_and_staple_flags(self) -> None:
        meal = make_meal(strIngredient1="Salt", strIngredient2="Peanut")
        vocabulary = {e.id: e for e in build_vocabulary([to_catalog_recipe(meal)])}
        assert vocabulary["salt"].is_staple is True
        assert "nut" in vocabulary["peanuts"].allergen_groups

    def test_handles_an_empty_catalog(self) -> None:
        assert build_vocabulary([]) == []


def test_load_catalog_recipes_validates_the_committed_shape(tmp_path: Path) -> None:
    path = tmp_path / "recipes.json"
    path.write_text(
        json.dumps([to_catalog_recipe(make_meal()).model_dump(by_alias=True)]),
        encoding="utf-8",
    )

    recipes = load_catalog_recipes(path)

    assert [recipe.id for recipe in recipes] == ["52959"]
