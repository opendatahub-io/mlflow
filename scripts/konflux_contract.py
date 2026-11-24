"""Validate the Konflux artifact contract for mlflow pull requests.

The PR PipelineRun, Dockerfile.konflux, Hermeto prefetch inputs and package
manager locks are one contract. This checker reads those files directly so a
missing prefetch input fails here instead of failing later in a hermetic
Konflux build.
"""

from __future__ import annotations

import argparse
import json
import posixpath
import re
import shlex
import sys
from pathlib import Path

EXPECTED_IMAGE = "quay.io/opendatahub/mlflow:odh-pr"
EXPECTED_DOCKERFILE = "Dockerfile.konflux"
EXPECTED_PIPELINE = "pipeline/multi-arch-container-build.yaml"
EXPECTED_PLATFORMS = (
    "linux-extra-fast/amd64",
    "linux-m2xlarge/arm64",
    "linux/ppc64le",
    "linux/s390x",
)
REQUIRED_ARCHES = ("x86_64", "aarch64", "ppc64le", "s390x")
REQUIRED_BUILD_ARCHES = ("amd64", "arm64", "ppc64le", "s390x")
PIP_REQUIREMENTS = (
    "requirements/konflux-pypi-requirements.txt",
    "requirements/konflux-aipcc-requirements.txt",
    "requirements/konflux-build-aipcc-requirements.txt",
)
RPM_PROVIDES = {"postgresql-libs": {"libpq"}}
EXPECTED_CMD = [
    "python3.12",
    "-m",
    "mlflow",
    "server",
    "--host",
    "0.0.0.0",
    "--port",
    "5000",
    "--app-name",
    "kubernetes-auth",
    "--enable-workspaces",
    "--workspace-store-uri",
    "kubernetes://",
    "--serve-artifacts",
]


def _emit(message: str) -> None:
    sys.stdout.write(message + "\n")


class ContractChecker:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.passed = 0
        self.failures: list[str] = []
        self.warnings: list[str] = []

    def require(self, condition: bool, message: str) -> None:
        if condition:
            self.passed += 1
        else:
            self.failures.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    def read(self, relative: str) -> str:
        path = self.root / relative
        if not path.is_file():
            self.require(False, f"{relative} is missing")
            return ""
        content = path.read_text(encoding="utf-8")
        if not content.strip():
            self.require(False, f"{relative} is empty")
            return ""
        return content

    def resolve(self, relative: str) -> Path:
        return (self.root / relative).resolve()

    def inside_root(self, path: Path) -> bool:
        try:
            path.relative_to(self.root)
            return True
        except ValueError:
            return False

    def require_inside_root(self, path: Path, label: str) -> bool:
        return self.resolve_inside_root(path, label) is not None

    def resolve_inside_root(self, path: Path, label: str) -> Path | None:
        resolved = path.resolve()
        inside = self.inside_root(resolved)
        self.require(inside, f"{label} resolves outside the repository: {path}")
        return resolved if inside else None

    def run(self) -> int:
        try:
            self.check_pipeline()
            self.check_dockerfile()
            self.check_rpm_lock()
            self.check_yarn_inputs()
            self.check_workflow()
        except Exception as exc:  # a checker crash must be a failure
            self.require(False, f"contract checker crashed: {type(exc).__name__}: {exc}")

        for warning in self.warnings:
            _emit(f"WARN: {warning}")
        for failure in self.failures:
            _emit(f"FAIL: {failure}")

        if self.failures:
            _emit(
                f"FAILED: {len(self.failures)} contract check(s) failed, "
                f"{self.passed} passed, {len(self.warnings)} warning(s)"
            )
            return 1

        _emit(
            f"PASS: {self.passed} Konflux contract checks passed ({len(self.warnings)} warning(s))"
        )
        return 0

    def check_pipeline(self) -> None:
        pr_pipelines = sorted((self.root / ".tekton").glob("*pull-request.yaml"))
        self.require(
            len(pr_pipelines) == 1,
            f"expected exactly one .tekton/*pull-request.yaml artifact, found "
            f"{[p.name for p in pr_pipelines]}",
        )

        text = self.read(".tekton/mlflow-pull-request.yaml")
        if not text:
            return

        self.require(
            _param_scalar(text, "dockerfile") == EXPECTED_DOCKERFILE,
            f"PipelineRun dockerfile must be {EXPECTED_DOCKERFILE}",
        )
        self.require(
            _param_scalar(text, "path-context") == ".",
            "PipelineRun path-context must be . so the prefetch and image share one context",
        )
        self.require(
            _param_scalar(text, "hermetic") == "true",
            "PipelineRun hermetic must be true",
        )
        self.require(
            _param_scalar(text, "output-image") == EXPECTED_IMAGE,
            f"PipelineRun output-image must be {EXPECTED_IMAGE}",
        )
        self.require(
            _param_scalar(text, "pathInRepo") == EXPECTED_PIPELINE,
            f"PipelineRun must resolve {EXPECTED_PIPELINE}",
        )
        pipeline_url = _param_scalar(text, "url") or ""
        self.require(
            "odh-konflux-central" in pipeline_url,
            "PipelineRun must resolve the odh-konflux-central pipeline",
        )

        self.check_build_platforms(text)
        self.check_prefetch(text)
        self.check_prefetch_resources(text)

    def check_build_platforms(self, text: str) -> None:
        platforms = _param_list(text, "build-platforms")
        self.require(bool(platforms), "PipelineRun must declare build-platforms")
        if not platforms:
            return

        arches = [platform.rsplit("/", 1)[-1] for platform in platforms]
        missing = [arch for arch in REQUIRED_BUILD_ARCHES if arch not in arches]
        self.require(
            not missing,
            "PipelineRun build-platforms is missing required architecture leg(s): "
            + ", ".join(missing),
        )
        self.require(
            len(arches) == len(set(arches)),
            f"PipelineRun build-platforms contains duplicate architectures: {platforms}",
        )
        if tuple(platforms) != EXPECTED_PLATFORMS:
            self.warn(
                "PipelineRun runner labels changed from the reviewed contract "
                f"{list(EXPECTED_PLATFORMS)} to {platforms}; "
                "all four architecture legs are still present"
            )
        _emit(
            "INFO: GitHub Actions builds linux/amd64 only. The four Tekton "
            "build-platforms above are the multi-arch contract; an amd64 image is not "
            "evidence for arm64, ppc64le or s390x."
        )

    def check_prefetch(self, text: str) -> None:
        raw_prefetch = _param_scalar(text, "prefetch-input")
        if not raw_prefetch:
            self.require(False, "PipelineRun prefetch-input must be a JSON array")
            return
        try:
            prefetch = json.loads(raw_prefetch)
        except json.JSONDecodeError as exc:
            self.require(False, f"PipelineRun prefetch-input is not valid JSON: {exc}")
            return
        if not isinstance(prefetch, list):
            self.require(False, "PipelineRun prefetch-input must be a JSON array")
            return

        types = sorted(entry.get("type") for entry in prefetch if isinstance(entry, dict))
        self.require(
            types == ["pip", "pip", "rpm", "yarn"],
            f"expected two pip prefetches plus one yarn and one rpm prefetch, found {types}",
        )

        pip_entries = [entry for entry in prefetch if entry.get("type") == "pip"]
        yarn_entries = [entry for entry in prefetch if entry.get("type") == "yarn"]
        rpm_entries = [entry for entry in prefetch if entry.get("type") == "rpm"]
        self.require(
            len(pip_entries) == 2, f"expected two pip prefetches, found {len(pip_entries)}"
        )
        self.require(
            len(yarn_entries) == 1, f"expected one yarn prefetch, found {len(yarn_entries)}"
        )
        self.require(len(rpm_entries) == 1, f"expected one rpm prefetch, found {len(rpm_entries)}")

        covered: set[str] = set()
        for entry in pip_entries:
            entry_path = entry.get("path")
            requirements = entry.get("requirements_files")
            self.require(
                isinstance(entry_path, str) and entry_path != "",
                f"pip prefetch has no path: {entry}",
            )
            self.require(
                isinstance(requirements, list) and bool(requirements),
                f"pip prefetch at {entry_path!r} has no requirements_files",
            )
            if not isinstance(entry_path, str) or not isinstance(requirements, list):
                continue

            prefetch_path = self.resolve(entry_path)
            self.require(
                prefetch_path.is_dir() and self.inside_root(prefetch_path),
                f"pip prefetch path {entry_path!r} does not exist inside the repository",
            )
            for requirement in requirements:
                if not isinstance(requirement, str) or Path(requirement).is_absolute():
                    self.require(False, f"invalid pip requirement path {requirement!r}")
                    continue
                relative = posixpath.normpath(posixpath.join(entry_path, requirement))
                resolved = self.resolve(relative)
                self.require(
                    self.inside_root(resolved) and resolved.is_file(),
                    f"prefetched pip requirements file {relative!r} does not exist",
                )
                covered.add(relative)

        dockerfile = self.read(EXPECTED_DOCKERFILE)
        dockerfile_requirements = _dockerfile_requirements_paths(dockerfile)
        self.require(
            bool(dockerfile_requirements),
            "Dockerfile.konflux must install from at least one requirements file",
        )
        for requirement in sorted(set(PIP_REQUIREMENTS) | dockerfile_requirements):
            self.require(
                requirement in covered,
                f"Dockerfile requirements file {requirement!r} is not covered by any pip prefetch",
            )

        pypi_entries = [
            entry
            for entry in pip_entries
            if "requirements/konflux-pypi-requirements.txt" in entry.get("requirements_files", [])
        ]
        self.require(
            len(pypi_entries) == 1,
            "the PyPI wheel prefetch must be a single dedicated pip input",
        )

        aipcc_entries = [
            entry
            for entry in pip_entries
            if entry.get("path") == "requirements"
            and "konflux-aipcc-requirements.txt" in entry.get("requirements_files", [])
        ]
        self.require(
            len(aipcc_entries) == 1,
            "the runtime/build AIPCC requirements must be prefetched from requirements/",
        )
        for entry in aipcc_entries:
            binary = entry.get("binary")
            self.require(
                isinstance(binary, dict) and binary.get("arch") == ":all:",
                "the AIPCC pip prefetch must set binary.arch to :all: for the four build platforms",
            )

        for entry in pypi_entries:
            binary = entry.get("binary")
            if not (isinstance(binary, dict) and binary.get("arch") == ":all:"):
                self.warn(
                    "the PyPI prefetch has no binary.arch=:all: while the image targets four "
                    "architectures; confirm Hermeto fetches k8s/psycopg2 wheels for all legs "
                    "and pin the follow-up in odh-konflux-central"
                )

        for entry in yarn_entries:
            self.check_prefetch_path(entry, "mlflow/server/js", "yarn")
        for entry in rpm_entries:
            self.check_prefetch_path(entry, "requirements", "rpm")

    def check_prefetch_path(self, entry: dict[str, object], expected: str, kind: str) -> None:
        path = entry.get("path")
        self.require(path == expected, f"{kind} prefetch path must be {expected!r}, found {path!r}")
        if isinstance(path, str):
            resolved = self.resolve(path)
            self.require(
                resolved.is_dir() and self.inside_root(resolved),
                f"{kind} prefetch path {path!r} does not exist inside the repository",
            )

    def check_prefetch_resources(self, text: str) -> None:
        marker = "pipelineTaskName: prefetch-dependencies"
        start = text.find(marker)
        if start < 0:
            self.warn(
                "PipelineRun has no taskRunSpecs entry for prefetch-dependencies. "
                "Yarn Berry prefetch has hung or timed out under memory pressure; "
                "confirm the odh-konflux-central prefetch resources"
            )
            return
        block = text[start : start + 400]
        if not re.search(r"memory:\s*['\"]?6Gi['\"]?", block):
            self.warn(
                "PipelineRun prefetch-dependencies does not keep the reviewed 6Gi "
                "memory guard. Yarn Berry prefetch has hung or timed out without it; "
                "confirm the odh-konflux-central task resources"
            )

    def check_dockerfile(self) -> None:
        dockerfile_path = self.root / EXPECTED_DOCKERFILE
        self.require(dockerfile_path.is_file(), f"{EXPECTED_DOCKERFILE} is missing")
        if not dockerfile_path.is_file():
            return

        text = dockerfile_path.read_text(encoding="utf-8")
        stage_starts = list(re.finditer(r"(?m)^FROM\s+.+$", text))
        self.require(
            len(stage_starts) == 3,
            f"expected three Dockerfile stages, found {len(stage_starts)}",
        )
        final_stage = text[stage_starts[-1].end() :] if stage_starts else ""

        self.require(
            not re.search(r"(?m)^COPY\s+\.\s+\.", final_stage),
            "final stage must not copy the source tree into /app; it can shadow site-packages",
        )
        self.require(
            not re.search(r"(?m)^COPY\s+--from=python-builder\s+\.\s+\.", final_stage),
            "final stage must not copy the python-builder source tree into /app",
        )

        requirement_refs = set(re.findall(r"requirements/([A-Za-z0-9_.-]+\.txt)", text))
        for requirement in PIP_REQUIREMENTS:
            self.require(
                requirement.rsplit("/", 1)[-1] in requirement_refs,
                f"Dockerfile does not consume {requirement}",
            )

        self.require(
            "pip wheel" in text and "requirements/konflux-pypi-requirements.txt" in text,
            "Dockerfile must build the PyPI wheel set from konflux-pypi-requirements.txt",
        )
        self.require(
            "pip install" in text and "requirements/konflux-build-aipcc-requirements.txt" in text,
            "Dockerfile must install the build AIPCC requirements",
        )
        self.require(
            "requirements/konflux-aipcc-requirements.txt" in text
            and "/tmp/konflux-aipcc-requirements.txt" in text,
            "Dockerfile must install the runtime AIPCC requirements",
        )
        self.require(
            "cp pyproject.release.toml pyproject.toml" in text,
            "Dockerfile must build the release metadata, not the upstream development pyproject",
        )
        for target in ("libs/tracing", "libs/skinny", "."):
            self.require(
                f"python -m build --wheel --outdir /tmp/dist {target}" in text,
                f"Dockerfile must build the source wheel for {target}",
            )

        install_match = re.search(r"(?m)^\s*microdnf\s+install\s+(?P<args>[^&\n]+)", final_stage)
        self.require(install_match is not None, "final stage must install RPMs with microdnf")
        direct_packages: list[str] = []
        if install_match:
            try:
                tokens = shlex.split(install_match.group("args"))
            except ValueError as exc:
                self.require(False, f"cannot parse microdnf install arguments: {exc}")
            else:
                direct_packages = [token for token in tokens if not token.startswith("-")]
                self.require(
                    bool(direct_packages),
                    "microdnf install did not declare any direct runtime packages",
                )

        cmd_match = re.search(r"(?m)^CMD\s+(?P<json>\[.*\])\s*$", final_stage)
        self.require(cmd_match is not None, "final stage must declare the container CMD")
        if cmd_match:
            try:
                command = json.loads(cmd_match.group("json"))
            except json.JSONDecodeError as exc:
                self.require(False, f"container CMD is not valid JSON: {exc}")
            else:
                self.require(
                    command == EXPECTED_CMD,
                    f"container CMD changed from the reviewed contract: {command}",
                )

        self.require(
            re.search(r"(?m)^USER\s+1001\s*$", final_stage) is not None,
            "final stage must run as UID 1001",
        )
        self.require(
            "update-crypto-policies --set DEFAULT:PQ" in final_stage,
            "final stage must set crypto policy DEFAULT:PQ",
        )
        self.require(
            "python3.12 -m pip check" in final_stage,
            "final stage must run pip check",
        )
        self.require(
            "python3.12 -m mlflow server --help" in final_stage,
            "final stage must exercise the MLflow server entry point",
        )
        self.require(
            'entry_points(group="mlflow.workspace_provider")["kubernetes"].load()' in final_stage,
            "final stage must load the kubernetes workspace provider entry point",
        )
        self.require(
            'entry_points(group="mlflow.app")["kubernetes-auth"].load()' in final_stage,
            "final stage must load the kubernetes-auth app entry point",
        )
        self.require(
            "COPY --from=ui-builder /opt/app-root/src/build" in final_stage,
            "final stage must copy the UI build from ui-builder",
        )

        self.require(
            "yarn install --immutable" in text,
            "UI builder must run yarn install --immutable",
        )
        self.require(
            "yarn build:federated" in text,
            "UI builder must produce the federated remoteEntry assets",
        )
        self.require(
            "YARN_ENABLE_GLOBAL_CACHE=true" in text,
            "UI builder must use the Hermeto-provided Yarn global cache",
        )
        self.require(
            "YARN_ENABLE_OFFLINE_MODE=true" in text,
            "UI builder must enable Yarn offline mode when Hermeto is present",
        )
        self.require(
            "YARN_ENABLE_NETWORK=false" in text,
            "UI builder must disable the Yarn network when Hermeto is present",
        )
        self.require(
            "/cachi2/cachi2.env" in text,
            "UI builder must source the Hermeto prefetch environment",
        )
        if "/cachi2/cachi2.env" in text and "/hermeto/hermeto.env" not in text:
            self.warn(
                "Dockerfile sources only /cachi2/cachi2.env. If odh-konflux-central moves to "
                "hermeto.repo without a matching buildah task, RPM downloads will be blocked. "
                "Track this as a pinned-central follow-up; a local build cannot fix it"
            )

        self.check_rpm_packages(direct_packages)

    def check_rpm_packages(self, direct_packages: list[str]) -> None:
        in_text = self.read("requirements/rpms.in.yaml")
        if not in_text:
            return
        declared = _yaml_list(in_text, "packages")
        self.require(bool(declared), "requirements/rpms.in.yaml must declare packages")
        self.require(
            set(direct_packages) == set(declared),
            "microdnf packages and requirements/rpms.in.yaml packages differ: "
            f"dockerfile={sorted(direct_packages)} lock-input={sorted(declared)}",
        )

    def check_rpm_lock(self) -> None:
        in_text = self.read("requirements/rpms.in.yaml")
        lock_text = self.read("requirements/rpms.lock.yaml")
        if not in_text or not lock_text:
            return

        declared = _yaml_list(in_text, "packages")
        in_arches = _yaml_list(in_text, "arches")
        self.require(
            set(in_arches) == set(REQUIRED_ARCHES),
            f"rpms.in.yaml arches must be {list(REQUIRED_ARCHES)}, found {in_arches}",
        )

        containerfile = _yaml_scalar(in_text, "containerfile")
        self.require(
            containerfile == f"../{EXPECTED_DOCKERFILE}",
            f"rpms.in.yaml context.containerfile must be ../{EXPECTED_DOCKERFILE}",
        )
        if containerfile:
            resolved = (self.root / "requirements" / containerfile).resolve()
            self.require(
                self.inside_root(resolved) and resolved.is_file(),
                f"rpms.in.yaml context.containerfile {containerfile!r} does not exist",
            )

        lock_arches = _parse_rpm_lock(lock_text)
        self.require(
            set(lock_arches) == set(REQUIRED_ARCHES),
            f"rpms.lock.yaml arches must be {list(REQUIRED_ARCHES)}, found {sorted(lock_arches)}",
        )
        for arch in REQUIRED_ARCHES:
            binary_names = {
                package["name"]
                for package in lock_arches.get(arch, [])
                if package.get("name") and not _is_source_rpm(package.get("url", ""))
            }
            self.require(
                bool(binary_names),
                f"rpms.lock.yaml has no binary package context for {arch}",
            )
            for package in declared:
                provided_by = {package} | RPM_PROVIDES.get(package, set())
                self.require(
                    bool(provided_by & binary_names),
                    f"runtime RPM {package!r} is missing from the {arch} lock context; "
                    "a hermetic microdnf install would block",
                )
            self.require(
                "crypto-policies-scripts" in binary_names,
                f"crypto-policies-scripts is missing from the {arch} lock context; "
                "this is the known crypto-policies/DEFAULT:PQ hermetic break",
            )

    def check_yarn_inputs(self) -> None:
        js_dir = self.root / "mlflow/server/js"
        yarnrc = js_dir / ".yarnrc.yml"
        package_json = js_dir / "package.json"
        yarn_lock = js_dir / "yarn.lock"
        self.require(yarnrc.is_file(), "mlflow/server/js/.yarnrc.yml is missing")
        self.require(package_json.is_file(), "mlflow/server/js/package.json is missing")
        self.require(yarn_lock.is_file(), "mlflow/server/js/yarn.lock is missing")
        if not (yarnrc.is_file() and package_json.is_file() and yarn_lock.is_file()):
            return

        yarnrc_text = yarnrc.read_text(encoding="utf-8")
        self.require(
            _yarnrc_value(yarnrc_text, "nodeLinker") == "node-modules",
            "Yarn must use the node-modules linker expected by the Dockerfile",
        )
        self.require(
            "enableImmutableInstalls: false" not in yarnrc_text,
            ".yarnrc.yml must not disable immutable installs",
        )
        yarn_path = _yarnrc_value(yarnrc_text, "yarnPath")
        self.require(bool(yarn_path), ".yarnrc.yml must pin yarnPath")
        if yarn_path:
            release_path = self.resolve_inside_root(js_dir / yarn_path, "checked-in Yarn release")
            if release_path is not None:
                self.require(
                    release_path.is_file(),
                    f"checked-in Yarn release {yarn_path!r} is missing",
                )

        try:
            package = json.loads(package_json.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            self.require(False, f"package.json is not valid JSON: {exc}")
            return

        package_manager = package.get("packageManager", "")
        self.require(
            isinstance(package_manager, str) and package_manager.startswith("yarn@"),
            "package.json must pin the Yarn version through packageManager",
        )
        if isinstance(package_manager, str) and yarn_path:
            expected_release = f"yarn-{package_manager.split('@', 1)[-1]}.cjs"
            self.require(
                expected_release in yarn_path,
                f"packageManager {package_manager!r} does not match yarnPath {yarn_path!r}",
            )

        supported = _yarn_supported_cpus(yarnrc_text)
        for cpu in ("x64", "arm64", "ppc64", "s390x"):
            self.require(
                cpu in supported,
                f"Yarn supportedArchitectures.cpu is missing {cpu} for the multi-arch image",
            )

        for workspace in package.get("workspaces", []) or []:
            workspace_path = self.resolve_inside_root(
                js_dir / workspace, f"Yarn workspace {workspace!r}"
            )
            if workspace_path is not None:
                self.require(
                    (workspace_path / "package.json").is_file(),
                    f"Yarn workspace {workspace!r} has no package.json",
                )

        for section in ("dependencies", "devDependencies", "optionalDependencies"):
            for dependency, spec in (package.get(section) or {}).items():
                if not isinstance(spec, str) or not spec.startswith("file:"):
                    continue
                relative = spec[len("file:") :]
                target = self.resolve_inside_root(
                    js_dir / relative, f"local Yarn dependency {dependency!r}"
                )
                if target is not None:
                    self.require(
                        target.exists(),
                        f"local Yarn dependency {dependency!r} points at missing {relative!r}",
                    )

        patch_text = (
            package_json.read_text(encoding="utf-8") + "\n" + yarn_lock.read_text(encoding="utf-8")
        )
        patch_refs = set(re.findall(r"#([A-Za-z0-9_./@!-]+\.(?:patch|diff))", patch_text))
        self.require(bool(patch_refs), "no checked-in Yarn patch references were found")
        for patch_ref in sorted(patch_refs):
            if "builtin" in patch_ref:
                continue
            patch_path = self.resolve_inside_root(
                js_dir / patch_ref, f"Yarn patch reference {patch_ref!r}"
            )
            if patch_path is not None:
                self.require(
                    patch_path.is_file(),
                    f"Yarn patch reference {patch_ref!r} does not resolve to a checked-in file",
                )

        vendor = js_dir / "vendor/design-system"
        vendor_package_path = vendor / "package.json"
        self.require(
            vendor_package_path.is_file(),
            "vendored design-system package.json is missing",
        )
        if vendor_package_path.is_file():
            try:
                vendor_package = json.loads(vendor_package_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                self.require(False, f"vendored design-system package.json is invalid: {exc}")
            else:
                for field in ("main", "types"):
                    value = vendor_package.get(field)
                    self.require(
                        isinstance(value, str) and (vendor / value).is_file(),
                        f"vendored design-system {field} target {value!r} is missing",
                    )
        for asset in ("dist/index.js", "dist/index.css", "dist-types/index.d.ts"):
            self.require(
                (vendor / asset).is_file(),
                f"vendored design-system asset {asset!r} is missing",
            )

    def check_workflow(self) -> None:
        workflow = self.read(".github/workflows/pr-build-validation.yml")
        script = self.read("scripts/validate-build.sh")
        image_script = self.read("scripts/validate-image.sh")
        if not workflow or not script or not image_script:
            return

        self.require("workflow_dispatch:" in workflow, "workflow must support workflow_dispatch")
        self.require(
            all(event in workflow for event in ("edited", "labeled", "unlabeled")),
            "workflow must rerun when PR title/labels change",
        )
        self.require(
            not re.search(r"(?m)^\s{4}paths(?:-ignore)?:", workflow),
            "workflow-level path filters would strand the required summary check",
        )
        self.require(
            "scripts/validate-build.sh image" in workflow,
            "workflow must invoke scripts/validate-build.sh image",
        )
        self.require(
            image_script.startswith("#!/usr/bin/env bash\nset -euo pipefail\n"),
            "scripts/validate-image.sh must use the Bash shebang and set -euo pipefail",
        )
        self.require(
            "--entrypoint /bin/bash" in script and "/tmp/validate-image.sh" in script,
            "image validation must invoke scripts/validate-image.sh under Bash",
        )
        self.require(
            not re.search(r"(?m)^\s*matrix:", workflow),
            "workflow must build one artifact, not a matrix of architecture variants",
        )

        docker_builds = []
        lines = script.splitlines()
        index = 0
        while index < len(lines):
            if not re.match(r"\s*docker build\b", lines[index]):
                index += 1
                continue
            block = [lines[index]]
            while lines[index].rstrip().endswith("\\") and index + 1 < len(lines):
                index += 1
                block.append(lines[index])
            docker_builds.append("\n".join(block))
            index += 1
        image_builds = [block for block in docker_builds if "--target" not in block]
        self.require(
            len(image_builds) == 1 and len(docker_builds) <= 2,
            "scripts/validate-build.sh must contain one final-image docker build "
            f"(plus at most one --target pre-build), found {len(docker_builds)} builds",
        )
        for build in docker_builds:
            self.require(
                "--platform linux/amd64" in build,
                "the CI image build must explicitly target linux/amd64",
            )

        checkout_count = len(re.findall(r"uses:\s*actions/checkout@", workflow))
        persist_count = len(re.findall(r"persist-credentials:\s*false", workflow))
        self.require(checkout_count > 0, "workflow must check out the repository")
        self.require(
            checkout_count == persist_count,
            f"every checkout needs persist-credentials: false ({checkout_count} checkouts, "
            f"{persist_count} opt-outs)",
        )

        for action in re.findall(r"(?m)^\s*uses:\s*(\S+)", workflow):
            if action.startswith("./"):
                continue
            self.require(
                re.search(r"@[0-9a-f]{40}$", action) is not None,
                f"external action {action!r} is not pinned to a commit SHA",
            )
        self.require(
            not re.search(r"(?m)^\s+[a-z-]+:\s*write\s*$", workflow),
            "workflow must not request write permissions",
        )
        self.require(
            not re.search(r"(?m)^\s*permissions:\s*(?:write-all|write)\s*$", workflow),
            "workflow must not request scalar write permissions",
        )
        self.require("if: always()" in workflow, "summary job must run with if: always()")
        self.require(
            "needs.check-skip.outputs.should-skip" in workflow,
            "validation jobs must consume the single skip gate output",
        )
        self.require(
            "should-skip" in workflow and "outputs:" in workflow,
            "check-skip must declare the should-skip output",
        )
        validation_guard = (
            "if: needs.check-skip.result == 'success' && "
            "needs.check-skip.outputs.should-skip == 'false'"
        )
        self.require(
            workflow.count(validation_guard) == 4,
            "all four validation jobs must require a successful explicit false skip decision",
        )


def _dockerfile_requirements_paths(text: str) -> set[str]:
    """Return every requirements/ file installed with ``-r`` in the Dockerfile.

    A file copied to /tmp is resolved back to its COPY source, so adding a new
    ``-r /tmp/...`` install cannot bypass the prefetch coverage check.
    """
    copied: dict[str, str] = {}
    for line in text.splitlines():
        match = re.match(r"^\s*COPY\s+(\S+)\s+(\S+)\s*$", line)
        if match and match.group(1).startswith("requirements/"):
            copied[match.group(2)] = match.group(1)

    paths: set[str] = set()
    for match in re.finditer(r"(?:^|\s)-r\s+(\S+)", text):
        operand = match.group(1)
        source = copied.get(operand, operand)
        if source.startswith("requirements/"):
            paths.add(posixpath.normpath(source))
    return paths


def _param_scalar(text: str, name: str) -> str | None:
    match = re.search(
        rf"(?m)^\s*-\s+name:\s*{re.escape(name)}\s*\n\s*value:\s*(?P<value>[^\n]*)$",
        text,
    )
    if not match:
        return None
    value = match.group("value").strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
        value = value[1:-1]
    return value


def _param_list(text: str, name: str) -> list[str]:
    match = re.search(
        rf"(?m)^\s*-\s+name:\s*{re.escape(name)}\s*\n\s*value:\s*\n"
        rf"(?P<body>(?:[ \t]*-[ \t]+\S[^\n]*\n?)+)",
        text,
    )
    if not match:
        return []
    return [
        re.sub(r"^\s*-\s*", "", line).strip()
        for line in match.group("body").splitlines()
        if line.strip()
    ]


def _yaml_list(text: str, key: str) -> list[str]:
    match = re.search(
        rf"(?m)^{re.escape(key)}:\s*\n(?P<body>(?:[ \t]*-[ \t]+\S[^\n]*\n?)+)",
        text,
    )
    if not match:
        return []
    return [
        re.sub(r"^\s*-\s*", "", line).strip()
        for line in match.group("body").splitlines()
        if line.strip()
    ]


def _yaml_scalar(text: str, key: str) -> str | None:
    match = re.search(
        rf"(?m)^\s*{re.escape(key)}:\s*(?P<value>[^#\n]+?)\s*$",
        text,
    )
    return match.group("value").strip().strip("'\"") if match else None


def _parse_rpm_lock(text: str) -> dict[str, list[dict[str, str]]]:
    arches: dict[str, list[dict[str, str]]] = {}
    current_arch: str | None = None
    current_package: dict[str, str] | None = None
    for line in text.splitlines():
        if arch_match := re.match(r"^- arch:\s*(\S+)\s*$", line):
            current_arch = arch_match.group(1)
            arches[current_arch] = []
            current_package = None
            continue
        url_match = re.match(r"^  - url:\s*(\S+)\s*$", line)
        if url_match and current_arch:
            current_package = {"url": url_match.group(1)}
            arches[current_arch].append(current_package)
            continue
        name_match = re.match(r"^    name:\s*(\S+)\s*$", line)
        if name_match and current_package is not None:
            current_package["name"] = name_match.group(1)
    return arches


def _is_source_rpm(url: str) -> bool:
    return url.endswith(".src.rpm") or "/source/" in url


def _yarnrc_value(text: str, key: str) -> str | None:
    match = re.search(rf"(?m)^{re.escape(key)}:\s*(?P<value>[^\n#]+?)\s*$", text)
    return match.group("value").strip() if match else None


def _yarn_supported_cpus(text: str) -> set[str]:
    """Read only supportedArchitectures.cpu, not other architecture lists."""
    cpus: set[str] = set()
    in_supported = False
    in_cpu = False
    for line in text.splitlines():
        if line.startswith("supportedArchitectures:"):
            in_supported = True
            continue
        if not in_supported:
            continue
        if line and not line[0].isspace():
            break
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("cpu:"):
            in_cpu = True
            inline = stripped[len("cpu:") :].strip()
            if inline.startswith("[") and inline.endswith("]"):
                cpus.update(
                    part.strip().strip("'\"") for part in inline[1:-1].split(",") if part.strip()
                )
            continue
        if stripped.endswith(":") and not stripped.startswith("-"):
            in_cpu = False
            continue
        if in_cpu:
            if match := re.match(r"^-\s*(\S+)", stripped):
                cpus.add(match.group(1))
    return cpus


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Repository root",
    )
    args = parser.parse_args()
    return ContractChecker(args.root).run()


if __name__ == "__main__":
    sys.exit(main())
