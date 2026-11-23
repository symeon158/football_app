"""Football Legends supporting tools (Python side).

The game itself runs on Next.js + Supabase. This package holds offline tooling
such as the deterministic fictional-catalogue generator, and is the home for
future analytics jobs.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from football_app.catalog import generate_catalog, render_sql

REPO_ROOT = Path(__file__).resolve().parents[2]
CATALOG_MIGRATION = REPO_ROOT / "supabase" / "migrations" / "20261123000500_fictional_players.sql"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="football-app")
    sub = parser.add_subparsers(dest="command", required=True)
    gen = sub.add_parser("generate-catalog", help="write the fictional player catalogue migration")
    gen.add_argument("--check", action="store_true", help="fail if the committed file is out of date")
    args = parser.parse_args(argv)

    if args.command == "generate-catalog":
        sql = render_sql(generate_catalog())
        if args.check:
            current = CATALOG_MIGRATION.read_text(encoding="utf-8") if CATALOG_MIGRATION.exists() else ""
            if current != sql:
                print(f"{CATALOG_MIGRATION.name} is out of date; run: uv run football-app generate-catalog")
                return 1
            print("catalogue migration is up to date")
            return 0
        CATALOG_MIGRATION.write_text(sql, encoding="utf-8", newline="\n")
        print(f"wrote {CATALOG_MIGRATION.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
