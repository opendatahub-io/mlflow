# Releasing RHOAI MLflow

This document describes how to cut a release of the RHOAI MLflow distribution. RHOAI
MLflow is built on top of upstream MLflow and ships as `mlflow-3.x.y+rhaiv.N` wheels.

## Prerequisites

- Python 3.10+
- [uv](https://docs.astral.sh/uv/) installed
- Push access to the target git remote
- The `bin/taplo` binary installed (`uv run python bin/install.py`)

## Step-by-Step Release Process

### 1. Bump the version

Run the version bump script with the new version string:

```bash
uv run python dev/bump_version.py 3.10.1+rhaiv.1
```

This single command updates all 8 files that contain the version:

- `mlflow/version.py` (source of truth)
- `mlflow/server/js/src/common/constants.tsx` (frontend UI)
- `docs/src/constants.ts` (documentation site)
- `pyproject.toml`, `pyproject.release.toml`, `libs/skinny/pyproject.toml`,
  `libs/tracing/pyproject.toml` (regenerated via `dev/pyproject.py`)
- `uv.lock` (dependency lockfile)

Use `--dry-run` to preview changes without modifying anything:

```bash
uv run python dev/bump_version.py 3.10.1+rhaiv.1 --dry-run
```

### 2. Verify the build

Build the wheels locally to make sure everything is correct:

```bash
uv run python dev/build.py --package-type dev
```

Test that the wheel installs and reports the correct version:

```bash
pip install dist/mlflow-*.whl
python -c "import mlflow; print(mlflow.__version__)"
```

## Troubleshooting

### `dev/pyproject.py` fails with "Could not find VERSION"

The regex in `dev/pyproject.py` supports letters, digits, dots, hyphens, and `+`
characters in the version string. If you use a version with characters outside this set,
update the regex in `dev/pyproject.py`.

### `taplo` not found

Install it with:

```bash
uv run python bin/install.py
```
