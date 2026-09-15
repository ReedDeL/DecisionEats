from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from tools.catalog.images import ImageAsset, load_manifest, trusted_url, verify_bytes


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
