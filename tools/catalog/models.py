"""Typed boundaries for the catalog pipeline.

TheMealDB returns everything as strings, including nulls as ``""`` or ``None``
inconsistently. Parsing at the boundary means the rest of the pipeline works
with real types instead of defensively re-checking every field.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import AliasChoices, BaseModel, Field, field_validator, model_validator

# The closed enumeration from Technical Spec §5.2 step 4. Closed is what
# makes the engine's equipment filter a set operation rather than a
# string-matching problem, so nothing may emit a value outside this list.
Equipment = Literal[
    "microwave",
    "stove",
    "oven",
    "air_fryer",
    "kettle",
    "blender",
    "rice_cooker",
    "toaster_oven",
    "none",
    # Distinct from "none". "none" is a verified claim that a recipe needs no
    # equipment; "unclassified" means tagging failed and we do not know. Writing
    # them the same way is what served stove recipes to microwave-only users.
    "unclassified",
]

EQUIPMENT_VALUES: frozenset[str] = frozenset(
    {
        "microwave",
        "stove",
        "oven",
        "air_fryer",
        "kettle",
        "blender",
        "rice_cooker",
        "toaster_oven",
        "none",
        "unclassified",
    }
)

DietaryTag = Literal[
    "vegetarian",
    "vegan",
    "gluten_free",
    "dairy_free",
    "halal",
    "kosher",
    "pescatarian",
    "keto",
]

NutritionConfidence = Literal["high", "medium", "low", "unavailable"]

_STRICT_RFC3339_OFFSET = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}:\d{2}$"
)

# TheMealDB unrolls ingredients across numbered columns rather than nesting them.
MEALDB_INGREDIENT_SLOTS = 20


class MealDbMeal(BaseModel):
    """One meal exactly as TheMealDB returns it.

    Extra keys are tolerated because the API adds columns without warning; a
    missing *required* key is an error, because it means the shape changed.
    """

    model_config = {"extra": "allow", "populate_by_name": True}

    id: str = Field(alias="idMeal")
    name: str = Field(alias="strMeal")
    category: str | None = Field(default=None, alias="strCategory")
    # TheMealDB migrated origin from strArea to strCountry without notice;
    # accepting both keeps cuisine populated instead of silently nulling a
    # quarter of the catalog.
    area: str | None = Field(default=None, validation_alias=AliasChoices("strArea", "strCountry"))
    instructions: str = Field(alias="strInstructions")
    image_url: str | None = Field(default=None, alias="strMealThumb")

    @field_validator("category", "area", "image_url", mode="before")
    @classmethod
    def _blank_to_none(cls, value: object) -> object:
        """TheMealDB uses "" and "null" where it means null."""
        if isinstance(value, str) and value.strip().lower() in {"", "null"}:
            return None
        return value


class ParsedMeasure(BaseModel):
    """A measurement split into parts, with the original always preserved."""

    quantity: float | None = None
    unit: str | None = None
    raw: str

    @property
    def is_parsed(self) -> bool:
        return self.quantity is not None


class CatalogIngredient(BaseModel):
    """One ingredient reference inside a recipe.

    The alias is not cosmetic. Without it this serialises as ``allergen_groups``
    while the TypeScript adapter reads ``allergenGroups``, so every ingredient
    arrives with an empty group list and the allergen filter silently matches
    nothing — 267 dairy recipes were being served to users who declared a dairy
    allergy. A missing alias here is a safety incident, not a style slip.
    """

    model_config = {"populate_by_name": True}

    id: str
    measure: str = ""
    raw_measure: str = Field(
        default="",
        validation_alias=AliasChoices("raw_measure", "rawMeasure"),
        serialization_alias="rawMeasure",
    )
    quantity: float | None = None
    unit: str | None = None
    allergen_groups: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("allergen_groups", "allergenGroups"),
        serialization_alias="allergenGroups",
    )

    @model_validator(mode="after")
    def _sync_measures(self) -> Self:
        if not self.measure and self.raw_measure:
            self.measure = self.raw_measure
        elif not self.raw_measure and self.measure:
            self.raw_measure = self.measure
        return self


class NutritionProvenance(BaseModel):
    """Audit trail for one deterministic USDA enrichment result."""

    model_config = {"extra": "forbid", "populate_by_name": True}

    usda_fdc_ids: list[Annotated[int, Field(gt=0, le=9_007_199_254_740_991)]] = Field(
        min_length=1,
        validation_alias=AliasChoices("usda_fdc_ids", "usdaFdcIds"),
        serialization_alias="usdaFdcIds",
    )
    cache_checksum: str = Field(
        pattern=r"^[a-f0-9]{64}$",
        validation_alias=AliasChoices("cache_checksum", "cacheChecksum"),
        serialization_alias="cacheChecksum",
    )
    match_method: Literal["exact", "alias"] = Field(
        validation_alias=AliasChoices("match_method", "matchMethod"),
        serialization_alias="matchMethod",
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
    confidence: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]

    @field_validator("usda_fdc_ids")
    @classmethod
    def _ids_are_unique_and_sorted(cls, value: list[int]) -> list[int]:
        if value != sorted(set(value)):
            raise ValueError("USDA FDC ids must be unique and ascending")
        return value

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


class RecipeAttribution(BaseModel):
    """Rights metadata retained with each bundled recipe."""

    model_config = {"extra": "forbid", "populate_by_name": True}

    source_id: str = Field(
        validation_alias=AliasChoices("source_id", "sourceId"), serialization_alias="sourceId"
    )
    source_version: str = Field(
        validation_alias=AliasChoices("source_version", "sourceVersion"),
        serialization_alias="sourceVersion",
    )
    source_recipe_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("source_recipe_id", "sourceRecipeId"),
        serialization_alias="sourceRecipeId",
    )
    attribution: str
    url: str
    license_name: str | None = Field(
        default=None,
        validation_alias=AliasChoices("license_name", "licenseName"),
        serialization_alias="licenseName",
    )
    license_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("license_url", "licenseUrl"),
        serialization_alias="licenseUrl",
    )


class CatalogRecipe(BaseModel):
    """The shape emitted to ``src/data/recipes.json``.

    Field names are camelCase because this file is consumed directly by the
    TypeScript engine, whose ``Recipe`` type this must satisfy exactly.
    """

    model_config = {"extra": "forbid", "populate_by_name": True}

    id: str
    title: str
    image_url: str | None = Field(
        validation_alias=AliasChoices("image_url", "imageUrl"),
        serialization_alias="imageUrl",
    )
    cuisine: str | None
    total_time_minutes: Annotated[int, Field(gt=0)] = Field(
        validation_alias=AliasChoices("total_time_minutes", "totalTimeMinutes"),
        serialization_alias="totalTimeMinutes",
    )
    equipment_required: list[Equipment] = Field(
        validation_alias=AliasChoices("equipment_required", "equipmentRequired"),
        serialization_alias="equipmentRequired",
    )
    dietary_tags: list[DietaryTag] = Field(
        validation_alias=AliasChoices("dietary_tags", "dietaryTags"),
        serialization_alias="dietaryTags",
    )
    ingredients: list[CatalogIngredient]
    instructions: str
    allergen_status: SafetyStatus = Field(
        default="verified",
        validation_alias=AliasChoices("allergen_status", "allergenStatus"),
        serialization_alias="allergenStatus",
    )
    dietary_status: SafetyStatus = Field(
        default="verified",
        validation_alias=AliasChoices("dietary_status", "dietaryStatus"),
        serialization_alias="dietaryStatus",
    )
    provenance: list[Provenance] = Field(
        default_factory=list,
        validation_alias=AliasChoices("provenance", "provenance"),
        serialization_alias="provenance",
    )
    base_servings: Annotated[float, Field(gt=0, allow_inf_nan=False)] | None = Field(
        default=None,
        validation_alias=AliasChoices("base_servings", "baseServings"),
        serialization_alias="baseServings",
    )
    energy_kcal_per_serving: Annotated[float, Field(gt=0, allow_inf_nan=False)] | None = Field(
        default=None,
        validation_alias=AliasChoices("energy_kcal_per_serving", "energyKcalPerServing"),
        serialization_alias="energyKcalPerServing",
    )
    nutrition_provenance: NutritionProvenance | None = Field(
        default=None,
        validation_alias=AliasChoices("nutrition_provenance", "nutritionProvenance"),
        serialization_alias="nutritionProvenance",
    )
    nutrition_confidence: NutritionConfidence = Field(
        default="unavailable",
        validation_alias=AliasChoices("nutrition_confidence", "nutritionConfidence"),
        serialization_alias="nutritionConfidence",
    )
    source: Literal["bundled"] = "bundled"
    attribution: RecipeAttribution | None = None
    meal_slots: list[Literal["breakfast", "lunch", "dinner"]] | None = Field(
        default=None, alias="mealSlots"
    )

    @model_validator(mode="after")
    def _nutrition_is_coherent(self) -> Self:
        if (
            self.nutrition_confidence in {"low", "unavailable"}
            and self.energy_kcal_per_serving is not None
        ):
            raise ValueError("low or unavailable nutrition cannot carry per-serving energy")
        if self.energy_kcal_per_serving is not None and (
            self.base_servings is None or self.nutrition_provenance is None
        ):
            raise ValueError("per-serving energy requires base servings and USDA provenance")
        return self


class VocabularyEntry(BaseModel):
    """One row of ``src/data/ingredients.json`` — the canonical vocabulary.

    This list is the shared language between the vision pipeline, the pantry,
    and the decision engine, so an error here propagates everywhere.
    """

    model_config = {"populate_by_name": True}

    id: str
    display_name: str = Field(
        validation_alias=AliasChoices("display_name", "displayName"),
        serialization_alias="displayName",
    )
    allergen_groups: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("allergen_groups", "allergenGroups"),
        serialization_alias="allergenGroups",
    )
    is_staple: bool = Field(
        default=False,
        validation_alias=AliasChoices("is_staple", "isStaple"),
        serialization_alias="isStaple",
    )


SafetyStatus = Literal["verified", "unknown"]


class SourceIngredient(BaseModel):
    """One source archive ingredient; extra keys are a contract violation."""

    model_config = {"extra": "forbid", "populate_by_name": True}

    name: str
    measure: str = ""

    @field_validator("name")
    @classmethod
    def require_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("ingredient name must not be blank")
        return value.strip()


class SourceRecipe(BaseModel):
    """The single neutral JSONL record format accepted by this pipeline."""

    model_config = {"extra": "forbid", "populate_by_name": True}

    source_recipe_id: str = Field(alias="sourceRecipeId")
    title: str
    instructions: str
    ingredients: list[SourceIngredient]
    cuisine: str | None = None
    total_time_minutes: Annotated[int, Field(gt=0)] = Field(alias="totalTimeMinutes")
    image_url: str | None = Field(default=None, alias="imageUrl")
    equipment: list[Equipment]
    allergen_status: SafetyStatus = Field(alias="allergenStatus")
    dietary_status: SafetyStatus = Field(alias="dietaryStatus")
    dietary_tags: list[DietaryTag] = Field(default_factory=list, alias="dietaryTags")
    source_url: str | None = Field(default=None, alias="sourceUrl")
    attribution_text: str | None = Field(default=None, alias="attributionText")
    base_servings: Annotated[float, Field(gt=0, allow_inf_nan=False)] | None = Field(
        default=None, alias="baseServings"
    )
    meal_slots: list[Literal["breakfast", "lunch", "dinner"]] | None = Field(
        default=None, alias="mealSlots"
    )

    @field_validator("source_recipe_id", "title", "instructions")
    @classmethod
    def require_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value.strip()

    @field_validator("cuisine", "image_url", mode="before")
    @classmethod
    def blank_to_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value


class Provenance(BaseModel):
    """A source row retained after recipes from different archives coalesce."""

    model_config = {"extra": "forbid", "populate_by_name": True}

    source_id: str = Field(
        validation_alias=AliasChoices("source_id", "sourceId"), serialization_alias="sourceId"
    )
    source_version: str = Field(
        validation_alias=AliasChoices("source_version", "sourceVersion"),
        serialization_alias="sourceVersion",
    )
    source_recipe_id: str = Field(
        validation_alias=AliasChoices("source_recipe_id", "sourceRecipeId"),
        serialization_alias="sourceRecipeId",
    )
    archive_sha256: str = Field(
        validation_alias=AliasChoices("archive_sha256", "archiveSha256"),
        serialization_alias="archiveSha256",
    )
