#!/bin/bash
set -ex

cd tests/db

# Install the lastest version of mlflow from PyPI
pip install mlflow==3.8.0
python check_migration.py pre-migration
# Install mlflow from the repository
pip install -e ../..
mlflow db upgrade $MLFLOW_TRACKING_URI
python check_migration.py post-migration
