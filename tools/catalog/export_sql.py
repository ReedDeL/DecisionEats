"""Export validated releases as inactive, transactional SQL batches.

No database connection or credentials are used here. Inspect generated SQL and
execute batches in order; activation is a separate explicit final operation.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from uuid import UUID, uuid4

from tools.catalog.pipeline import ReleaseBuild, rebuild_committed_catalog, validate_release


def insert_sql(table: str, rows: list[dict[str, object]], columns: str) -> str:
    """Tables and columns are internal constants; all data is JSON-escaped."""
    payload = json.dumps(rows, ensure_ascii=False).replace("'", "''")
    names = ", ".join(part.strip().split()[0] for part in columns.split(","))
    return (
        f"insert into public.{table} ({names}) select {names} "
        f"from jsonb_to_recordset('{payload}'::jsonb) as x({columns});\n"
    )


def export_batches(release: ReleaseBuild, release_id: UUID, output: Path) -> list[Path]:
    validate_release(release)
    if output.exists():
        raise FileExistsError("choose a new release output directory")
    output.mkdir(parents=True)
    rid = str(release_id)
    statements = [
        insert_sql(
            "catalog_releases",
            [
                {
                    "id": rid,
                    "recipe_count": len(release.recipes),
                    "ingredient_count": len(release.vocabulary),
                    "source_count": len(release.sources),
                    "offline_recipe_count": len(release.offline_recipes),
                    "offline_ready": True,
                }
            ],
            "id uuid,recipe_count integer,ingredient_count integer,source_count integer,"
            "offline_recipe_count integer,offline_ready boolean",
        ),
        insert_sql(
            "catalog_release_sources",
            [
                {
                    "release_id": rid,
                    "source_id": s.id,
                    "source_version": s.version,
                    "archive_url": s.archive_url,
                    "archive_sha256": s.sha256,
                    "license_name": s.license_name,
                    "license_url": s.license_url,
                    "attribution": s.attribution,
                    "rights_status": s.status,
                }
                for s in release.sources
            ],
            "release_id uuid,source_id text,source_version text,"
            "archive_url text,archive_sha256 text,license_name text,license_url text,"
            "attribution text,rights_status text",
        ),
        insert_sql(
            "catalog_ingredients",
            [
                {
                    "release_id": rid,
                    "ingredient_id": v.id,
                    "display_name": v.display_name,
                    "allergen_groups": v.allergen_groups,
                    "allergen_status": "verified",
                    "is_staple": v.is_staple,
                }
                for v in release.vocabulary
            ],
            "release_id uuid,ingredient_id text,display_name text,"
            "allergen_groups text[],allergen_status text,is_staple boolean",
        ),
    ]
    batches = ["".join(statements)]
    offline = {row.id for row in release.offline_recipes}
    for offset in range(0, len(release.recipes), 100):
        rows = release.recipes[offset : offset + 100]
        batches.append(
            "".join(
                [
                    insert_sql(
                        "catalog_recipes",
                        [
                            {
                                "release_id": rid,
                                "recipe_id": r.id,
                                "title": r.title,
                                "image_url": r.image_url,
                                "cuisine": r.cuisine,
                                "total_time_minutes": r.total_time_minutes,
                                "equipment_required": r.equipment_required,
                                "equipment_status": "verified",
                                "allergen_status": r.allergen_status,
                                "dietary_status": r.dietary_status,
                                "dietary_tags": r.dietary_tags,
                                "instructions": r.instructions,
                                "is_offline": r.id in offline,
                            }
                            for r in rows
                        ],
                        "release_id uuid,recipe_id text,title text,image_url text,"
                        "cuisine text,total_time_minutes integer,equipment_required text[],"
                        "equipment_status text,allergen_status text,dietary_status text,"
                        "dietary_tags text[],instructions text,is_offline boolean",
                    ),
                    insert_sql(
                        "catalog_recipe_ingredients",
                        [
                            {
                                "release_id": rid,
                                "recipe_id": r.id,
                                "position": index,
                                "ingredient_id": item.id,
                                "quantity": item.quantity,
                                "unit": item.unit,
                                "raw_measure": item.raw_measure,
                            }
                            for r in rows
                            for index, item in enumerate(r.ingredients, 1)
                        ],
                        "release_id uuid,recipe_id text,position integer,ingredient_id text,"
                        "quantity numeric,unit text,raw_measure text",
                    ),
                    insert_sql(
                        "catalog_recipe_sources",
                        [
                            {
                                "release_id": rid,
                                "recipe_id": r.id,
                                "source_id": p.source_id,
                                "source_version": p.source_version,
                                "source_recipe_id": p.source_recipe_id,
                                "archive_sha256": p.archive_sha256,
                            }
                            for r in rows
                            for p in r.provenance
                        ],
                        "release_id uuid,recipe_id text,source_id text,source_version text,"
                        "source_recipe_id text,archive_sha256 text",
                    ),
                ]
            )
        )
    paths = []
    for index, sql in enumerate(batches):
        path = output / f"{index:03}.sql"
        path.write_text(
            "begin;\nset local standard_conforming_strings = on;\n"
            "set local role service_role;\n" + sql + "commit;\n",
            encoding="utf-8",
        )
        paths.append(path)
    (output / "activation.sql").write_text(
        f"select private.activate_catalog_release('{rid}'::uuid);\n",
        encoding="utf-8",
    )
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--release-id", type=UUID)
    args = parser.parse_args()
    rid = args.release_id or uuid4()
    release = rebuild_committed_catalog(args.output.parent / "local-build")
    paths = export_batches(release, rid, args.output)
    print(
        json.dumps(
            {
                "releaseId": str(rid),
                "batches": len(paths),
                "recipes": len(release.recipes),
                "ingredients": len(release.vocabulary),
            }
        )
    )


if __name__ == "__main__":
    main()
