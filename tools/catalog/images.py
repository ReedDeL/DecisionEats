"""Build presentation-only mappings from reviewed, pinned Commons photographs."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

import requests
from pydantic import BaseModel, ConfigDict, Field, model_validator

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "tools/catalog/image-manifest.json"
ASSETS = ROOT / "assets/food-images"
MAX_BYTES = 1_000_000
USER_AGENT = "HomeChefImageCatalog/0.2 (https://github.com/ReedDeL/HomeChef)"


def trusted_url(url: str, hosts: set[str]) -> bool:
    parsed = urlsplit(url)
    return (
        parsed.scheme == "https"
        and parsed.hostname in hosts
        and parsed.username is None
        and parsed.password is None
        and parsed.port in (None, 443)
    )


class ImageAsset(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    ingredient_ids: list[str] = Field(min_length=1)
    title: str = Field(min_length=1)
    source_url: str
    thumbnail_url: str
    author: str = Field(min_length=1)
    credit: str
    license: str
    license_url: str
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    local_file: str = Field(pattern=r"^[a-z][a-z0-9_]*\.(jpg|png)$")
    reviewed: bool
    review_note: str = Field(min_length=10)

    @model_validator(mode="after")
    def approved(self) -> ImageAsset:
        if not self.reviewed:
            raise ValueError("Image has not passed visual and rights review")
        if not trusted_url(self.source_url, {"commons.wikimedia.org"}):
            raise ValueError("Expected a Wikimedia Commons source page")
        if not urlsplit(self.source_url).path.startswith("/wiki/File:"):
            raise ValueError("Source must identify the original file page")
        if not trusted_url(self.thumbnail_url, {"thumb.wikimedia.org", "upload.wikimedia.org"}):
            raise ValueError("Expected a Wikimedia thumbnail URL")
        match = re.fullmatch(r"CC BY(-SA)? (2\.0|2\.5|3\.0|4\.0)", self.license)
        if match:
            kind = "by-sa" if match[1] else "by"
            expected = f"/licenses/{kind}/{match[2]}"
            if (
                not trusted_url(self.license_url, {"creativecommons.org"})
                or urlsplit(self.license_url).path.rstrip("/") != expected
            ):
                raise ValueError("License URL does not match the approved license")
        elif self.license == "CC0":
            if self.license_url.rstrip("/") != (
                "https://creativecommons.org/publicdomain/zero/1.0"
            ):
                raise ValueError("Expected the CC0 license")
        elif self.license == "Public domain":
            if self.license_url != ("https://commons.wikimedia.org/wiki/Commons:Public_domain"):
                raise ValueError("Public-domain evidence belongs on the file page")
        else:
            raise ValueError("License is outside the commercial-reuse allowlist")
        return self


def load_manifest(path: Path = MANIFEST) -> list[ImageAsset]:
    rows = json.loads(path.read_text(encoding="utf-8-sig"))
    assets = [ImageAsset.model_validate(row) for row in rows]
    for attribute in ("key", "local_file"):
        values = [getattr(asset, attribute) for asset in assets]
        if len(values) != len(set(values)):
            raise ValueError(f"Duplicate image {attribute}")
    ids = [ingredient for asset in assets for ingredient in asset.ingredient_ids]
    if len(ids) != len(set(ids)):
        raise ValueError("An ingredient has more than one approved photo")
    return assets


def verify_bytes(asset: ImageAsset, data: bytes) -> None:
    if not data or len(data) > MAX_BYTES:
        raise ValueError(f"Invalid image size: {asset.key}")
    signature = b"\xff\xd8\xff" if asset.local_file.endswith(".jpg") else b"\x89PNG\r\n\x1a\n"
    if not data.startswith(signature):
        raise ValueError(f"Unexpected image format: {asset.key}")
    if hashlib.sha256(data).hexdigest() != asset.sha256:
        raise ValueError(f"Image checksum changed: {asset.key}; review a new version")


def fetch_asset(asset: ImageAsset, destination: Path) -> None:
    """Fetch pinned bytes only; redirects or changed files require a new review."""
    with requests.get(
        asset.thumbnail_url,
        headers={"User-Agent": USER_AGENT},
        timeout=(10, 30),
        allow_redirects=False,
        stream=True,
    ) as response:
        if response.status_code != 200:
            raise ValueError(f"Image download returned {response.status_code}")
        chunks: list[bytes] = []
        size = 0
        for chunk in response.iter_content(65536):
            size += len(chunk)
            if size > MAX_BYTES:
                raise ValueError("Image download exceeds the size limit")
            chunks.append(chunk)
    data = b"".join(chunks)
    verify_bytes(asset, data)
    destination.write_bytes(data)


def build(root: Path = ROOT) -> dict[str, int]:
    assets = load_manifest(root / "tools/catalog/image-manifest.json")
    vocabulary = json.loads((root / "src/data/ingredients.json").read_text())
    known_ids = {ingredient["id"] for ingredient in vocabulary}
    ingredient_photos: dict[str, str] = {}
    for asset in assets:
        verify_bytes(asset, (root / "assets/food-images" / asset.local_file).read_bytes())
        for ingredient_id in asset.ingredient_ids:
            if ingredient_id not in known_ids:
                raise ValueError(f"Unknown ingredient: {ingredient_id}")
            ingredient_photos[ingredient_id] = asset.key

    recipes = json.loads((root / "src/data/recipes.json").read_text())
    previews: dict[str, list[str]] = {}
    # Use explicit ingredient IDs in recipe order, never a title guess.
    minor = {"olive_oil", "salt", "black_pepper", "garlic"}
    for recipe in recipes:
        keys = list(
            dict.fromkeys(
                ingredient_photos[item["id"]]
                for item in recipe["ingredients"]
                if item["id"] in ingredient_photos and item["id"] not in minor
            )
        )[:3]
        if keys:
            previews[recipe["id"]] = keys

    imports = [
        f"import {asset.key} from '../../assets/food-images/{asset.local_file}';"
        for asset in assets
    ]
    exports = ["", "export const FOOD_IMAGE_SOURCES = {"]
    exports += [f"  {asset.key}," for asset in assets]
    exports += ["} as const;", ""]
    (root / "src/data/food-image-sources.ts").write_text("\n".join(imports + exports))
    (root / "src/data/food-image-credits.json").write_text(
        json.dumps([asset.model_dump() for asset in assets], ensure_ascii=False, indent=2) + "\n"
    )
    (root / "src/data/recipe-image-previews.json").write_text(
        "{\n"
        + ",\n".join(
            f"  {json.dumps(key)}: {json.dumps(value)}" for key, value in sorted(previews.items())
        )
        + "\n}\n"
    )
    return {
        "photos": len(assets),
        "ingredients": len(ingredient_photos),
        "recipe_previews": len(previews),
        "bytes": sum(
            (root / "assets/food-images" / asset.local_file).stat().st_size for asset in assets
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["build", "verify", "fetch"])
    args = parser.parse_args()
    assets = load_manifest()
    if args.command == "fetch":
        ASSETS.mkdir(parents=True, exist_ok=True)
        for asset in assets:
            destination = ASSETS / asset.local_file
            if not destination.exists():
                fetch_asset(asset, destination)
            verify_bytes(asset, destination.read_bytes())
    elif args.command == "verify":
        for asset in assets:
            verify_bytes(asset, (ASSETS / asset.local_file).read_bytes())
        print(f"Verified {len(assets)} reviewed photos")
    else:
        print(json.dumps(build(), indent=2))


if __name__ == "__main__":
    main()
