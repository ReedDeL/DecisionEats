"""Checksum-pinned USDA nutrition enrichment for the owned catalog.

The cache checksum covers only the canonical ``foods`` payload. Including the
checksum field in its own digest would be self-referential, while hashing raw
file bytes would make harmless indentation changes invalidate provenance.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
from collections.abc import Mapping
from datetime import datetime
from pathlib import Path
from typing import Annotated, Literal, Self

import requests
from pydantic import AliasChoices, BaseModel, Field, field_validator, model_validator

from tools.catalog.measurements import parse_measure
from tools.catalog.models import CatalogRecipe, NutritionConfidence, NutritionProvenance

MAX_SAFE_INTEGER = 9_007_199_254_740_991

_CHECKSUM_PATTERN = re.compile(r"^[a-f0-9]{64}$")
_INGREDIENT_ID_PATTERN = re.compile(r"^[a-z0-9_]+$")
_STRICT_RFC3339_OFFSET = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}:\d{2}$"
)
_GRAMS_PER_UNIT: dict[str, float] = {
    "g": 1.0,
    "kg": 1_000.0,
    "oz": 28.349523125,
    "lb": 453.59237,
}
_ALIAS_SCORE = 0.9
_MEDIUM_CONFIDENCE_FLOOR = 0.8
_USDA_BASE_URL = "https://api.nal.usda.gov/fdc/v1"
_REQUEST_TIMEOUT_SECONDS = 20


class UsdaFood(BaseModel):
    """One approved canonical-ingredient-to-USDA mapping."""

    model_config = {"extra": "forbid", "populate_by_name": True}

    ingredient_id: str = Field(
        validation_alias=AliasChoices("ingredient_id", "ingredientId"),
        serialization_alias="ingredientId",
    )
    fdc_id: Annotated[int, Field(gt=0, le=MAX_SAFE_INTEGER)] = Field(
        validation_alias=AliasChoices("fdc_id", "fdcId"),
        serialization_alias="fdcId",
    )
    description: str = Field(min_length=1)
    aliases: list[str] = Field(default_factory=list)
    energy_kcal_per_100g: Annotated[float, Field(gt=0, allow_inf_nan=False)] = Field(
        validation_alias=AliasChoices("energy_kcal_per_100g", "energyKcalPer100g"),
        serialization_alias="energyKcalPer100g",
    )

    @field_validator("ingredient_id")
    @classmethod
    def _ingredient_id_is_canonical(cls, value: str) -> str:
        if _INGREDIENT_ID_PATTERN.fullmatch(value) is None:
            raise ValueError("ingredientId must be canonical")
        return value

    @field_validator("aliases")
    @classmethod
    def _aliases_are_canonical_and_stable(cls, value: list[str]) -> list[str]:
        if any(_INGREDIENT_ID_PATTERN.fullmatch(alias) is None for alias in value):
            raise ValueError("aliases must be canonical ingredient ids")
        if value != sorted(set(value)):
            raise ValueError("aliases must be unique and sorted")
        return value


class UsdaCacheMetadata(BaseModel):
    """Fields that make a fixed cache reproducible and auditable."""

    model_config = {"extra": "forbid", "populate_by_name": True}

    schema_version: Literal[1] = Field(
        validation_alias=AliasChoices("schema_version", "schemaVersion"),
        serialization_alias="schemaVersion",
    )
    source_version: str = Field(
        min_length=1,
        validation_alias=AliasChoices("source_version", "sourceVersion"),
        serialization_alias="sourceVersion",
    )
    calculated_at: str = Field(
        validation_alias=AliasChoices("calculated_at", "calculatedAt"),
        serialization_alias="calculatedAt",
    )
    payload_checksum: str = Field(
        validation_alias=AliasChoices("payload_checksum", "payloadChecksum"),
        serialization_alias="payloadChecksum",
    )

    @field_validator("calculated_at")
    @classmethod
    def _calculated_at_has_seconds_and_offset(cls, value: str) -> str:
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError as error:
            raise ValueError(
                "calculatedAt requires RFC3339 seconds and a numeric offset"
            ) from error
        if _STRICT_RFC3339_OFFSET.fullmatch(value) is None or parsed.utcoffset() is None:
            raise ValueError("calculatedAt requires RFC3339 seconds and a numeric offset")
        return value

    @field_validator("payload_checksum")
    @classmethod
    def _checksum_is_lowercase_sha256(cls, value: str) -> str:
        if _CHECKSUM_PATTERN.fullmatch(value) is None:
            raise ValueError("payloadChecksum must be lowercase SHA-256")
        return value


class UsdaCache(BaseModel):
    """Validated cache whose mappings cannot resolve ambiguously."""

    model_config = {"extra": "forbid"}

    foods: list[UsdaFood]
    metadata: UsdaCacheMetadata

    @model_validator(mode="after")
    def _mappings_are_unambiguous(self) -> Self:
        canonical_ids = [food.ingredient_id for food in self.foods]
        if len(canonical_ids) != len(set(canonical_ids)):
            raise ValueError("ingredientId mappings must be unique")

        fdc_ids = [food.fdc_id for food in self.foods]
        if len(fdc_ids) != len(set(fdc_ids)):
            raise ValueError("fdcId mappings must be unique")

        canonical_set = set(canonical_ids)
        seen_aliases: set[str] = set()
        for food in self.foods:
            for alias in food.aliases:
                if alias in canonical_set or alias in seen_aliases:
                    raise ValueError(f"alias collision: {alias}")
                seen_aliases.add(alias)
        return self


def load_usda_cache(path: Path) -> UsdaCache:
    """Parse a cache and reject any payload whose canonical digest drifted."""
    raw: object = json.loads(path.read_text(encoding="utf-8"))
    cache = UsdaCache.model_validate(raw)
    actual_checksum = _foods_checksum(cache.foods)
    if actual_checksum != cache.metadata.payload_checksum:
        raise ValueError(
            "USDA cache checksum mismatch: "
            f"expected {cache.metadata.payload_checksum}, calculated {actual_checksum}"
        )
    return cache


def serialize_usda_cache(cache: UsdaCache) -> str:
    """Serialize a validated cache with stable keys, indentation, and newline."""
    return (
        json.dumps(cache.model_dump(by_alias=True), indent=2, sort_keys=True, ensure_ascii=False)
        + "\n"
    )


def enrich_recipe(recipe: CatalogRecipe, cache: UsdaCache) -> CatalogRecipe:
    """Add safe per-serving energy without ever processing borrowed data."""
    exact, aliases = _food_indexes(cache)
    return _enrich_recipe(recipe, cache, exact, aliases)


def _food_indexes(cache: UsdaCache) -> tuple[dict[str, UsdaFood], dict[str, UsdaFood]]:
    return (
        {food.ingredient_id: food for food in cache.foods},
        {alias: food for food in cache.foods for alias in food.aliases},
    )


def _enrich_recipe(
    recipe: CatalogRecipe,
    cache: UsdaCache,
    exact: Mapping[str, UsdaFood],
    aliases: Mapping[str, UsdaFood],
) -> CatalogRecipe:
    if recipe.source != "bundled":
        raise ValueError("USDA enrichment accepts bundled catalog recipes only")

    accepted: list[tuple[UsdaFood, float, Literal["exact", "alias"]]] = []

    for ingredient in recipe.ingredients:
        food = exact.get(ingredient.id)
        match_method: Literal["exact", "alias"] = "exact"
        if food is None:
            food = aliases.get(ingredient.id)
            match_method = "alias"
        if food is None:
            continue
        grams = _measure_grams(ingredient.measure)
        if grams is not None:
            accepted.append((food, grams, match_method))

    if not accepted or not recipe.ingredients:
        return recipe.model_copy(
            update={
                "energy_kcal_per_serving": None,
                "nutrition_provenance": None,
                "nutrition_confidence": "unavailable",
            }
        )

    confidence = sum(1.0 if method == "exact" else _ALIAS_SCORE for _, _, method in accepted)
    confidence /= len(recipe.ingredients)
    categorical = _categorical_confidence(confidence)
    provenance = NutritionProvenance(
        usda_fdc_ids=sorted({food.fdc_id for food, _, _ in accepted}),
        cache_checksum=cache.metadata.payload_checksum,
        match_method="alias" if any(method == "alias" for _, _, method in accepted) else "exact",
        source_version=cache.metadata.source_version,
        calculated_at=cache.metadata.calculated_at,
        confidence=confidence,
    )

    energy: float | None = None
    if len(accepted) == len(recipe.ingredients) and recipe.base_servings is not None:
        whole_recipe_energy = sum(
            grams * food.energy_kcal_per_100g / 100 for food, grams, _ in accepted
        )
        normalized_energy = whole_recipe_energy / recipe.base_servings
        if math.isfinite(normalized_energy) and normalized_energy > 0:
            energy = normalized_energy

    return recipe.model_copy(
        update={
            "energy_kcal_per_serving": energy,
            "nutrition_provenance": provenance,
            "nutrition_confidence": categorical,
        }
    )


def enrich_recipes(recipes: list[CatalogRecipe], cache: UsdaCache) -> list[CatalogRecipe]:
    """Enrich an owned catalog without mutating its recipe ordering."""
    exact, aliases = _food_indexes(cache)
    return [_enrich_recipe(recipe, cache, exact, aliases) for recipe in recipes]


def refresh_usda_cache(
    path: Path,
    ingredient_ids: list[str],
    *,
    api_key: str | None = None,
) -> UsdaCache:
    """Explicitly refresh USDA data; this is the module's only network path."""
    key = api_key or os.environ.get("USDA_FDC_API_KEY")
    if key is None or not key.strip():
        raise ValueError("USDA_FDC_API_KEY is required to refresh the USDA cache")

    foods: list[UsdaFood] = []
    for ingredient_id in sorted(set(ingredient_ids)):
        food = _fetch_usda_food(ingredient_id, key)
        if food is not None:
            foods.append(food)

    calculated_at = datetime.now().astimezone().replace(microsecond=0).isoformat()
    cache = _build_cache(
        foods=foods,
        source_version="FoodData Central API v1",
        calculated_at=calculated_at,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(serialize_usda_cache(cache), encoding="utf-8")
    return cache


def _measure_grams(measure: str) -> float | None:
    parsed = parse_measure(measure)
    if parsed.quantity is None or parsed.quantity <= 0 or parsed.unit not in _GRAMS_PER_UNIT:
        return None
    grams = parsed.quantity * _GRAMS_PER_UNIT[parsed.unit]
    return grams if math.isfinite(grams) and grams > 0 else None


def _categorical_confidence(confidence: float) -> NutritionConfidence:
    if confidence == 1.0:
        return "high"
    if confidence >= _MEDIUM_CONFIDENCE_FLOOR:
        return "medium"
    return "low"


def _foods_checksum(foods: list[UsdaFood]) -> str:
    payload = [food.model_dump(by_alias=True) for food in foods]
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _build_cache(
    *,
    foods: list[UsdaFood],
    source_version: str,
    calculated_at: str,
) -> UsdaCache:
    stable_foods = sorted(foods, key=lambda food: food.ingredient_id)
    metadata = UsdaCacheMetadata(
        schema_version=1,
        source_version=source_version,
        calculated_at=calculated_at,
        payload_checksum=_foods_checksum(stable_foods),
    )
    return UsdaCache(foods=stable_foods, metadata=metadata)


def _fetch_usda_food(ingredient_id: str, api_key: str) -> UsdaFood | None:
    search_response = requests.get(
        f"{_USDA_BASE_URL}/foods/search",
        params={
            "api_key": api_key,
            "query": ingredient_id.replace("_", " "),
            "dataType": "Foundation,SR Legacy",
            "pageSize": "1",
        },
        timeout=_REQUEST_TIMEOUT_SECONDS,
    )
    search_response.raise_for_status()
    search_payload: object = search_response.json()
    fdc_id = _first_fdc_id(search_payload)
    if fdc_id is None:
        return None

    detail_response = requests.get(
        f"{_USDA_BASE_URL}/food/{fdc_id}",
        params={"api_key": api_key},
        timeout=_REQUEST_TIMEOUT_SECONDS,
    )
    detail_response.raise_for_status()
    detail_payload: object = detail_response.json()
    if not isinstance(detail_payload, dict):
        return None

    description = detail_payload.get("description")
    energy = _energy_kcal_per_100g(detail_payload.get("foodNutrients"))
    if not isinstance(description, str) or not description or energy is None:
        return None
    return UsdaFood(
        ingredient_id=ingredient_id,
        fdc_id=fdc_id,
        description=description,
        aliases=[],
        energy_kcal_per_100g=energy,
    )


def _first_fdc_id(payload: object) -> int | None:
    if not isinstance(payload, dict):
        return None
    foods = payload.get("foods")
    if not isinstance(foods, list) or not foods or not isinstance(foods[0], dict):
        return None
    value = foods[0].get("fdcId")
    if not isinstance(value, int) or isinstance(value, bool):
        return None
    return value if 0 < value <= MAX_SAFE_INTEGER else None


def _energy_kcal_per_100g(payload: object) -> float | None:
    if not isinstance(payload, list):
        return None
    for row in payload:
        if not isinstance(row, dict):
            continue
        nutrient = row.get("nutrient")
        if not isinstance(nutrient, dict):
            continue
        if nutrient.get("name") != "Energy":
            continue
        unit = nutrient.get("unitName")
        amount = row.get("amount")
        if not isinstance(unit, str) or unit.lower() != "kcal":
            continue
        if not isinstance(amount, (int, float)) or isinstance(amount, bool):
            continue
        energy = float(amount)
        return energy if math.isfinite(energy) and energy > 0 else None
    return None
