#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PYTHON_VERSION=${KONFLUX_PYTHON_VERSION:-3.12}
PYTHON_PLATFORM=${KONFLUX_PYTHON_PLATFORM:-x86_64-manylinux_2_34}
PYTHON_BIN=${KONFLUX_PYTHON:-python3.12}

cleanup_paths=()

cleanup() {
    if ((${#cleanup_paths[@]})); then
        rm -rf -- "${cleanup_paths[@]}"
    fi
}

trap cleanup EXIT

log() {
    printf '%s\n' "$*"
}

warn() {
    printf 'WARN: %s\n' "$*" >&2
}

fail() {
    printf 'FAIL: %s\n' "$*" >&2
    exit 1
}

usage() {
    cat <<'EOF'
Usage: scripts/validate-build.sh <mode>

Modes:
  static           Validate the Tekton, Dockerfile, RPM and Yarn input contract.
  python-hermetic  Warm an isolated uv cache, delete the venv, then install offline.
  yarn-hermetic    Warm the Yarn global cache, delete node_modules, then install offline.
  image            Build Dockerfile.konflux for linux/amd64, inspect the image and smoke the server.
EOF
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "required command '$1' is not installed"
}

make_workdir() {
    mktemp -d "${TMPDIR:-/tmp}/mlflow-konflux-$1.XXXXXX"
}

verify_requirements() {
    local venv=$1
    local requirements=$2
    "$venv/bin/python" - "$requirements" <<'PY'
import importlib.metadata
import re
import sys
from pathlib import Path


def normalize(name):
    return re.sub(r"[-_.]+", "-", name).lower()


expected = set()
for line in Path(sys.argv[1]).read_text(encoding="utf-8").splitlines():
    match = re.match(r"^([A-Za-z0-9][A-Za-z0-9_.-]*)==([^\s;]+)", line)
    if match:
        expected.add(normalize(match.group(1)))

installed = set()
for distribution in importlib.metadata.distributions():
    name = distribution.metadata["Name"]
    if name:
        installed.add(normalize(name))

missing = sorted(expected - installed)
if missing:
    print(f"missing distributions after offline install: {missing}", file=sys.stderr)
    raise SystemExit(1)
print(f"verified {len(expected)} pinned distributions from {sys.argv[1]}")
PY
}

uv_install() {
    local venv=$1
    local requirements=$2
    local allow_sdist=$3
    shift 3
    local binary_flags=(--only-binary ':all:')
    if [[ "$allow_sdist" == "1" ]]; then
        binary_flags=()
    fi
    uv --no-config pip install \
        --python "$venv/bin/python" \
        --python-version "$PYTHON_VERSION" \
        --python-platform "$PYTHON_PLATFORM" \
        --require-hashes \
        --no-deps \
        "${binary_flags[@]}" \
        "$@" \
        -r "$requirements"
}

uv_warm_and_offline() {
    local label=$1
    local requirements=$2
    local workdir=$3
    local allow_sdist=$4
    local warm_venv="$workdir/venv-$label-warm"
    local offline_venv="$workdir/venv-$label-offline"

    log "::group::uv warm cache: $label"
    rm -rf "$warm_venv"
    "$PYTHON_BIN" -m venv "$warm_venv"
    uv_install "$warm_venv" "$requirements" "$allow_sdist"
    rm -rf "$warm_venv"
    log "::endgroup::"

    log "::group::uv offline install: $label"
    "$PYTHON_BIN" -m venv "$offline_venv"
    uv_install "$offline_venv" "$requirements" "$allow_sdist" --offline
    verify_requirements "$offline_venv" "$requirements"
    log "::endgroup::"
}

build_source_wheels() {
    local workdir=$1
    local src="$workdir/src"
    local dist="$workdir/dist"

    log "::group::build mlflow source wheels with the offline build environment"
    mkdir -p "$src" "$dist"
    tar -C "$ROOT_DIR" \
        --exclude=.git \
        --exclude=node_modules \
        --exclude='mlflow/server/js/build' \
        --exclude='mlflow/server/js/.yarn' \
        -cf - . | tar -C "$src" -xf -
    cp "$src/pyproject.release.toml" "$src/pyproject.toml"
    (
        cd "$src"
        "$workdir/venv-build-offline/bin/python" -m build --wheel --no-isolation --outdir "$dist" libs/tracing
        "$workdir/venv-build-offline/bin/python" -m build --wheel --no-isolation --outdir "$dist" libs/skinny
        "$workdir/venv-build-offline/bin/python" -m build --wheel --no-isolation --outdir "$dist" .
    )
    for expected in 'mlflow_tracing-*.whl' 'mlflow_skinny-*.whl' 'mlflow-[0-9]*.whl'; do
        if ! find "$dist" -maxdepth 1 -name "$expected" -print -quit | grep -q .; then
            fail "source wheel build did not produce $expected"
        fi
    done
    find "$dist" -maxdepth 1 -name '*.whl' -print | sort
    log "::endgroup::"
}

verify_wheelhouse() {
    local wheelhouse=$1
    local requirements=$2
    "$PYTHON_BIN" - "$wheelhouse" "$requirements" <<'PY'
import re
import sys
from pathlib import Path


def normalize(name):
    return re.sub(r"[-_.]+", "-", name).lower()


requirements = Path(sys.argv[2]).read_text(encoding="utf-8")
expected = {
    normalize(match.group(1))
    for match in re.finditer(r"^([A-Za-z0-9][A-Za-z0-9_.-]*)==([^\s;]+)", requirements, re.M)
}
available = {
    normalize(path.name.split("-", 1)[0])
    for path in Path(sys.argv[1]).glob("*.whl")
}
missing = sorted(expected - available)
if missing:
    print(f"offline wheelhouse is missing: {missing}", file=sys.stderr)
    raise SystemExit(1)
print(f"verified {len(expected)} wheels from the offline PyPI wheelhouse")
PY
}

pip_wheelhouse() {
    local workdir=$1
    local requirements="$ROOT_DIR/requirements/konflux-pypi-requirements.txt"
    local downloads="$workdir/downloads"
    local wheelhouse="$workdir/offline-wheelhouse"
    local build_python="$workdir/venv-build-offline/bin/python"

    if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
        if [[ "${REQUIRE_NATIVE_WHEEL_PROOF:-0}" == "1" ]]; then
            fail "the pip wheel proof requires a linux/amd64 runner, got $(uname -s)/$(uname -m)"
        fi
        warn "skipping the host pip wheel proof on $(uname -s)/$(uname -m); CI runs it on linux/amd64"
        return 0
    fi

    command -v pg_config >/dev/null 2>&1 || fail "pg_config is required to build psycopg2; install libpq-dev"
    [[ -x "$build_python" ]] || fail "the offline build environment is missing: $build_python"

    log "::group::pip download the pinned sources"
    rm -rf "$downloads" "$wheelhouse"
    mkdir -p "$downloads"
    PIP_CACHE_DIR="$workdir/pip-cache" "$build_python" -m pip download \
        --disable-pip-version-check \
        --require-hashes \
        --no-deps \
        --dest "$downloads" \
        -r "$requirements"
    find "$downloads" -maxdepth 1 -type f -printf '%f\n' | sort
    log "::endgroup::"

    log "::group::pip wheel offline rebuild"
    PIP_CACHE_DIR="$workdir/pip-cache" PIP_NO_INDEX=1 "$build_python" -m pip wheel \
        --disable-pip-version-check \
        --require-hashes \
        --no-deps \
        --no-build-isolation \
        --find-links "$downloads" \
        --wheel-dir "$wheelhouse" \
        -r "$requirements"
    verify_wheelhouse "$wheelhouse" "$requirements"
    log "::endgroup::"
}

check_runtime_closure() {
    local workdir=$1
    local venv="$workdir/venv-runtime-combined"
    local dist="$workdir/dist"
    local wheelhouse="$workdir/offline-wheelhouse"

    log "::group::runtime dependency closure"
    rm -rf "$venv"
    "$PYTHON_BIN" -m venv "$venv"
    # The AIPCC file sets --index-url, so resolve it on its own exactly as the
    # Dockerfile does. Handing it to the same resolver as the PyPI pins would
    # point both files at the Red Hat index and hide the PyPI packages.
    uv --no-config pip install \
        --python "$venv/bin/python" \
        --python-version "$PYTHON_VERSION" \
        --python-platform "$PYTHON_PLATFORM" \
        --require-hashes \
        --no-deps \
        --offline \
        -r "$ROOT_DIR/requirements/konflux-aipcc-requirements.txt"
    # The image installs the rebuilt wheels from disk, so install the same
    # artifacts here rather than resolving the names again.
    uv --no-config pip install \
        --python "$venv/bin/python" \
        --no-deps \
        --offline \
        "$wheelhouse"/*.whl \
        "$dist"/mlflow*.whl
    uv --no-config pip check --python "$venv/bin/python"
    log "::endgroup::"
}

python_hermetic() {
    require_command "$PYTHON_BIN"
    require_command uv
    command -v gcc >/dev/null 2>&1 || fail "gcc is required for the pinned psycopg2 sdist"

    "$PYTHON_BIN" - "$PYTHON_VERSION" <<'PY'
import sys

expected = tuple(int(part) for part in sys.argv[1].split("."))
if sys.version_info[: len(expected)] != expected:
    raise SystemExit(
        f"expected Python {sys.argv[1]}, got {sys.version_info.major}.{sys.version_info.minor}"
    )
PY

    local workdir
    workdir=$(make_workdir python)
    cleanup_paths+=("$workdir")

    # The repository's setup-uv action exports policy variables for normal
    # development installs. They are not part of the Dockerfile's pip build and
    # would make this prefetch proof stricter than the artifact it simulates.
    unset UV_EXCLUDE_NEWER UV_INDEX_STRATEGY UV_DEFAULT_INDEX UV_INDEX_URL \
        UV_EXTRA_INDEX_URL UV_FIND_LINKS UV_OFFLINE UV_NO_CACHE

    export UV_CACHE_DIR="$workdir/uv-cache"
    export UV_NO_PROGRESS=1
    export UV_LINK_MODE=copy

    uv_warm_and_offline \
        build "$ROOT_DIR/requirements/konflux-build-aipcc-requirements.txt" "$workdir" 0
    uv_warm_and_offline \
        runtime "$ROOT_DIR/requirements/konflux-aipcc-requirements.txt" "$workdir" 0
    if [[ "$(uname -s)" == "Linux" && "$(uname -m)" == "x86_64" ]]; then
        command -v pg_config >/dev/null 2>&1 || fail "pg_config is required to build psycopg2; install libpq-dev"
        uv_warm_and_offline \
            pypi "$ROOT_DIR/requirements/konflux-pypi-requirements.txt" "$workdir" 1
    elif [[ "${REQUIRE_NATIVE_WHEEL_PROOF:-0}" == "1" ]]; then
        fail "the PyPI sdist phase requires a linux/amd64 runner, got $(uname -s)/$(uname -m)"
    else
        warn "skipping the PyPI sdist phase on $(uname -s)/$(uname -m); CI runs it on linux/amd64"
    fi

    build_source_wheels "$workdir"
    pip_wheelhouse "$workdir"
    if [[ "$(uname -s)" == "Linux" && "$(uname -m)" == "x86_64" ]]; then
        check_runtime_closure "$workdir"
    else
        warn "skipping the combined runtime closure check on $(uname -s)/$(uname -m)"
    fi
    log "PASS: Python hermetic preflight"
}

yarn_hermetic() {
    require_command node
    local js_dir="$ROOT_DIR/mlflow/server/js"
    local yarn_rel="yarn/releases/yarn-4.12.0.cjs"
    [[ -f "$js_dir/$yarn_rel" ]] || fail "checked-in Yarn release is missing: $js_dir/$yarn_rel"

    local workdir
    workdir=$(make_workdir yarn)
    cleanup_paths+=("$workdir")

    local js_copy="$workdir/js"
    mkdir -p "$js_copy"
    tar -C "$js_dir" \
        --exclude=node_modules \
        --exclude=.yarn/install-state.gz \
        --exclude=.yarn/unplugged \
        -cf - . | tar -C "$js_copy" -xf -
    local yarn_cjs="$js_copy/$yarn_rel"

    export YARN_GLOBAL_FOLDER="$workdir/global"
    export YARN_ENABLE_GLOBAL_CACHE=true
    export YARN_ENABLE_TELEMETRY=0
    export YARN_ENABLE_PROGRESS_BARS=0
    export YARN_HTTP_TIMEOUT=120000

    local lock_before="$workdir/yarn.lock.before"
    cp "$js_copy/yarn.lock" "$lock_before"

    log "::group::Yarn warm cache"
    (
        cd "$js_copy"
        YARN_ENABLE_HARDENED_MODE=0 node "$yarn_cjs" install --immutable --mode=skip-build
    )
    cache_files=$(find "$YARN_GLOBAL_FOLDER" -type f | wc -l | tr -d ' ')
    [[ "$cache_files" -gt 0 ]] || fail "Yarn warm install populated no global cache files"
    log "Yarn global cache contains $cache_files files"
    log "::endgroup::"

    log "::group::Yarn offline immutable install"
    rm -rf "$js_copy/node_modules" "$js_copy/.yarn/install-state.gz" "$js_copy/.yarn/unplugged"
    (
        cd "$js_copy"
        YARN_ENABLE_HARDENED_MODE=0 \
            YARN_ENABLE_OFFLINE_MODE=true YARN_ENABLE_NETWORK=false \
            node "$yarn_cjs" install --immutable --mode=skip-build
    )
    [[ -d "$js_copy/node_modules" ]] || fail "Yarn offline install produced no node_modules"
    cmp -s "$lock_before" "$js_copy/yarn.lock" || fail "Yarn install changed yarn.lock"
    log "::endgroup::"
    log "PASS: Yarn hermetic preflight"
}

dump_runtime() {
    local container=$1
    local stub_log=$2
    set +e
    echo "--- docker ps -a ---"
    docker ps -a
    echo "--- docker inspect ---"
    docker inspect "$container"
    echo "--- docker logs ---"
    docker logs --tail 200 "$container" 2>&1
    echo "--- Kubernetes API stub log ---"
    cat "$stub_log"
    set -e
}

runtime_smoke() (
    local image=$1
    local workdir=$2
    local stub_log="$workdir/kubernetes-api.log"
    local kubeconfig="$workdir/kubeconfig"
    local container="mlflow-konflux-smoke-$$"
    local stub_pid=""
    local stub_port server_port

    stub_port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("", 0)); print(s.getsockname()[1]); s.close()')
    server_port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("", 0)); print(s.getsockname()[1]); s.close()')

    # shellcheck disable=SC2329  # invoked indirectly by the EXIT trap
    cleanup_runtime() {
        set +e
        docker rm -f "$container" >/dev/null 2>&1
        if [[ -n "$stub_pid" ]]; then
            kill "$stub_pid" >/dev/null 2>&1
            wait "$stub_pid" >/dev/null 2>&1
        fi
        set -e
    }
    trap cleanup_runtime EXIT

    PYTHONUNBUFFERED=1 python3 "$ROOT_DIR/scripts/kubernetes_api_stub.py" \
        --port "$stub_port" \
        --kubeconfig "$kubeconfig" \
        --server-host host.docker.internal >"$stub_log" 2>&1 &
    stub_pid=$!

    local stub_ready_line="READY stub listening on 0.0.0.0:${stub_port};"
    local ready=false
    for _ in $(seq 1 30); do
        if grep -Fq "$stub_ready_line" "$stub_log" &&
            curl --connect-timeout 1 --max-time 2 -fsS \
                "http://127.0.0.1:${stub_port}/readyz" >/dev/null 2>&1; then
            ready=true
            break
        fi
        sleep 1
    done
    [[ "$ready" == "true" ]] || { cat "$stub_log"; fail "Kubernetes API stub did not become ready"; }

    docker run -d --platform linux/amd64 \
        --name "$container" \
        --add-host=host.docker.internal:host-gateway \
        -p "127.0.0.1:${server_port}:5000" \
        -e MLFLOW_BACKEND_STORE_URI=sqlite:////tmp/mlflow.db \
        -e MLFLOW_DEFAULT_ARTIFACT_ROOT=/tmp/mlflow-artifacts \
        -e KUBECONFIG=/tmp/kubeconfig \
        -v "$kubeconfig:/tmp/kubeconfig:ro" \
        "$image" >/dev/null

    ready=false
    for _ in $(seq 1 90); do
        if curl --connect-timeout 1 --max-time 3 -fsS \
            "http://127.0.0.1:${server_port}/health" >/dev/null 2>&1; then
            ready=true
            break
        fi
        if [[ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null)" != "true" ]]; then
            dump_runtime "$container" "$stub_log"
            fail "MLflow server exited before becoming healthy"
        fi
        sleep 1
    done
    if [[ "$ready" != "true" ]]; then
        dump_runtime "$container" "$stub_log"
        fail "MLflow server did not answer /health within 90 seconds"
    fi

    local version
    version=$(curl --connect-timeout 2 --max-time 10 -fsS \
        "http://127.0.0.1:${server_port}/version")
    [[ -n "$version" ]] || { dump_runtime "$container" "$stub_log"; fail "/version returned an empty body"; }
    log "MLflow server version: $version"

    curl --connect-timeout 2 --max-time 30 -fsS \
        "http://127.0.0.1:${server_port}/" >"$workdir/root.html"
    grep -qi '<div id="root"' "$workdir/root.html" || {
        dump_runtime "$container" "$stub_log"
        fail "the server did not serve the built UI index.html"
    }

    sleep 8
    running=$(docker inspect -f '{{.State.Running}}' "$container")
    restarts=$(docker inspect -f '{{.RestartCount}}' "$container")
    [[ "$running" == "true" ]] || { dump_runtime "$container" "$stub_log"; fail "MLflow server stopped after startup"; }
    [[ "$restarts" == "0" ]] || { dump_runtime "$container" "$stub_log"; fail "MLflow server restarted $restarts time(s)"; }

    local container_logs
    if ! container_logs=$(docker logs "$container" 2>&1); then
        dump_runtime "$container" "$stub_log"
        fail "could not read container logs"
    fi
    if grep -Eq 'Traceback \(most recent call last\)|ModuleNotFoundError|Address already in use' \
        <<<"$container_logs"; then
        dump_runtime "$container" "$stub_log"
        fail "container logs contain a crash signature"
    fi

    log "--- container log tail ---"
    docker logs --tail 20 "$container" 2>&1
)

image_validation() {
    require_command docker
    require_command curl
    require_command python3
    docker info >/dev/null 2>&1 || fail "Docker daemon is not available"

    local image=${KONFLUX_IMAGE_TAG:-mlflow-konflux-pr:local}
    local workdir
    workdir=$(make_workdir image)
    cleanup_paths+=("$workdir")

    # Build the UI stage first. BuildKit otherwise runs the independent UI and
    # Python stages concurrently; the Node build plus the final pip install can
    # exceed smaller CI or Docker Desktop memory limits.
    log "::group::docker build UI stage linux/amd64"
    docker build --platform linux/amd64 --progress=plain \
        --target ui-builder \
        -f "$ROOT_DIR/Dockerfile.konflux" \
        -t "${image}-ui-builder" \
        "$ROOT_DIR"
    log "::endgroup::"

    log "::group::docker build linux/amd64"
    docker build --platform linux/amd64 --progress=plain -f "$ROOT_DIR/Dockerfile.konflux" -t "$image" "$ROOT_DIR"
    log "::endgroup::"

    local architecture
    architecture=$(docker image inspect -f '{{.Architecture}}' "$image")
    [[ "$architecture" == "amd64" ]] || fail "expected an amd64 image, docker reports $architecture"

    log "::group::in-image contract assertions"
    docker run --rm --platform linux/amd64 \
        --entrypoint /bin/bash \
        -v "$ROOT_DIR/scripts/validate-image.sh:/tmp/validate-image.sh:ro" \
        "$image" /tmp/validate-image.sh
    log "::endgroup::"

    log "::group::runtime smoke"
    runtime_smoke "$image" "$workdir"
    log "::endgroup::"
    log "PASS: image build and runtime smoke"
}

mode=${1:-}
case "$mode" in
    static)
        require_command python3
        exec python3 "$ROOT_DIR/scripts/konflux_contract.py" --root "$ROOT_DIR"
        ;;
    python-hermetic)
        python_hermetic
        ;;
    yarn-hermetic)
        yarn_hermetic
        ;;
    image)
        image_validation
        ;;
    -h | --help | help)
        usage
        ;;
    *)
        usage >&2
        exit 2
        ;;
esac
