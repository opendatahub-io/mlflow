#!/usr/bin/env bash
# Run the Python CI test shards against the image built from Dockerfile.konflux.
# The image supplies production packages and native libraries; this script adds
# only tools and Python packages needed to execute the test suite.

set -euo pipefail

microdnf install -y --setopt=install_weak_deps=0 --setopt=tsflags=nodocs \
  git \
  java-17-openjdk-headless \
  openssh-clients \
  openssh-server \
  procps-ng
microdnf clean all

git config --global --add safe.directory "$(pwd)"

# Keep the image's production pins. Prefer PyPI wheels for test dependencies,
# but permit PySpark's source archive because it does not publish a wheel and
# its installation does not compile native code.
python3.12 -m pip freeze --disable-pip-version-check >/tmp/konflux-runtime-constraints.txt
python3.12 -m pip install --no-cache-dir --disable-pip-version-check \
  --prefer-binary \
  --upgrade-strategy only-if-needed \
  -c /tmp/konflux-runtime-constraints.txt \
  -r requirements/test-requirements.txt \
  virtualenv \
  uv \
  wheel

mkdir -p /run/sshd /var/run/sshd
ssh-keygen -A
/usr/sbin/sshd
source dev/setup-ssh.sh

COMMON_ARGS=(
  --splits="$SPLITS" --group="$GROUP"
  --quiet --requires-ssh --ignore-flavors \
  --ignore=tests/examples \
  --ignore=tests/evaluate \
  --ignore=tests/optuna \
  --ignore=tests/pyspark/optuna \
  --ignore=tests/genai \
  --ignore=tests/docker \
  --ignore=tests/projects/test_docker_projects.py \
  --ignore=tests/projects/test_projects_cli.py \
  --ignore=tests/sagemaker \
  tests
)

python3.12 -m pytest --serial=exclude -n auto --dist loadscope "${COMMON_ARGS[@]}"
python3.12 -m pytest --serial=only "${COMMON_ARGS[@]}"
