"""Rights manifest tests for the source-neutral catalog boundary."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from tools.catalog.rights import RightsManifest


def approved_source(**overrides: object) -> dict[str, object]:
    source: dict[str, object] = {
        "id": "public-domain-cookbook",
        "version": "2026-08",
        "title": "Public Domain Cookbook",
        "archiveUrl": "https://example.test/catalog.jsonl",
        "sha256": "a" * 64,
        "archiveFormat": "jsonl",
        "licenseName": "CC0-1.0",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "attribution": "Public Domain Cookbook, CC0.",
        "status": "approved",
    }
    source.update(overrides)
    return source


def candidate_source(**overrides: object) -> dict[str, object]:
    source: dict[str, object] = {
        "id": "wikibooks-cookbook",
        "version": "latest-observed-2026-08-04",
        "title": "English Wikibooks Cookbook",
        "archiveUrl": (
            "https://dumps.wikimedia.org/enwikibooks/latest/"
            "enwikibooks-latest-pages-articles.xml.bz2"
        ),
        "sha256": None,
        "archiveFormat": "mediawiki-xml-bz2",
        "licenseName": "CC BY-SA 4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
        "attribution": "English Wikibooks contributors, CC BY-SA 4.0.",
        "status": "candidate",
        "notes": "Pin a dated dump, compute SHA-256, and extract neutral JSONL.",
    }
    source.update(overrides)
    return source


def test_manifest_accepts_an_approved_checksum_pinned_source() -> None:
    """Would fail if approved sources stopped carrying auditable provenance."""
    manifest = RightsManifest.model_validate({"schemaVersion": 1, "sources": [approved_source()]})

    assert manifest.approved_sources()[0].id == "public-domain-cookbook"


def test_manifest_keeps_candidate_sources_out_of_approved_releases() -> None:
    """Would fail if discovery metadata could silently become release input."""
    manifest = RightsManifest.model_validate({"schemaVersion": 1, "sources": [candidate_source()]})

    assert manifest.approved_sources() == []
    assert manifest.candidate_sources()[0].id == "wikibooks-cookbook"
    assert manifest.source("wikibooks-cookbook").sha256 is None


def test_candidate_cannot_be_promoted_without_release_grade_provenance() -> None:
    """Would fail if changing only a status flag could approve a mutable dump."""
    with pytest.raises(ValidationError):
        RightsManifest.model_validate(
            {"schemaVersion": 1, "sources": [candidate_source(status="approved")]}
        )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("sha256", "not-a-checksum"),
        ("archiveUrl", "http://example.test/catalog.jsonl"),
        ("licenseName", ""),
        ("attribution", "   "),
    ],
)
def test_manifest_rejects_invalid_rights_or_provenance(field: str, value: str) -> None:
    """Would fail if an untraceable or unpinned source entered the build."""
    with pytest.raises(ValidationError):
        RightsManifest.model_validate(
            {"schemaVersion": 1, "sources": [approved_source(**{field: value})]}
        )


def test_manifest_rejects_duplicate_source_versions() -> None:
    """Would fail if source ordering could silently choose a duplicate archive."""
    with pytest.raises(ValidationError, match="duplicate"):
        RightsManifest.model_validate(
            {"schemaVersion": 1, "sources": [approved_source(), approved_source()]}
        )


def test_manifest_rejects_multiple_versions_of_one_source_id() -> None:
    """Would fail if a release could choose an archive for one source ambiguously."""
    with pytest.raises(ValidationError, match="duplicate source id"):
        RightsManifest.model_validate(
            {
                "schemaVersion": 1,
                "sources": [approved_source(), approved_source(version="2026-09")],
            }
        )


def test_committed_manifest_archives_are_checksum_pinned() -> None:
    import hashlib

    manifest_path = Path(__file__).parents[1] / "rights-manifest.json"
    manifest = RightsManifest.model_validate(json.loads(manifest_path.read_text(encoding="utf-8")))

    assert {"wikibooks-cookbook", "wikibooks-expanded", "historical-cookbooks"} <= {
        source.id for source in manifest.approved_sources()
    }
    for source in manifest.approved_sources():
        archive = manifest_path.parent / "archives" / f"{source.id}-{source.version[:7]}.jsonl"
        assert hashlib.sha256(archive.read_bytes()).hexdigest() == source.sha256
