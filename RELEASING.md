# Releasing RHOAI MLflow

This document describes how to cut a release of the RHOAI MLflow distribution. RHOAI
MLflow is built on top of upstream MLflow and ships as `mlflow-3.x.yrcN+rhaiM` wheels.

## Prerequisites

- Python 3.10+
- [uv](https://docs.astral.sh/uv/) installed
- Push access to the target git remote
- The `bin/taplo` binary installed (`uv run python bin/install.py`)

## Step-by-Step Release Process

### 1. Sync with upstream

Make sure `odh-main` is up to date with the upstream MLflow tag you are targeting:

```bash
git fetch mlflow
git fetch odh

# If rebasing onto a new upstream release:
git checkout odh-main
git rebase v3.10.0   # or the target upstream tag
```

### 2. Bump the version

Run the version bump script with the new version string:

```bash
uv run python dev/bump_version.py 3.10.0rc0+rhai1
```

This single command updates all 9 files that contain the version:

- `mlflow/version.py` (source of truth)
- `mlflow/server/js/src/common/constants.tsx` (frontend UI)
- `docs/src/constants.ts` (documentation site)
- `pyproject.toml`, `pyproject.release.toml`, `libs/skinny/pyproject.toml`,
  `libs/tracing/pyproject.toml` (regenerated via `dev/pyproject.py`)
- `uv.lock`, `requirements.txt` (dependency lockfiles)

Use `--dry-run` to preview changes without modifying anything:

```bash
uv run python dev/bump_version.py 3.10.0rc0+rhai1 --dry-run
```

### 3. Verify the build

Build the wheels locally to make sure everything is correct:

```bash
uv run python dev/build.py --package-type dev
```

Test that the wheel installs and reports the correct version:

```bash
pip install dist/mlflow-*.whl
python -c "import mlflow; print(mlflow.__version__)"
```

### 4. Commit and push

```bash
git add -A
git commit -s -m "chore: Bump version to 3.10.0rc0+rhai1"
git push origin odh-main
```

## Troubleshooting

### `dev/pyproject.py` fails with "Could not find VERSION"

The regex in `dev/pyproject.py` must match the version format. It supports lowercase
letters, digits, dots, and `+` characters. If you use a version with characters outside
this set, update the regex in `dev/pyproject.py`.

### `requirements.txt` CI check fails

Regenerate it and commit the result:

```bash
uv export --no-hashes --no-editable --no-emit-workspace --package mlflow > requirements.txt
```

### `taplo` not found

Install it with:

```bash
uv run python bin/install.py
```
