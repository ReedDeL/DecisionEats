"""Source extraction and review gates must never silently approve unknown data."""

import bz2
import json
import zipfile
from pathlib import Path

import pytest

from tools.catalog.import_sources import (
    Candidate,
    Review,
    checksum,
    historical_candidates,
    publish_reviews,
    wikibooks_candidates,
)
from tools.catalog.models import SourceRecipe
from tools.catalog.normalize import canonical_id
from tools.catalog.pipeline import rebuild_committed_catalog

ROOT = Path(__file__).parents[1]


def test_wikibooks_retains_exact_revision_and_skips_nonrecipes(tmp_path: Path) -> None:
    text = "== Ingredients ==\n* Rice\n== Procedure ==\n# Boil rice."
    archive = tmp_path / "dump.bz2"
    pages = "".join(
        f"<page><title>{title}</title>{redirect}<revision><id>{revision}</id>"
        f"<text>{body}</text></revision></page>"
        for title, revision, body, redirect in [
            ("Cookbook:Test", 11, text, ""),
            ("Cookbook:Redirect", 12, text, "<redirect title='Test'/>"),
            ("User:Test", 13, text, ""),
            ("Cookbook:Ingredient", 14, "An ingredient article.", ""),
            ("Cookbook:Second", 15, text, ""),
        ]
    )
    archive.write_bytes(
        bz2.compress(("<mediawiki xmlns='urn:mediawiki'>" + pages + "</mediawiki>").encode())
    )
    rows = list(wikibooks_candidates(archive, checksum(archive)))
    assert [row.id for row in rows] == ["wikibooks:11", "wikibooks:15"]
    assert rows[0].text == text
    assert "oldid=11" in rows[0].url
    assert rows[0].upstream_sha256 == checksum(archive)


def test_historical_extractor_skips_unlicensed_content_without_extracting(tmp_path: Path) -> None:
    row = dict(
        collection="book",
        slug="soup",
        title="Soup",
        author="Author",
        source_title="Book",
        source_year=1900,
        body="Directions",
        source_url="https://example.test/book",
        license="public-domain",
    )
    archive = tmp_path / "recipes.zip"
    with zipfile.ZipFile(archive, "w") as out:
        out.writestr(
            "../../recipes.jsonl",
            json.dumps(row) + "\n" + json.dumps({**row, "license": "unknown"}),
        )
    rows = list(historical_candidates(archive, checksum(archive)))
    assert len(rows) == 1
    assert rows[0].id == "historical:book:soup"
    assert not (tmp_path / "recipes.jsonl").exists()


def reviewed_pair() -> tuple[Candidate, Review]:
    candidate = Candidate(
        id="wikibooks:1",
        title="Rice",
        url="https://example.test/revision/1",
        license="CC BY-SA 4.0",
        attribution="Source contributors",
        text="Cook the rice.",
        upstream_sha256="a" * 64,
    )
    recipe = SourceRecipe.model_validate(
        {
            "sourceRecipeId": candidate.id,
            "sourceUrl": candidate.url,
            "title": "Rice",
            "ingredients": [{"name": "rice", "measure": "100 g"}],
            "instructions": "Boil rice until tender.",
            "totalTimeMinutes": 25,
            "equipment": ["stove"],
            "allergenStatus": "verified",
            "dietaryStatus": "verified",
            "mealSlots": ["dinner"],
            "baseServings": 2,
        }
    )
    return candidate, Review(
        candidate_id=candidate.id,
        fingerprint=candidate.fingerprint(),
        rationale="Explicitly reviewed source preparation.",
        recipe=recipe,
    )


def test_review_is_bound_to_source_text() -> None:
    candidate, review = reviewed_pair()
    assert publish_reviews([candidate], [review])[0].meal_slots == ["dinner"]
    candidate.text += " Changed ingredients."
    with pytest.raises(ValueError, match="stale"):
        publish_reviews([candidate], [review])


@pytest.mark.parametrize(
    "field,value",
    [
        ("source_url", "https://example.test/other"),
        ("allergen_status", "unknown"),
        ("equipment", ["unclassified"]),
        ("ingredients", []),
    ],
)
def test_review_rejects_lost_identity_or_hard_constraints(field: str, value: object) -> None:
    candidate, review = reviewed_pair()
    review.recipe = review.recipe.model_copy(update={field: value})
    with pytest.raises(ValueError):
        publish_reviews([candidate], [review])


def test_prepared_ingredients_are_not_raw_pantry_matches() -> None:
    assert canonical_id("fresh cooked chicken") == "cooked_chicken"
    for prepared, raw in [
        ("cooked_chicken", "chicken"),
        ("cooked_rice", "rice"),
        ("canned_black_beans", "black_beans"),
        ("ground_turkey", "turkey"),
    ]:
        assert canonical_id(prepared) == prepared
        assert canonical_id(prepared) != canonical_id(raw)


def test_committed_review_archives_reproduce_and_carry_meal_metadata(tmp_path: Path) -> None:
    for name, archive_name in [
        ("wikibooks-2026-09", "wikibooks-expanded-2026-09"),
        ("historical-2026-09", "historical-cookbooks-2026-09"),
    ]:
        candidates = [
            Candidate.model_validate_json(line)
            for line in (ROOT / "reviews" / name / "candidates.jsonl").read_text().splitlines()
        ]
        reviews = [
            Review.model_validate_json(line)
            for line in (ROOT / "reviews" / name / "reviews.jsonl").read_text().splitlines()
        ]
        generated = publish_reviews(candidates, reviews)
        committed = [
            SourceRecipe.model_validate_json(line)
            for line in (ROOT / "archives" / f"{archive_name}.jsonl").read_text().splitlines()
        ]
        assert generated == committed
    release = rebuild_committed_catalog(tmp_path)
    assert len(release.recipes) >= 2000
    assert len(release.vocabulary) >= 901
    assert not release.quarantine
    external = [
        row
        for row in release.recipes
        if row.attribution
        and row.attribution.source_id in {"wikibooks-expanded", "historical-cookbooks"}
    ]
    assert len(external) == 79
    assert all(row.meal_slots is not None for row in external)
    assert all(row.base_servings for row in external if row.meal_slots)
    assert all(row.attribution and row.attribution.attribution for row in external)
