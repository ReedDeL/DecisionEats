"""Import explicitly mapped foods from a checksum-pinned USDA bulk JSON ZIP.

This command has no network path and needs no API key. An FDC ID is chosen
editorially; missing foods or energy fail instead of falling back to search.
"""

from __future__ import annotations

import argparse
import json
import math
import zipfile
from pathlib import Path

from pydantic import BaseModel, Field

from tools.catalog.import_sources import checksum
from tools.catalog.nutrition import UsdaCache, UsdaFood, _build_cache, serialize_usda_cache


class BulkMapping(BaseModel):
    model_config = {"extra": "forbid"}

    archive_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_version: str
    calculated_at: str
    archive_member: str
    foods: dict[str, int]


def energy_kcal(nutrients: object) -> float | None:
    """Prefer specific Atwater energy, then published Energy, then general factors."""
    if not isinstance(nutrients, list):
        return None
    values: dict[int, float] = {}
    for row in nutrients:
        if not isinstance(row, dict):
            continue
        nutrient = row.get("nutrient")
        if not isinstance(nutrient, dict):
            continue
        identity, amount = nutrient.get("id"), row.get("amount")
        if (
            identity not in (1008, 2047, 2048)
            or str(nutrient.get("unitName", "")).lower() != "kcal"
            or not isinstance(amount, (int, float))
            or isinstance(amount, bool)
        ):
            continue
        if math.isfinite(amount) and amount > 0:
            values[identity] = float(amount)
    return next((values[key] for key in (2048, 1008, 2047) if key in values), None)


def import_bulk(archive: Path, mapping: BulkMapping) -> UsdaCache:
    if checksum(archive) != mapping.archive_sha256:
        raise ValueError("USDA archive checksum mismatch")
    with zipfile.ZipFile(archive) as source:
        payload = json.loads(source.read(mapping.archive_member))
    rows = payload.get("FoundationFoods")
    if not isinstance(rows, list):
        raise ValueError("expected USDA FoundationFoods list")
    by_id = {}
    for row in rows:
        if not isinstance(row, dict):
            continue  # Published files can contain null placeholders.
        identity = row.get("fdcId")
        if identity in by_id:
            raise ValueError("duplicate USDA FDC ID")
        by_id[identity] = row
    foods = []
    for ingredient, identity in sorted(mapping.foods.items()):
        row = by_id.get(identity)
        if row is None:
            raise ValueError(f"missing USDA food: {identity}")
        energy = energy_kcal(row.get("foodNutrients"))
        if energy is None:
            raise ValueError(f"missing published kcal energy: {identity}")
        foods.append(
            UsdaFood(
                ingredient_id=ingredient,
                fdc_id=identity,
                description=row["description"],
                energy_kcal_per_100g=energy,
            )
        )
    return _build_cache(
        foods=foods, source_version=mapping.source_version, calculated_at=mapping.calculated_at
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("mapping", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("output exists; choose a new cache version")
    mapping = BulkMapping.model_validate_json(args.mapping.read_text(encoding="utf-8"))
    cache = import_bulk(args.archive, mapping)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(serialize_usda_cache(cache), encoding="utf-8")
    print(f"Wrote {len(cache.foods)} explicitly mapped USDA foods")


if __name__ == "__main__":
    main()
