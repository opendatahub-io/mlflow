#!/bin/bash
set -e

cd tests/db

# Keep the historical MLflow dependencies compatible with the pre-workspace baseline.
# Pin the DB test tools separately instead of imposing the current MLflow dependency lock.
locked=$(mktemp)
trap 'rm -f "$locked"' EXIT
uv export --quiet --locked --only-group db-test \
  --no-emit-workspace --no-hashes --output-file "$locked" > /dev/null
uv run --quiet --isolated --no-project --with 'mlflow[db]==3.10.1' --with-requirements "$locked" \
  python check_migration.py pre-migration
# Run the post-migration step with mlflow from the repository
uv run --no-sync mlflow db upgrade $MLFLOW_TRACKING_URI
uv run --no-sync python check_migration.py post-migration
