"""Bump the MLflow version across all source and generated files.

Usage:
    python dev/bump_version.py 3.10.0rc0+rhai1
    python dev/bump_version.py 3.10.0rc0+rhai1 --dry-run
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Files where the version string is maintained manually.
# The generated pyproject files are handled by dev/pyproject.py afterwards.
SOURCE_FILES: list[tuple[Path, str]] = [
    (REPO_ROOT / "mlflow" / "version.py", r'VERSION = ".*"'),
    (
        REPO_ROOT / "mlflow" / "server" / "js" / "src" / "common" / "constants.tsx",
        r"export const Version = '.*'",
    ),
    (REPO_ROOT / "docs" / "src" / "constants.ts", r"export const Version = '.*'"),
]

REPLACEMENT_TEMPLATES: list[str] = [
    'VERSION = "{version}"',
    "export const Version = '{version}'",
    "export const Version = '{version}'",
]


def validate_version(version: str) -> None:
    if not re.match(r"^\d+\.\d+\.\d+", version):
        print(f"Error: version '{version}' must start with <major>.<minor>.<micro>")
        sys.exit(1)


def update_source_files(version: str, *, dry_run: bool) -> None:
    for (path, pattern), template in zip(SOURCE_FILES, REPLACEMENT_TEMPLATES):
        text = path.read_text()
        replacement = template.format(version=version)
        new_text, count = re.subn(pattern, replacement, text)
        if count == 0:
            print(f"Warning: pattern not found in {path.relative_to(REPO_ROOT)}")
            continue
        rel = path.relative_to(REPO_ROOT)
        if dry_run:
            print(f"[dry-run] Would update {rel} -> {replacement}")
        else:
            path.write_text(new_text)
            print(f"Updated {rel}")


def regenerate_pyproject(*, dry_run: bool) -> None:
    if dry_run:
        print("[dry-run] Would run: uv run python dev/pyproject.py")
        print("[dry-run] Would run: uv export ... > requirements.txt")
        return

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
    update_source_files(args.version, dry_run=args.dry_run)
    regenerate_pyproject(dry_run=args.dry_run)

    if args.dry_run:
        print("\nDry run complete. No files were modified.")
    else:
        print(f"\nVersion bumped to {args.version}")
        print("Files updated:")
        print("  - mlflow/version.py")
        print("  - mlflow/server/js/src/common/constants.tsx")
        print("  - docs/src/constants.ts")
        print("  - pyproject.toml")
        print("  - pyproject.release.toml")
        print("  - libs/skinny/pyproject.toml")
        print("  - libs/tracing/pyproject.toml")
        print("  - uv.lock")
        print("  - requirements.txt")


if __name__ == "__main__":
    main()
