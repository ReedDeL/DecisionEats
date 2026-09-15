"""Compile editorial selections into reproducible, source-bound review artifacts.

Selections are written by a reviewer after reading the source. They are not
predictions: every ingredient, instruction, time, appliance and meal slot is
specified explicitly. Source text and review fingerprints are retained.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from tools.catalog.import_sources import Candidate, Review, publish_reviews
from tools.catalog.models import SourceRecipe

type SelectionRow = tuple[
    str, int, float | None, str, str, str | None, str, str, Literal["", "v", "veg", "df"]
]


class Selection(BaseModel):
    model_config = {"extra": "forbid"}

    upstream_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    columns: list[str]
    recipes: list[SelectionRow]


def compile_selection(
    candidates: list[Candidate], selection: Selection
) -> tuple[list[Candidate], list[Review]]:
    by_id = {candidate.id: candidate for candidate in candidates}
    if len(by_id) != len(candidates):
        raise ValueError("duplicate candidate identities")
    evidence: list[Candidate] = []
    reviews: list[Review] = []
    diets = {
        "": [],
        "v": ["dairy_free", "vegan", "vegetarian"],
        "veg": ["vegetarian"],
        "df": ["dairy_free"],
    }
    for (
        identity,
        minutes,
        servings,
        equipment,
        slots,
        cuisine,
        ingredients,
        steps,
        diet,
    ) in selection.recipes:
        key = f"wikibooks:{identity}" if identity.isdecimal() else identity
        candidate = by_id[key]
        if candidate.upstream_sha256 != selection.upstream_sha256:
            raise ValueError("selection refers to a different upstream archive")
        parsed_ingredients = []
        for item in ingredients.split(";"):
            name, measure = item.split("|", 1)
            parsed_ingredients.append({"name": name, "measure": measure})
        recipe = SourceRecipe.model_validate(
            {
                "sourceRecipeId": key,
                "title": candidate.title,
                "sourceUrl": candidate.url,
                "attributionText": candidate.attribution
                + " Adapted by DecisionEats: ingredients, quantities, timings and instructions "
                "are clarified; optional variations are resolved in this preparation.",
                "ingredients": parsed_ingredients,
                "instructions": steps,
                "totalTimeMinutes": minutes,
                "baseServings": servings,
                "equipment": equipment.split(","),
                "mealSlots": slots.split(",") if slots else [],
                "cuisine": cuisine,
                "allergenStatus": "verified",
                "dietaryStatus": "verified",
                "dietaryTags": diets[diet],
            }
        )
        evidence.append(candidate)
        reviews.append(
            Review(
                candidate_id=key,
                fingerprint=candidate.fingerprint(),
                rationale="Source preparation reviewed; canonical ingredients and allergens, "
                "equipment, complete instructions, practical time and meal suitability checked. "
                "No dietary certification inferred; unspecified tags remain excluded.",
                recipe=recipe,
            )
        )
    publish_reviews(evidence, reviews)
    return sorted(evidence, key=lambda row: row.id), sorted(
        reviews, key=lambda row: row.candidate_id
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidates", type=Path)
    parser.add_argument("selection", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("output already exists; choose a new review directory")
    candidates = [
        Candidate.model_validate_json(line)
        for line in args.candidates.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    selection = Selection.model_validate_json(args.selection.read_text(encoding="utf-8"))
    evidence, reviews = compile_selection(candidates, selection)
    args.output.mkdir(parents=True)
    for name, rows in (("candidates", evidence), ("reviews", reviews)):
        (args.output / f"{name}.jsonl").write_text(
            "".join(row.model_dump_json(by_alias=True) + "\n" for row in rows),
            encoding="utf-8",
        )
    print(f"Retained {len(reviews)} source-bound editorial reviews")


if __name__ == "__main__":
    main()
