"""Bump the MLflow version across all source and generated files.

Usage:
    python dev/bump_version.py 3.10.1+rhaiv.1
    python dev/bump_version.py 3.10.1+rhaiv.1 --dry-run
"""

from __future__ import annotations

import argparse
import importlib.util
import re
import subprocess
import sys
from pathlib import Path

from packaging.version import InvalidVersion, Version

REPO_ROOT = Path(__file__).resolve().parent.parent
UI_VERSION_FILE = REPO_ROOT / "mlflow" / "server" / "js" / "src" / "common" / "constants.tsx"
UI_VERSION_PATTERN = re.compile(r"^export const Version = '.+';$", re.MULTILINE)


def validate_version(version: str) -> None:
    try:
        Version(version)
    except InvalidVersion:
        print(f"Error: '{version}' is not a valid PEP 440 version")
        sys.exit(1)


def update_ui_version(version: str, *, dry_run: bool, path: Path = UI_VERSION_FILE) -> None:
    # Keep prerelease/dev suffixes, but hide local build metadata such as +rhaiv.2.
    ui_version = Version(version).public
    if dry_run:
        print(f"[dry-run] Would set UI version in {path} to {ui_version}")
        return

    old_text = path.read_text()
    if not UI_VERSION_PATTERN.search(old_text):
        raise ValueError(f"Could not find UI version constant in {path}")

    new_text = UI_VERSION_PATTERN.sub(f"export const Version = '{ui_version}';", old_text)
    path.write_text(new_text)


def update_all_source_files(version: str, *, dry_run: bool) -> None:
    if dry_run:
        print("[dry-run] Would run: update_versions() from dev/update_mlflow_versions.py")
        update_ui_version(version, dry_run=True)
        return

    # Use the existing update_versions() which handles all source files:
    # Python (mlflow/version.py), TypeScript (constants.tsx, constants.ts),
    # Java (.java files), Java POM XML (.xml files), R (DESCRIPTION),
    # and pyproject.toml files (simple regex replacement).
    # Load by file path to avoid normal import resolution and the mypy
    # dual-module-name errors it causes for this repo layout.
    spec = importlib.util.spec_from_file_location(
        "update_mlflow_versions", REPO_ROOT / "dev" / "update_mlflow_versions.py"
    )
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]

    print("Updating all source files...")
    # The dynamically loaded module intentionally provides update_versions().
    mod.update_versions(version)
    update_ui_version(version, dry_run=False)


def regenerate_pyproject(*, dry_run: bool) -> None:
    if dry_run:
        print("[dry-run] Would run: uv run python dev/pyproject.py")
        return

    # Regenerate pyproject files properly (overwrites the simple regex
    # replacement done by update_versions above).
    print("Regenerating pyproject files...")
    try:
        subprocess.run(
            ["uv", "run", "python", "dev/pyproject.py"],
            cwd=REPO_ROOT,
            check=True,
            timeout=300,
        )
    except subprocess.TimeoutExpired:
        print("Error: timed out while running uv run python dev/pyproject.py")
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Bump the MLflow version across all source and generated files."
    )
    parser.add_argument("version", help="New version string, e.g. 3.10.1+rhaiv.1")
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
