"""USDA bulk imports keep exact matches and decline missing or invalid energy."""

import json
import zipfile
from pathlib import Path

import pytest

from tools.catalog.import_sources import checksum
from tools.catalog.usda_bulk import BulkMapping, energy_kcal, import_bulk


def nutrient(identity: int, amount: float, unit: str = "kcal") -> dict[str, object]:
    return {"nutrient": {"id": identity, "unitName": unit}, "amount": amount}


def test_bulk_energy_prefers_specific_factors_and_rejects_invalid_values() -> None:
    assert energy_kcal([nutrient(2047, 106), nutrient(2048, 112)]) == 112
    assert energy_kcal([nutrient(1008, 106), nutrient(2047, 112)]) == 106
    assert energy_kcal([nutrient(1008, float("nan")), nutrient(1062, 440, "kJ")]) is None


def test_bulk_import_has_no_search_fallback(tmp_path: Path) -> None:
    archive = tmp_path / "usda.zip"
    with zipfile.ZipFile(archive, "w") as out:
        out.writestr(
            "foods.json",
            json.dumps(
                {
                    "FoundationFoods": [
                        None,
                        {
                            "fdcId": 1,
                            "description": "Chicken, raw",
                            "foodNutrients": [nutrient(2048, 112)],
                        },
                    ]
                }
            ),
        )
    mapping = BulkMapping(
        archive_sha256=checksum(archive),
        archive_member="foods.json",
        source_version="test",
        calculated_at="2026-09-09T00:00:00+00:00",
        foods={"chicken_breast": 1},
    )
    cache = import_bulk(archive, mapping)
    assert cache.foods[0].energy_kcal_per_100g == 112
    mapping.foods = {"chicken_breast": 2}
    with pytest.raises(ValueError, match="missing USDA food"):
        import_bulk(archive, mapping)
    mapping.archive_sha256 = "f" * 64
    with pytest.raises(ValueError, match="checksum"):
        import_bulk(archive, mapping)
