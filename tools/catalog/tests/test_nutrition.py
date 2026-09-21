"""Deterministic USDA nutrition enrichment over owned Tier 1 recipes."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from tools.catalog.models import CatalogIngredient, CatalogRecipe
from tools.catalog.nutrition import (
    MAX_SAFE_INTEGER,
    UsdaCache,
    enrich_recipe,
    enrich_recipes,
    load_usda_cache,
    refresh_usda_cache,
    serialize_usda_cache,
)

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "usda_foods.json"


def make_recipe(
    *ingredients: CatalogIngredient,
    base_servings: float | None = 1,
) -> CatalogRecipe:
    return CatalogRecipe(
        id="owned-1",
        title="Owned recipe",
        image_url=None,
        cuisine=None,
        total_time_minutes=10,
        equipment_required=["stove"],
        dietary_tags=[],
        ingredients=list(ingredients),
        instructions="Cook safely.",
        base_servings=base_servings,
    )


@pytest.fixture
def cache() -> UsdaCache:
    return load_usda_cache(FIXTURE_PATH)


def test_exact_matches_produce_high_confidence_per_serving_energy(cache: UsdaCache) -> None:
    recipe = make_recipe(
        CatalogIngredient(id="flour", measure="100 g"),
        CatalogIngredient(id="eggs", measure="200 g"),
        base_servings=2,
    )

    enriched = enrich_recipe(recipe, cache)

    assert enriched.energy_kcal_per_serving == pytest.approx(325.0)
    assert enriched.nutrition_confidence == "high"
    assert enriched.nutrition_provenance is not None
    assert enriched.nutrition_provenance.model_dump(by_alias=True) == {
        "usdaFdcIds": [168936, 171287],
        "cacheChecksum": cache.metadata.payload_checksum,
        "matchMethod": "exact",
        "sourceVersion": "FoodData Central 2026-08",
        "calculatedAt": "2026-08-22T12:00:00-07:00",
        "confidence": 1.0,
    }


def test_alias_match_produces_medium_confidence_and_alias_provenance(cache: UsdaCache) -> None:
    enriched = enrich_recipe(
        make_recipe(CatalogIngredient(id="egg", measure="100 g")),
        cache,
    )

    assert enriched.energy_kcal_per_serving == pytest.approx(143.0)
    assert enriched.nutrition_confidence == "medium"
    assert enriched.nutrition_provenance is not None
    assert enriched.nutrition_provenance.match_method == "alias"
    assert enriched.nutrition_provenance.confidence == pytest.approx(0.9)


def test_partial_match_keeps_provenance_but_suppresses_low_confidence_energy(
    cache: UsdaCache,
) -> None:
    enriched = enrich_recipe(
        make_recipe(
            CatalogIngredient(id="flour", measure="100 g"),
            CatalogIngredient(id="mystery", measure="100 g"),
        ),
        cache,
    )

    assert enriched.energy_kcal_per_serving is None
    assert enriched.nutrition_confidence == "low"
    assert enriched.nutrition_provenance is not None
    assert enriched.nutrition_provenance.usda_fdc_ids == [168936]
    assert enriched.nutrition_provenance.confidence == pytest.approx(0.5)


def test_fully_unmatched_recipe_has_unavailable_defaults(cache: UsdaCache) -> None:
    enriched = enrich_recipe(
        make_recipe(CatalogIngredient(id="mystery", measure="100 g")),
        cache,
    )

    assert enriched.energy_kcal_per_serving is None
    assert enriched.nutrition_provenance is None
    assert enriched.nutrition_confidence == "unavailable"


@pytest.mark.parametrize(
    ("measure", "expected_energy"),
    [
        ("100 g", 364.0),
        ("0.1 kg", 364.0),
        ("3.527396195 oz", 364.0),
        ("0.220462262 lb", 364.0),
    ],
)
def test_explicit_mass_units_are_normalized_safely(
    cache: UsdaCache,
    measure: str,
    expected_energy: float,
) -> None:
    enriched = enrich_recipe(
        make_recipe(CatalogIngredient(id="flour", measure=measure)),
        cache,
    )

    assert enriched.energy_kcal_per_serving == pytest.approx(expected_energy, rel=1e-8)


@pytest.mark.parametrize("measure", ["1 cup", "2", "1 slice", "to taste", "0 g", "-2 g"])
def test_unknown_or_unsafe_measures_are_never_guessed(cache: UsdaCache, measure: str) -> None:
    enriched = enrich_recipe(
        make_recipe(CatalogIngredient(id="flour", measure=measure)),
        cache,
    )

    assert enriched.energy_kcal_per_serving is None
    assert enriched.nutrition_confidence == "unavailable"
    assert enriched.nutrition_provenance is None


def test_overflowing_energy_is_suppressed_instead_of_serialized(cache: UsdaCache) -> None:
    enormous_grams = f"1{'0' * 308} g"

    enriched = enrich_recipe(
        make_recipe(CatalogIngredient(id="flour", measure=enormous_grams)),
        cache,
    )

    assert enriched.energy_kcal_per_serving is None


def test_missing_base_servings_suppresses_energy_but_retains_match_provenance(
    cache: UsdaCache,
) -> None:
    enriched = enrich_recipe(
        make_recipe(CatalogIngredient(id="flour", measure="100 g"), base_servings=None),
        cache,
    )

    assert enriched.energy_kcal_per_serving is None
    assert enriched.nutrition_confidence == "high"
    assert enriched.nutrition_provenance is not None


def test_rejects_borrowed_spoonacular_shaped_recipe_before_processing(cache: UsdaCache) -> None:
    borrowed = make_recipe(CatalogIngredient(id="flour", measure="100 g"))
    borrowed = borrowed.model_copy(update={"source": "spoonacular"})

    with pytest.raises(ValueError, match="bundled catalog"):
        enrich_recipe(borrowed, cache)


def test_rejects_a_cache_checksum_mismatch(tmp_path: Path) -> None:
    payload = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    payload["foods"][0]["energyKcalPer100g"] = 999.0
    tampered = tmp_path / "tampered.json"
    tampered.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(ValueError, match="checksum"):
        load_usda_cache(tampered)


@pytest.mark.parametrize(
    "mutation",
    [
        {"fdcId": 0},
        {"fdcId": MAX_SAFE_INTEGER + 1},
        {"aliases": ["flour"]},
    ],
)
def test_rejects_cache_values_that_cannot_satisfy_typescript_provenance(
    tmp_path: Path,
    cache: UsdaCache,
    mutation: dict[str, object],
) -> None:
    payload = cache.model_dump(by_alias=True)
    payload["foods"][1].update(mutation)
    invalid = tmp_path / "invalid.json"
    invalid.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(ValueError):
        load_usda_cache(invalid)


def test_rejects_alias_collisions_between_foods(tmp_path: Path, cache: UsdaCache) -> None:
    payload = cache.model_dump(by_alias=True)
    payload["foods"][0]["aliases"] = ["shared"]
    payload["foods"][1]["aliases"] = ["shared"]
    invalid = tmp_path / "invalid.json"
    invalid.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(ValueError, match="alias"):
        load_usda_cache(invalid)


@pytest.mark.parametrize(
    "calculated_at",
    [
        "2026-13-22T12:00:00-07:00",
        "2026-08-22T12:00:00Z",
        "2026-08-22T12:00-07:00",
    ],
)
def test_rejects_cache_timestamps_outside_strict_rfc3339_seconds_with_offset(
    tmp_path: Path,
    cache: UsdaCache,
    calculated_at: str,
) -> None:
    payload = cache.model_dump(by_alias=True)
    payload["metadata"]["calculatedAt"] = calculated_at
    invalid = tmp_path / "invalid.json"
    invalid.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(ValueError, match="calculatedAt"):
        load_usda_cache(invalid)


def test_accepts_fractional_rfc3339_seconds_with_numeric_offset(
    tmp_path: Path,
    cache: UsdaCache,
) -> None:
    payload = cache.model_dump(by_alias=True)
    payload["metadata"]["calculatedAt"] = "2026-08-22T12:00:00.123-07:00"
    valid = tmp_path / "valid.json"
    valid.write_text(json.dumps(payload), encoding="utf-8")

    loaded = load_usda_cache(valid)

    assert loaded.metadata.calculated_at == "2026-08-22T12:00:00.123-07:00"


def test_cache_serialization_is_byte_stable(cache: UsdaCache) -> None:
    assert serialize_usda_cache(cache) == serialize_usda_cache(cache)
    assert serialize_usda_cache(cache).endswith("\n")


def test_refresh_requires_a_real_api_key_without_touching_network(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.delenv("USDA_FDC_API_KEY", raising=False)
    with pytest.raises(ValueError, match="USDA_FDC_API_KEY"):
        refresh_usda_cache(tmp_path / "usda.json", ["flour"], api_key=None)


def test_refresh_searches_then_fetches_details_without_inventing_aliases(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    calls: list[str] = []

    class FakeResponse:
        def __init__(self, payload: dict[str, Any]) -> None:
            self.payload = payload

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, Any]:
            return self.payload

    def get(url: str, **_kwargs: object) -> FakeResponse:
        calls.append(url)
        if url.endswith("/foods/search"):
            return FakeResponse({"foods": [{"fdcId": 168936}]})
        return FakeResponse(
            {
                "fdcId": 168936,
                "description": "Wheat flour",
                "foodNutrients": [
                    {
                        "amount": 364.0,
                        "nutrient": {"name": "Energy", "unitName": "kcal"},
                    }
                ],
            }
        )

    monkeypatch.setattr("tools.catalog.nutrition.requests.get", get)
    path = tmp_path / "usda.json"

    cache = refresh_usda_cache(path, ["flour"], api_key="test-key")

    assert [food.ingredient_id for food in cache.foods] == ["flour"]
    assert cache.foods[0].aliases == []
    assert path.read_text(encoding="utf-8") == serialize_usda_cache(cache)
    assert calls == [
        "https://api.nal.usda.gov/fdc/v1/foods/search",
        "https://api.nal.usda.gov/fdc/v1/food/168936",
    ]


def test_confidence_is_always_finite_and_bounded(cache: UsdaCache) -> None:
    for ingredient_id in ("flour", "egg", "mystery"):
        enriched = enrich_recipe(
            make_recipe(CatalogIngredient(id=ingredient_id, measure="100 g")),
            cache,
        )
        provenance = enriched.nutrition_provenance
        if provenance is not None:
            assert 0.0 <= provenance.confidence <= 1.0


def test_batch_enrichment_preserves_order_inputs_and_match_confidence(cache: UsdaCache) -> None:
    recipes = [
        make_recipe(CatalogIngredient(id="egg", measure="100 g")),
        make_recipe(CatalogIngredient(id="flour", measure="100 g")),
        make_recipe(CatalogIngredient(id="mystery", measure="100 g")),
        make_recipe(CatalogIngredient(id="flour", measure="1 cup")),
        make_recipe(
            CatalogIngredient(id="flour", measure="100 g"),
            CatalogIngredient(id="mystery", measure="100 g"),
        ),
    ]
    for index, recipe in enumerate(recipes):
        recipe.id = str(index)
    original = [recipe.model_dump() for recipe in recipes]
    original_cache = cache.model_dump()

    enriched = enrich_recipes(recipes, cache)

    assert [recipe.id for recipe in enriched] == ["0", "1", "2", "3", "4"]
    assert [recipe.energy_kcal_per_serving for recipe in enriched] == [
        143.0,
        364.0,
        None,
        None,
        None,
    ]
    assert [recipe.nutrition_confidence for recipe in enriched] == [
        "medium",
        "high",
        "unavailable",
        "unavailable",
        "low",
    ]
    assert [recipe.model_dump() for recipe in recipes] == original
    assert cache.model_dump() == original_cache


def test_batch_enrichment_rebuilds_indexes_after_cache_changes(cache: UsdaCache) -> None:
    recipes = [make_recipe(CatalogIngredient(id="egg", measure="100 g"))]
    assert enrich_recipes(recipes, cache)[0].energy_kcal_per_serving == 143.0

    for food in cache.foods:
        food.aliases = []

    enriched = enrich_recipes(recipes, cache)[0]
    assert enriched.energy_kcal_per_serving is None
    assert enriched.nutrition_provenance is None
    assert enriched.nutrition_confidence == "unavailable"


def test_batch_enrichment_rejects_borrowed_recipes(cache: UsdaCache) -> None:
    recipe = make_recipe(CatalogIngredient(id="flour", measure="100 g"))
    borrowed = recipe.model_copy(update={"source": "spoonacular"})
    original = recipe.model_dump()

    with pytest.raises(ValueError, match="bundled catalog"):
        enrich_recipes([recipe, borrowed], cache)

    assert recipe.model_dump() == original
    assert enrich_recipes([], cache) == []
