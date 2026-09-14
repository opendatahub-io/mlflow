#!/usr/bin/env bash
# Run the python test suite inside Dockerfile.konflux.
#
# Runtime Python packages and native libraries come from the image. This
# script only adds test-only OS tools (sshd, Java, git) and precompiled
# PyPI wheels for pytest and other test dependencies.

set -euo pipefail

# sshd: SFTP artifact-repo tests. Java: pyspark dataset tests. git: serve_wheel
# and a few subprocess checks. Not image RPMs; Dockerfile.konflux stays UBI-only.
microdnf install -y --setopt=install_weak_deps=0 --setopt=tsflags=nodocs \
  git \
  openssh-server \
  openssh-clients \
  procps-ng \
  java-17-openjdk-headless

# Bind-mounted checkout is owned by the GHA runner UID; we run as root.
git config --global --add safe.directory "$(pwd)"

if [ -z "${JAVA_HOME:-}" ]; then
  java_bin=$(command -v java)
  JAVA_HOME=$(dirname "$(dirname "$(readlink -f "$java_bin")")")
  export JAVA_HOME
fi

# Keep AIPCC runtime pins (pillow, numpy, opentelemetry-sdk, …). PyPI test
# wheels must not replace those with manylinux builds that hide missing image
# sonames. --only-binary=:all: matches "precompiled wheels from PyPI".
python3.12 -m pip install --no-cache-dir --disable-pip-version-check \
  --only-binary=:all: --require-hashes --no-deps \
  -r requirements/konflux-test-opentelemetry-requirements.txt

python3.12 -m pip freeze --disable-pip-version-check >/tmp/image-constraints.txt

python3.12 -m pip install --no-cache-dir --disable-pip-version-check \
  --only-binary=:all: \
  --upgrade-strategy only-if-needed \
  -c /tmp/image-constraints.txt \
  -r requirements/test-requirements.txt \
  "setuptools<=82.0.1" \
  wheel

echo ">>> package versions"
python3.12 -m pip freeze --disable-pip-version-check | sort
echo "<<< package versions"

mkdir -p "${HOME}/.ssh" /root/.ssh /var/run/sshd /run/sshd
if ! pgrep -x sshd >/dev/null; then
  ssh-keygen -A
  /usr/sbin/sshd
fi
# shellcheck source=dev/setup-ssh.sh
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
  --ignore=tests/sagemaker \
  --ignore=tests/projects/test_virtualenv_projects.py \
  --ignore=tests/metrics/test_metric_definitions.py \
  tests
)

python3.12 -m pytest --serial=exclude -n auto --dist loadscope "${COMMON_ARGS[@]}"
python3.12 -m pytest --serial=only "${COMMON_ARGS[@]}"
