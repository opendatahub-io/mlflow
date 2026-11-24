# PR build validation

This workflow simulates the Konflux PR build for the single artifact declared in
`.tekton/mlflow-pull-request.yaml`:

`quay.io/opendatahub/mlflow:odh-pr`

It is intentionally not a replacement for the upstream Python and JavaScript
test suites. It checks the contract between the PipelineRun, the hermetic
prefetch inputs, the package-manager locks and the final image.

## Jobs

| Job | Command | What it proves |
| --- | --- | --- |
| `check-skip` | inline shell gate | One skip decision for the whole workflow, including title, label and changed-file filtering |
| `static-contract` | `bash scripts/validate-build.sh static` | Tekton inputs, Dockerfile stages/CMD, RPM lock coverage, checked-in Yarn inputs and workflow hardening still agree |
| `python-hermetic-preflight` | `bash scripts/validate-build.sh python-hermetic` | Each pinned Python requirements file can be installed after a warm cache is populated and the venv is deleted; source wheels build offline |
| `yarn-hermetic-preflight` | `bash scripts/validate-build.sh yarn-hermetic` | The checked-in Yarn 4 release, lockfile and vendored inputs install with immutable/offline/global-cache settings |
| `image-validation` | `bash scripts/validate-build.sh image` | The real `Dockerfile.konflux` image builds for `linux/amd64`, contains the expected distributions/UI/entry points/policy/non-root user and serves `/health`, `/version` and the UI |
| `summary` | inline Python | The only required status: fails if a validation job unexpectedly skips, fails or is cancelled |

## Contract checked by `static-contract`

The PipelineRun is the source of truth:

- `dockerfile: Dockerfile.konflux`
- `path-context: .`
- `hermetic: 'true'`
- one output image and one PR PipelineRun
- four prefetch inputs: two pip groups, one Yarn group and one RPM group
- four build platforms: `amd64`, `arm64`, `ppc64le`, `s390x`

The checker also verifies:

- every prefetch path and requirements file exists;
- every requirements file consumed by `Dockerfile.konflux` is covered by a pip
  prefetch entry;
- the AIPCC pip prefetch keeps `binary.arch: :all:`;
- every direct `microdnf` package is in `requirements/rpms.in.yaml` and in each
  architecture's binary package context in `requirements/rpms.lock.yaml`,
  including the `crypto-policies-scripts` case;
- the `prefetch-dependencies` task keeps the reviewed 6 GiB memory guard used
  to avoid the observed Yarn Berry prefetch hang; losing it is a warning that
  names the `odh-konflux-central` follow-up;
- `pyproject.release.toml`, the tracing/skinny/root source wheels, `pip check`,
  the server help path and both Kubernetes plugin entry points remain in the
  Dockerfile;
- the checked-in Yarn release, `yarn.lock`, patch files and vendored
  `@databricks/design-system` assets all exist;
- the final stage still runs as UID 1001 with `DEFAULT:PQ` and keeps the
  reviewed server CMD.

## Multi-arch behaviour

CI builds one concrete artifact for `linux/amd64` only. That is deliberate: the
GitHub-hosted runner cannot execute or prove the `arm64`, `ppc64le` or `s390x`
legs. The static check fails if the Tekton platform list loses any of those
architecture legs, and the workflow never presents the amd64 image as a
multi-arch proof. Actual multi-arch assembly remains owned by
`odh-konflux-central/pipeline/multi-arch-container-build.yaml`.

## Local use

```bash
bash scripts/validate-build.sh static
bash scripts/validate-build.sh python-hermetic
bash scripts/validate-build.sh yarn-hermetic
bash scripts/validate-build.sh image
```

Requirements:

- `static`: Python 3.10 or newer; no third-party packages.
- `python-hermetic`: Python 3.12, `uv`, a C compiler, and on `linux/amd64`
  `pg_config` (Ubuntu `libpq-dev`). The pinned `psycopg2` release is sdist-only
  on Linux; the UBI `python-312` builder contains `pg_config`.
- `yarn-hermetic`: Node 24 and network access for the warm-cache phase.
- `image`: a working Docker daemon, network access and enough disk for the UBI
  image build. The script builds the `ui-builder` stage first so BuildKit does
  not run the Node build and the final Python install concurrently; that
  concurrency exceeds a small Docker Desktop VM. Use a Linux `amd64` runner
  (the CI job uses `ubuntu-24.04`) for the authoritative image proof.

On macOS the Python preflight still runs the wheel-only AIPCC offline installs
and source-wheel build, but skips the native PyPI sdist phase. CI sets
`REQUIRE_NATIVE_WHEEL_PROOF=1`, so a non-Linux runner fails instead of silently
skipping.

## Skip gate

The workflow runs on `workflow_dispatch` and on pull request `opened`,
`synchronize`, `reopened`, `edited`, `labeled` and `unlabeled` events.

- `[skip konflux-sim]` in the PR title, or the `skip-konflux-sim` label, skips
  validation.
- A pull request that changes no build-relevant file also skips validation.
- `workflow_dispatch` never skips.
- PR-controlled text is passed through `env:`, never interpolated into a
  `run:` script.

Workflow-level `paths:` filters are not used, so the required `summary` check
always runs and distinguishes an intentional skip from a job that never ran.

## What this cannot catch

- `arm64`, `ppc64le` and `s390x` execution. The workflow checks the Tekton
  contract and builds `amd64` only.
- A version mismatch between the `odh-konflux-central` prefetch task and its
  buildah task. A `hermeto.repo`/`cachi2.repo` skew cannot be fixed from this
  repository; the static checker warns when the Dockerfile still assumes the
  cachi2 environment and names the pinned-central follow-up.
- MLflow operator readiness, `DataScienceCluster` convergence and Kubernetes
  deployment behaviour. Those are owned by `mlflow-operator` / the operator
  stack, not this image repository.
- The full upstream Python and JavaScript suites. Those stay in their existing
  workflows; this gate is focused on the shipped Konflux artifact.
- The real Hermeto transport. The Python/Yarn jobs prove the dependency closure
  from isolated caches, while `image-validation` proves the Dockerfile build.

## Historical evidence and guardrails

- A `crypto-policies-scripts` RPM that is absent from the lock context fails
  the static check for every architecture; the Dockerfile's `DEFAULT:PQ` policy
  depends on that package.
- A `hermeto.repo`/`cachi2.repo` mismatch between the central prefetch and
  buildah tasks is a warning, not a local-build claim. The fix belongs in
  `odh-konflux-central` and the warning names that follow-up.
- The Yarn Berry prefetch has hung or timed out under memory pressure. The
  Yarn job has a 30-minute timeout, the image job has 60 minutes, and the
  PipelineRun's 6 GiB prefetch guard is checked as a warning. This preflight
  proves the lock/input path, not the central prefetch runtime.
- MLflow operator readiness and `DataScienceCluster` convergence are outside
  this image repository and are not claimed as covered here.

## Skill follow-ups from this onboarding

These are the concrete gaps found while applying the simulator:

1. A Python project's `[tool.uv] constraint-dependencies` and a repo setup-uv
   action's `UV_EXCLUDE_NEWER`/index policy variables can leak into
   `uv pip install -r`; use `uv --no-config` and clear those environment
   variables so the preflight matches the Dockerfile's pip invocation.
2. PyPI requirements may need source builds. `psycopg2` is sdist-only on Linux,
   so a wheel-only preflight is wrong; the builder image must be checked for
   the matching native toolchain before deciding whether a missing wheel is a
   real failure.
3. A multi-arch PipelineRun's prefetch contract includes per-group binary
   architecture hints. An image-level `build-platforms` list alone does not
   prove that every pip group fetched wheels for every leg.
4. The `microdnf` package names and RPM lock names are not always identical
   (`postgresql-libs` resolves to `libpq`); a checker needs an explicit,
   reviewed provides map rather than a string equality check.
5. A Kubernetes-auth server smoke needs a fake API that answers the namespace
   list and the optional CRD lookup; the default CMD cannot start against an
   entirely empty environment.
