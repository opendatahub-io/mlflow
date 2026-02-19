"""Bump the MLflow version across all source and generated files.

Usage:
    python dev/bump_version.py 3.10.0rc0+rhai1
    python dev/bump_version.py 3.10.0rc0+rhai1 --dry-run
"""

from __future__ import annotations

import argparse
import importlib.util
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def validate_version(version: str) -> None:
    if not re.match(r"^\d+\.\d+\.\d+", version):
        print(f"Error: version '{version}' must start with <major>.<minor>.<micro>")
        sys.exit(1)


def update_all_source_files(version: str, *, dry_run: bool) -> None:
    if dry_run:
        print("[dry-run] Would run: update_versions() from dev/update_mlflow_versions.py")
        return

    # Use the existing update_versions() which handles all source files:
    # Python (mlflow/version.py), TypeScript (constants.tsx, constants.ts),
    # Java (.java files), Java POM XML (.xml files), R (DESCRIPTION),
    # and pyproject.toml files (simple regex replacement).
    # Load by file path to avoid mypy dual-module-name errors.
    spec = importlib.util.spec_from_file_location(
        "update_mlflow_versions", REPO_ROOT / "dev" / "update_mlflow_versions.py"
    )
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]

    print("Updating all source files...")
    mod.update_versions(version)


def regenerate_pyproject(*, dry_run: bool) -> None:
    if dry_run:
        print("[dry-run] Would run: uv run python dev/pyproject.py")
        print("[dry-run] Would run: uv export ... > requirements.txt")
        return

    # Regenerate pyproject files properly (overwrites the simple regex
    # replacement done by update_versions above).
    print("Regenerating pyproject files...")
    subprocess.check_call(["uv", "run", "python", "dev/pyproject.py"], cwd=REPO_ROOT)

    print("Regenerating requirements.txt...")
    requirements = subprocess.check_output(
        [
            "uv",
            "export",
            "--no-hashes",
            "--no-editable",
            "--no-emit-workspace",
            "--package",
            "mlflow",
        ],
        cwd=REPO_ROOT,
        text=True,
    )
    (REPO_ROOT / "requirements.txt").write_text(requirements)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Bump the MLflow version across all source and generated files."
    )
    parser.add_argument("version", help="New version string, e.g. 3.10.0rc0+rhai1")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be changed without modifying files.",
    )
    args = parser.parse_args()

    validate_version(args.version)
    update_all_source_files(args.version, dry_run=args.dry_run)
    regenerate_pyproject(dry_run=args.dry_run)

    if args.dry_run:
        print("\nDry run complete. No files were modified.")
    else:
        print(f"\nVersion bumped to {args.version}")


if __name__ == "__main__":
    main()
