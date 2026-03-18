from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

EXPECTED_REQUIREMENT_FILES = {
    "/requirements/konflux-aipcc-requirements.txt",
    "/requirements/konflux-build-aipcc-requirements.txt",
    "/requirements/konflux-pypi-requirements.txt",
}

REPO_ROOT = Path(__file__).resolve().parents[2]


def _write_lines(stream: object, lines: list[str]) -> None:
    for line in lines:
        stream.write(f"{line}\n")


def _discover_syft_requirements_files() -> set[str]:
    result = subprocess.run(
        ["syft", "scan", "dir:.", "-o", "syft-json"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        sys.stderr.write(result.stderr)
        raise SystemExit(f"syft scan failed with exit code {result.returncode}")

    sbom = json.loads(result.stdout)
    discovered = set()
    for artifact in sbom.get("artifacts", []):
        for location in artifact.get("locations", []):
            path = location.get("path")
            if not isinstance(path, str):
                continue
            if path.endswith(".txt") and "requirements" in Path(path).name:
                discovered.add(path)

    return discovered


def main() -> None:
    discovered = _discover_syft_requirements_files()
    missing = EXPECTED_REQUIREMENT_FILES - discovered
    unexpected = discovered - EXPECTED_REQUIREMENT_FILES

    if missing or unexpected:
        _write_lines(
            sys.stderr,
            [
                "Syft-discovered requirements files do not match the allowlist.",
                "Expected:",
                *[f"  {path}" for path in sorted(EXPECTED_REQUIREMENT_FILES)],
                "Discovered:",
                *[f"  {path}" for path in sorted(discovered)],
            ],
        )
        if missing:
            _write_lines(sys.stderr, ["Missing:", *[f"  {path}" for path in sorted(missing)]])
        if unexpected:
            _write_lines(
                sys.stderr,
                ["Unexpected:", *[f"  {path}" for path in sorted(unexpected)]],
            )
        raise SystemExit(1)

    _write_lines(
        sys.stdout,
        [
            "Syft requirements allowlist matches expected files:",
            *[f"  {path}" for path in sorted(discovered)],
        ],
    )


if __name__ == "__main__":
    main()
