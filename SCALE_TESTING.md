# OpenShift scale-test image

This local feature branch combines ODH master
`a721e22361b5161ee45d1639372d82c2cfbd5c59` with upstream MLflow
`34c75beb57e0cecf3556df2ebc5f29689cf2e15c` (`3.16.2.dev0`). It is intended
for database scale testing through the MLflow Operator.

`Dockerfile.konflux` builds the Kubernetes plugin from the pinned Git source
`8e1d9c6fbc063a137326d17e6f16dc3d5d59a7ed`, separately from the hashed
requirements. Its wheel is installed by the existing runtime installation step.
The feature plugin retains version `1.6.0`; use the source SHA to identify it.

## Build before plugin publication

Copy the Phase 1 wheel into the MLflow build context:

```sh
mkdir -p scale-testing-plugins
cp ../mlflow-kubernetes-plugins/dist/mlflow_kubernetes_plugins-1.6.0-py3-none-any.whl \
  scale-testing-plugins/
sha256sum scale-testing-plugins/mlflow_kubernetes_plugins-1.6.0-py3-none-any.whl
```

Expected SHA256:
`8217520438f1849d7b0602ef7fd4944fa7fe99ff30f63a9e369d00125e5d17ff`.
Keep this temporary directory out of commits (add `/scale-testing-plugins/`
to `.git/info/exclude`). Build a local image:

```sh
podman build -f Dockerfile.konflux \
  --build-arg MLFLOW_KUBERNETES_PLUGINS_SOURCE=/src/scale-testing-plugins/mlflow_kubernetes_plugins-1.6.0-py3-none-any.whl \
  -t localhost/mlflow:openshift-scale-testing-34c75beb .
```

Docker supports the same build command and argument. Remove the temporary wheel
directory after local validation if it is no longer needed.

## Build after publication

Once the plugin commit is published, the default build argument works directly:

```sh
podman build -f Dockerfile.konflux \
  -t localhost/mlflow:openshift-scale-testing-34c75beb .
```

The existing GitHub operator-integration workflow builds this Dockerfile and
therefore uses the same pinned source. Both feature branches must be published
before remote CI can validate them. The default plugin Git URL is unavailable
until publication. Branches, tags, and images remain local pending user direction.

## Runtime and remaining validation

The image retains the Kubernetes authentication app, Kubernetes workspace store,
disabled assistant/gateway/job execution defaults, and ODH federated UI. The
Operator phase will supply PostgreSQL, artifact storage, service-account/RBAC,
and scale-test settings. No cluster deployment is part of this phase.

Builds need network access to GitHub, the UBI registries, npm, and the configured
Red Hat AIPCC Python index. Hermetic Konflux Git prefetch is a follow-up; this
Dockerfile change alone does not enable hermetic builds. Other architectures,
full GitHub CI, visual UI checks, and Operator-driven OpenShift scale tests
remain pending.

See `FORK_HISTORY.md` for rebase decisions and the workspace handoff for local
test results, image provenance, and the next phase.
