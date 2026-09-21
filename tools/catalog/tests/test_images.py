from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import pytest

from tools.catalog.images import ImageAsset, build, load_manifest, trusted_url, verify_bytes


def approved() -> ImageAsset:
    return load_manifest()[0]


@pytest.mark.parametrize("license_name", ["CC BY-NC 4.0", "All rights reserved", "GFDL", ""])
def test_unapproved_licenses_cannot_ship(license_name: str) -> None:
    row = approved().model_dump()
    row["license"] = license_name
    with pytest.raises(ValueError):
        ImageAsset.model_validate(row)


def test_review_is_required_even_for_a_free_license() -> None:
    row = approved().model_dump()
    row["reviewed"] = False
    with pytest.raises(ValueError, match="review"):
        ImageAsset.model_validate(row)


@pytest.mark.parametrize(
    "url",
    [
        "http://thumb.wikimedia.org/example.jpg",
        "https://thumb.wikimedia.org.evil.test/example.jpg",
        "https://user:password@thumb.wikimedia.org/example.jpg",
        "https://127.0.0.1/example.jpg",
        "file:///tmp/example.jpg",
    ],
)
def test_download_urls_are_restricted(url: str) -> None:
    assert not trusted_url(url, {"thumb.wikimedia.org", "upload.wikimedia.org"})


def test_license_link_must_match_license() -> None:
    row = approved().model_dump()
    row["license"] = "CC BY 4.0"
    row["license_url"] = "https://creativecommons.org/licenses/by-nc/4.0/"
    with pytest.raises(ValueError, match="License URL"):
        ImageAsset.model_validate(row)


def test_changed_or_non_image_bytes_are_rejected() -> None:
    asset = approved()
    with pytest.raises(ValueError, match="format"):
        verify_bytes(asset, b"<html>error</html>")
    data = b"\xff\xd8\xffchanged"
    row = asset.model_dump()
    row["local_file"] = "example.jpg"
    row["sha256"] = hashlib.sha256(b"previous").hexdigest()
    with pytest.raises(ValueError, match="checksum"):
        verify_bytes(ImageAsset.model_validate(row), data)


def test_manifest_cannot_escape_asset_directory() -> None:
    row = approved().model_dump()
    row["local_file"] = "../outside.jpg"
    with pytest.raises(ValueError):
        ImageAsset.model_validate(row)


def test_duplicate_ingredient_mapping_is_rejected(tmp_path: Path) -> None:
    first = approved().model_dump()
    second = {**first, "key": "other", "local_file": "other.jpg"}
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps([first, second]))
    with pytest.raises(ValueError, match="more than one"):
        load_manifest(manifest)


def test_bundled_files_match_reviewed_checksums() -> None:
    root = Path(__file__).resolve().parents[3]
    for asset in load_manifest():
        verify_bytes(asset, (root / "assets/food-images" / asset.local_file).read_bytes())


@pytest.fixture
def image_build_root(tmp_path: Path) -> Path:
    root = Path(__file__).resolve().parents[3]
    (tmp_path / "tools/catalog").mkdir(parents=True)
    (tmp_path / "src/data").mkdir(parents=True)
    shutil.copyfile(
        root / "tools/catalog/image-manifest.json", tmp_path / "tools/catalog/image-manifest.json"
    )
    shutil.copyfile(root / "src/data/ingredients.json", tmp_path / "src/data/ingredients.json")
    shutil.copytree(root / "assets/food-images", tmp_path / "assets/food-images")
    return tmp_path


def test_build_preserves_image_sources_and_credits_without_recipe_catalog(
    image_build_root: Path,
) -> None:
    root = Path(__file__).resolve().parents[3]
    summary = build(image_build_root)

    for name in ("food-image-sources.ts", "food-image-credits.json"):
        assert (image_build_root / "src/data" / name).read_bytes() == (
            root / "src/data" / name
        ).read_bytes()
    assert sorted(path.name for path in (image_build_root / "src/data").iterdir()) == [
        "food-image-credits.json",
        "food-image-sources.ts",
        "ingredients.json",
    ]
    assets = load_manifest()
    assert summary == {
        "photos": len(assets),
        "ingredients": sum(len(asset.ingredient_ids) for asset in assets),
        "bytes": sum(
            (root / "assets/food-images" / asset.local_file).stat().st_size for asset in assets
        ),
    }


def test_build_rejects_changed_asset_before_writing_outputs(image_build_root: Path) -> None:
    asset = approved()
    path = image_build_root / "assets/food-images" / asset.local_file
    path.write_bytes(path.read_bytes() + b"changed")

    with pytest.raises(ValueError, match="checksum"):
        build(image_build_root)

    assert not (image_build_root / "src/data/food-image-sources.ts").exists()
    assert not (image_build_root / "src/data/food-image-credits.json").exists()
