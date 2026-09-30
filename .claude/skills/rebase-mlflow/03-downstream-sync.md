# Phases 9–10: Downstream Sync & Operator Bump

## Phase 9: Downstream Sync

**Goal:** Sync the downstream productization repo (`red-hat-data-services/mlflow`) from midstream, then get the release branch updated.

40. **Configure the downstream remote** (verify URL even if remote already exists):

    ```bash
    git remote set-url $DOWNSTREAM_REMOTE https://github.com/red-hat-data-services/mlflow.git 2>/dev/null || \
      git remote add $DOWNSTREAM_REMOTE https://github.com/red-hat-data-services/mlflow.git
    git fetch $DOWNSTREAM_REMOTE main
    ```

41. **Create a sync branch and merge downstream main into it:**

    ```bash
    git checkout -b sync-odh-$UPSTREAM_TAG $ODH_REMOTE/master
    git merge $DOWNSTREAM_REMOTE/main --no-edit
    ```

42. **Resolve conflicts.** The downstream repo has its own deployment configs:

    | File                    | Take from      | Why                                                                                    |
    | ----------------------- | -------------- | -------------------------------------------------------------------------------------- |
    | `.tekton/*`             | **Downstream** | Auto-synced from `konflux-central`; downstream version matches the RHDS Konflux tenant |
    | `Dockerfile.konflux`    | **Downstream** | May have RHDS-specific build steps                                                     |
    | `.github/renovate.json` | **Downstream** | RHDS-specific renovate config                                                          |
    | `OWNERS`                | **Downstream** | Downstream-specific approvers                                                          |
    | `pyproject.toml`        | **Midstream**  | Take upstream's `required-version` and ODH config                                      |
    | Everything else         | **Midstream**  | That's the whole point of the sync                                                     |

    Verify:

    ```bash
    git diff $DOWNSTREAM_REMOTE/main -- .tekton/ Dockerfile.konflux .github/renovate.json  # should be 0
    git diff $ODH_REMOTE/master -- mlflow/ FORK_HISTORY.md                             # should be 0
    ```

43. **Run prettier** on any auto-merged files:

    ```bash
    uv run pre-commit run prettier --files .github/renovate.json
    ```

44. **Push and create PR** targeting `main` on the downstream repo. Use **"Create a merge commit"** when merging (not squash or rebase):

    ```bash
    git push $DOWNSTREAM_REMOTE sync-odh-$UPSTREAM_TAG
    gh pr create --repo red-hat-data-services/mlflow --base main \
      --head sync-odh-$UPSTREAM_TAG \
      --title "ODH Sync: MLflow $UPSTREAM_TAG rebase" \
      --body "## Summary

    Sync from opendatahub-io/mlflow after $UPSTREAM_TAG rebase.

    ## Upstream / Downstream Impact

    - [x] Downstream-only change for red-hat-data-services/mlflow"
    ```

    Expected CI: `Build and Push Image` will fail on PRs (no quay.io credentials for branches). `CodeQL` may flag pre-existing upstream patterns. Both are safe to ignore.

45. **After the sync PR merges to `main`**, notify the release engineering team to merge `main` into the active release branch (e.g., `rhoai-3.5-ea.2`). They do this via direct push (`git merge main`), not PRs.

---

## Phase 10: Operator Version Bump

**Goal:** Update the MLflow operator to expect the new MLflow version. Without this, the migration job fails with "unexpected MLflow version."

46. **Submit a PR to `opendatahub-io/mlflow-operator`** updating version references. `$CURRENT_VERSION` is the old version being replaced; the new version comes from `$UPSTREAM_TAG` (strip the `v` prefix for the version number):

    | File                                       | What to change                                     |
    | ------------------------------------------ | -------------------------------------------------- |
    | `config/component_metadata.yaml`           | `version: v3.X.0` — the source of truth            |
    | `.github/workflows/upgrade-validation.yml` | `jsonpath={.status.version}=3.X.0` in kubectl wait |

    ```bash
    # Find all references to the old version:
    grep -rn "$(echo $CURRENT_VERSION | sed 's/^v//')" config/ .github/workflows/upgrade-validation.yml
    ```

47. **After the operator PR merges**, notify the operator sync owner to sync it to `red-hat-data-services/mlflow-operator`.
