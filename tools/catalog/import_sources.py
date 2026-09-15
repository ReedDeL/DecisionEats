"""Extract free archives offline; publish only fingerprint-bound reviewed recipes.

No network, API keys, model calls, or new dependencies. Raw candidates never
enter the app. A review supplies canonical ingredients, time, equipment, diet,
meal slots and complete adapted instructions for one exact source revision.
"""

from __future__ import annotations

import argparse
import bz2
import hashlib
import html
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from collections.abc import Iterator
from pathlib import Path
from urllib.parse import quote

from pydantic import BaseModel, Field

from tools.catalog.models import SourceRecipe


class Candidate(BaseModel):
    model_config = {"extra": "forbid"}

    id: str
    title: str
    url: str
    license: str
    attribution: str
    text: str
    upstream_sha256: str

    def fingerprint(self) -> str:
        return hashlib.sha256(
            json.dumps(self.model_dump(), sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest()


class Review(BaseModel):
    model_config = {"extra": "forbid"}

    candidate_id: str
    fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    rationale: str = Field(min_length=20)
    recipe: SourceRecipe


def checksum(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def wikibooks_candidates(path: Path, digest: str) -> Iterator[Candidate]:
    """Stream the official pages/articles dump and retain exact page revisions."""
    with bz2.open(path, "rb") as stream:
        context = ET.iterparse(stream, events=("start", "end"))
        _, root = next(context)
        for event, page in context:
            if event != "end" or page.tag.rsplit("}", 1)[-1] != "page":
                continue
            title = page.findtext("{*}title", "")
            text = page.findtext("{*}revision/{*}text", "")
            revision = page.findtext("{*}revision/{*}id", "")
            if (
                title.startswith("Cookbook:")
                and revision.isdecimal()
                and page.find("{*}redirect") is None
                and re.search(r"(?im)^=+\s*ingredients\s*=+", text)
                and re.search(r"(?im)^=+\s*(procedure|directions|preparation|method)\s*=+", text)
            ):
                yield Candidate(
                    id=f"wikibooks:{revision}",
                    title=title.removeprefix("Cookbook:"),
                    url=f"https://en.wikibooks.org/w/index.php?title={quote(title)}&oldid={revision}",
                    license="CC BY-SA 4.0",
                    attribution=f"Wikibooks contributors, {title}, revision {revision}.",
                    text=text,
                    upstream_sha256=digest,
                )
            root.clear()


def historical_candidates(path: Path, digest: str) -> Iterator[Candidate]:
    """Read JSONL inside a pinned repository zip without extracting any paths."""
    with zipfile.ZipFile(path) as archive:
        for name in sorted(archive.namelist()):
            if not name.endswith("/recipes.jsonl"):
                continue
            with archive.open(name) as stream:
                for line in stream:
                    raw = json.loads(line)
                    if raw.get("license") != "public-domain":
                        continue
                    url = raw.get("source_url", "")
                    if not url.startswith("https://"):
                        continue
                    yield Candidate(
                        id=f"historical:{raw['collection']}:{raw['slug']}",
                        title=raw["title"],
                        url=url,
                        license="Public domain (source verification required)",
                        attribution=(
                            f"{raw['author']}, {raw['source_title']} ({raw['source_year']})."
                        ),
                        text=raw["body"],
                        upstream_sha256=digest,
                    )


def plain_wikitext(text: str) -> str:
    """Readable review aid only; never used to infer a verified recipe."""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"\[\[(?:[^]|]*\|)?([^]]+)\]\]", r"\1", text)
    text = text.replace("'''", "").replace("''", "")
    return html.unescape(text)


def publish_reviews(candidates: list[Candidate], reviews: list[Review]) -> list[SourceRecipe]:
    """Fail closed on stale reviews, ambiguous identities and missing metadata."""
    by_id = {candidate.id: candidate for candidate in candidates}
    if len(by_id) != len(candidates):
        raise ValueError("duplicate candidate ids")
    seen: set[str] = set()
    recipes: list[SourceRecipe] = []
    for review in reviews:
        candidate = by_id[review.candidate_id]
        if candidate.id in seen:
            raise ValueError("duplicate recipe review")
        seen.add(candidate.id)
        if review.fingerprint != candidate.fingerprint():
            raise ValueError(f"stale source review: {candidate.id}")
        recipe = review.recipe
        if recipe.source_recipe_id != candidate.id or recipe.source_url != candidate.url:
            raise ValueError("recipe identity or URL does not match its reviewed source")
        if recipe.allergen_status != "verified" or recipe.dietary_status != "verified":
            raise ValueError("review must verify hard constraints")
        if not recipe.equipment or "unclassified" in recipe.equipment:
            raise ValueError("review must verify equipment")
        if not recipe.ingredients:
            raise ValueError("review must retain ingredients")
        recipes.append(recipe)
    return sorted(recipes, key=lambda recipe: recipe.source_recipe_id)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    extract = sub.add_parser("extract")
    extract.add_argument("kind", choices=("wikibooks", "historical"))
    extract.add_argument("archive", type=Path)
    extract.add_argument("--sha256", required=True)
    extract.add_argument("--output", type=Path, required=True)
    publish = sub.add_parser("publish")
    publish.add_argument("candidates", type=Path)
    publish.add_argument("reviews", type=Path)
    publish.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "extract":
        digest = checksum(args.archive)
        if digest != args.sha256:
            parser.error("upstream archive checksum mismatch")
        extractor = wikibooks_candidates if args.kind == "wikibooks" else historical_candidates
        rows = [item.model_dump() for item in extractor(args.archive, digest)]
        rows.sort(key=lambda row: str(row["id"]))
    else:
        candidates = [
            Candidate.model_validate_json(line)
            for line in args.candidates.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        reviews = [
            Review.model_validate_json(line)
            for line in args.reviews.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        rows = [row.model_dump(by_alias=True) for row in publish_reviews(candidates, reviews)]
    if args.output.exists():
        parser.error("output already exists; choose a new release path")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "".join(json.dumps(row, sort_keys=True, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )
    print(f"Wrote {len(rows)} records to {args.output}")


if __name__ == "__main__":
    main()
