#!/usr/bin/env bash
set -euo pipefail

fail() {
    printf 'FAIL: %s\n' "$*" >&2
    exit 1
}

uid=$(id -u)
[ "$uid" = "1001" ] || fail "container runs as UID $uid, expected 1001"

policy=$(update-crypto-policies --show 2>&1) || fail "update-crypto-policies --show failed: $policy"
[ "$policy" = "DEFAULT:PQ" ] || fail "crypto policy is '$policy', expected DEFAULT:PQ"

for leaked_path in /app/mlflow /app/libs /app/pyproject.toml /app/pyproject.release.toml; do
    [ ! -e "$leaked_path" ] || fail "source tree path $leaked_path is present in the runtime image"
done

python3.12 - <<'PY'
import importlib.metadata
import pathlib
import sys
import sysconfig


def fail(message):
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


expected_distributions = (
    "mlflow",
    "mlflow-skinny",
    "mlflow-tracing",
    "mlflow-kubernetes-plugins",
    "kubernetes",
    "prometheus-flask-exporter",
    "psycopg2",
    "starlette",
)
missing = []
versions = {}
for distribution in expected_distributions:
    try:
        versions[distribution] = importlib.metadata.version(distribution)
    except importlib.metadata.PackageNotFoundError:
        missing.append(distribution)
if missing:
    fail(f"missing installed distributions: {missing}")

mlflow_versions = {versions[name] for name in ("mlflow", "mlflow-skinny", "mlflow-tracing")}
if len(mlflow_versions) != 1:
    fail(f"mlflow distribution versions disagree: {versions}")

for group, name in (
    ("mlflow.workspace_provider", "kubernetes"),
    ("mlflow.app", "kubernetes-auth"),
):
    matches = [entry for entry in importlib.metadata.entry_points(group=group) if entry.name == name]
    if not matches:
        fail(f"entry point {group}:{name} is not installed")
    matches[0].load()

import mlflow

site_packages = pathlib.Path(sysconfig.get_paths()["purelib"]).resolve()
mlflow_file = pathlib.Path(mlflow.__file__).resolve()
if site_packages not in mlflow_file.parents:
    fail(f"mlflow imported from {mlflow_file}, outside {site_packages}")
if pathlib.Path("/app/mlflow").exists():
    fail("the working directory contains an mlflow package that can shadow site-packages")

build = site_packages / "mlflow/server/js/build"
index = build / "index.html"
remote_entry = build / "federated/remoteEntry.js"
for asset in (index, remote_entry):
    if not asset.is_file() or asset.stat().st_size == 0:
        fail(f"UI asset {asset} is missing or empty")
if not any(path.is_file() and path.stat().st_size > 0 for path in build.glob("static/js/*.js")):
    fail(f"UI build {build} contains no non-empty static/js bundle")

print(
    "verified distributions: "
    + ", ".join(f"{name}=={version}" for name, version in sorted(versions.items()))
)
print(f"verified entry points and UI assets under {build}")
PY

python3.12 -m pip check || fail "pip check reported dependency conflicts"

python3.12 -m mlflow server --help >/dev/null || fail "python3.12 -m mlflow server --help failed"

printf 'PASS: in-image contract assertions\n'
