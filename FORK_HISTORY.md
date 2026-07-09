# Fork History

Rebase log for the OpenDataHub MLflow fork (opendatahub-io/mlflow).

Each rebase section records which downstream commits were kept, dropped, or squashed,
and how merge conflicts were resolved.

## Recurring post-rebase issues

These break CI after every rebase. Fix them proactively before pushing.

1. **i18n key drift** — Conflict resolution keeps i18n entries from both sides, but some upstream keys reference components removed in the same release. Run `cd mlflow/server/js && yarn i18n` to remove orphaned keys from `en.json`.

2. **`UV_EXCLUDE_NEWER` env var** — `.github/actions/setup-python/action.yml` hardcodes `UV_EXCLUDE_NEWER=P7D`. ODH needs `P14D` (matching `pyproject.toml`). The env var overrides the config file, causing `uv lock` drift in the version-sync CI check. Update it after every rebase.

3. **Conftest lint for composite actions** — The repo's conftest policy forbids `${{ }}` interpolation directly in `run:` blocks of composite actions. ODH files (e.g., `.github/actions/build-image/action.yml`) may violate this. Move values to `env:` blocks.

4. **Typo checker on git hashes** — `FORK_HISTORY.md` is excluded from the typos checker in `pyproject.toml` because git hashes trigger false positives. If the exclusion is lost during a rebase conflict on `pyproject.toml`, re-add it.

5. **`uv` version pinning** — `.github/actions/setup-python/action.yml` pins a `uv` version. Verify it matches `pyproject.toml`'s `required-version`. Mismatches cause `uv lock` output to differ between local and CI.

6. **Prettier formatting** — Pre-commit uses **prettier v2** (pinned in `.pre-commit-config.yaml`). Do NOT use `npx prettier` (installs v3, formats differently). Use `uv run pre-commit run prettier --files <file>` instead.

---

## Rebase: v3.13.0 → v3.14.0

**Date:** 2026-07-09
**Performed by:** Anya Kramar
**Upstream tag:** `v3.14.0` (305 new commits from upstream)

### Dropped commits (already in v3.14.0)

| Original hash | Subject                                                                     | Upstream equivalent |
| ------------- | --------------------------------------------------------------------------- | ------------------- |
| `06cedb957`   | drop: Optimize local artifact uploads with atomic rename (#23794)           | `20f567a96`         |
| `6497fb3ef`   | drop: Cherry-pick upstream test fixes for CI stability                      | Multiple            |
| `e01db8f08`   | drop: Skip copying local artifacts to temp directories for artifact serving | `20f567a96`         |
| `697f12f8a`   | drop: Fix HuggingFace revision test broken by datasets >= 4.8.5             | In v3.14.0          |
| `4707d29bf`   | drop: Skip guardrails-ai while package is unavailable on PyPI               | `4cdfed1c5`         |
| `55be94684`   | backport: Include workspace in webhook delivery envelopes (#22873)          | `0ba31551a`         |
| `fae51223a`   | drop: Pin langchain-community<0.4.2 in genai CI job (#23697)                | `b20ae2163`         |

### Squashed commits

**Fork scaffolding** (5 commits):

- `3e8519ed9` keep: Fork scaffolding (squashed) [from v3.13.0 rebase]
- `b4d3741f3` Add Nana to approvers
- `e45541f73` Bump memory in Konflux jobs due to OOM issue
- `4b5d23d53` chore: add operator integration tests workflow
- `dd2cc9b41` keep: Remove unused buildarg in Dockerfile

**Backend changes** (7 commits — commit dropped as empty during rebase, content recovered):

- `99684bd21` keep: Backend changes (squashed) [from v3.13.0 rebase]
- `62aebd936` keep: Fix CVE-2026-48710 in ODH shipped dependencies
- `7a2778fc0` keep: Restore kubernetes to Konflux AIPCC input
- `220345109` keep: Sync UV lock file
- `4adadfe9b` fix: bump mlflow-kubernetes-plugins to 1.3.0
- `7dd659dc3` keep: Add downstream sync and operator version bump phases to rebase skill
- `2ae6b5db0` keep: Add CSS override audit tooling and improve rebase skill

**UI changes** (21 commits):

- `7dbf3c3d7` keep: UI changes (squashed) [from v3.13.0 rebase]
- `ce9016c16` keep: Post-rebase fixes and documentation
- `05ebb6685` fix i18n check
- `2284d44b8` Fix embedded compare runs link guard and fetch error handling
- `3e9892995` Expose compare run page as a federated component
- `47e6a2e0f` keep: lock Konflux sqlite runtime upgrade
- `f00ae72b8` keep: Fix Prompts view buttons growing on viewport resize
- `9700acd22` keep: Fix dark lines at the bottom of the LLM judge modals
- `7520b39df` keep: update fsevents & es5-ext dependency resolutions
- `df54fb8df` keep: Add event tracking to MLflow
- `072ae3c4c` keep: Squashed commits from PRs #224 #226 #220
- `221cb2ec4` keep: Fix the architecture typo in .yarnrc.yml
- `d1c086041` keep: Hoist tooltip patch to root workspace
- `f0ed22e8e` keep: Disable issue detection when the AI Gateway is disabled
- `c0e329729` keep: Use only model plaintext for judge creation in ui
- `10161e1b4` keep: Add PatternFly CSS overrides and module federation
- `5ffb93d95` keep: Update to Node 24
- `490cd77b5` keep: add MlflowTraceDetailWrapper for embedded trace view
- `4e9d81bf0` keep: Use sentence case for experiment and prompt UI labels
- `308d5d428` keep: add MlflowTraceDetailWrapper for embedded trace view
- `8c4481956` keep: Add data-testid attributes to Edit Experiment modal

### Conflict resolutions

**Scaffolding commit (~30 conflicts):**

All modify/delete — upstream-only CI workflows that ODH intentionally deletes. Resolved with `git rm`. Content conflict in `.github/workflows/master.yml`: removed upstream Databricks test step.

**Backend commit:**

Dropped as empty by git — `uv.lock` and `pyproject.toml` changes were already superseded by v3.14.0. Files that were grouped into this commit (CSS audit scripts, rebase skill files, PatternFly README) were recovered from `odh/master` via step 10b.

**UI commit (4 content conflicts):**

- `ExperimentViewHeader.tsx` — upstream added `headerActionsHidden` conditional wrapping; ODH added `!isEmbedded` guard on docs link. Merged both.
- `ExperimentPageTabs.tsx` — upstream renamed `showExperimentPageSideNav` to `enableWorkflowBasedNavigation` and added `headerHidden`. Took upstream's version.
- `en.json` — both sides added i18n keys. Took from `odh/master`, synced with `yarn i18n`.
- `yarn.lock` — took from `odh/master`.

### Post-rebase fixes

- Recovered 20 downstream files silently dropped when backend commit was skipped
- Restored ODH-specific `package.json` entries (PatternFly, module federation, audit scripts, Playwright)
- Added upstream v3.14.0 Monaco editor dependencies (3 packages)
- Synced i18n keys (2,092 new keys from v3.14.0, 32 orphaned removed)
- Re-added `FORK_HISTORY.md` typos exclusion in `pyproject.toml`
- Added top-level `permissions: {}` to 7 ODH workflows (conftest policy)
- Updated CSS override verified versions
- Updated rebase skill with step 10b (dropped-file detection)

### Known upstream test failures (not fixed on upstream master)

7 suites fail on v3.14.0 with no fix available on upstream `master`:

- `TracesV3Logs.test.tsx`
- `PromptsPage.test.tsx`
- `RunEvaluationButton.test.tsx`
- `GatewayUsagePage.test.tsx`
- `ReviewQueueList.test.tsx`
- `IssueDetectionModal.test.tsx`
- `TraceCostBreakdownChart.test.tsx`

---

## Rebase: v3.12.0 → v3.13.0

**Date:** 2026-06-16
**Performed by:** Juntao Wang
**Backup branch:** `master-06-16`
**Upstream tag:** `v3.13.0` (343 new commits from upstream)

### Dropped commits (already in v3.13.0)

| Original hash | Subject                                                                     | Upstream equivalent |
| ------------- | --------------------------------------------------------------------------- | ------------------- |
| `e01db8f08`   | drop: Skip copying local artifacts to temp directories for artifact serving | `6b0cf1fec`         |
| `697f12f8a`   | drop: Fix HuggingFace revision test broken by datasets >= 4.8.5             | `742054bd9`         |
| `4707d29bf`   | drop: Skip guardrails-ai while package is unavailable on PyPI               | `c9ee5973e`         |
| `55be94684`   | backport: Include workspace in webhook delivery envelopes (#22873)          | `0ba31551a`         |

### Squashed commits

#### 1. Fork scaffolding

| Original hash | Subject                                                     |
| ------------- | ----------------------------------------------------------- |
| `4af6fa73a`   | keep: Fork scaffolding                                      |
| `ce7bc8109`   | keep: add GitHub Actions e2e workflow with Konflux PR image |
| `5ffb93d95`   | keep: Update to Node 24                                     |
| `47e6a2e0f`   | keep: lock Konflux sqlite runtime upgrade                   |
| `62aebd936`   | keep: Fix CVE-2026-48710 in ODH shipped dependencies        |
| `7a2778fc0`   | keep: Restore kubernetes to Konflux AIPCC input             |
| `b4d3741f3`   | Add Nana to approvers                                       |
| `e45541f73`   | Bump memory in Konflux jobs due to OOM issue                |

#### 2. Backend changes

| Original hash | Subject                 |
| ------------- | ----------------------- |
| `220345109`   | keep: Sync UV lock file |

#### 3. UI changes

| Original hash | Subject                                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| `10161e1b4`   | keep: Add PatternFly CSS overrides and module federation                        |
| `c0e329729`   | keep: Use only model plaintext for judge creation in ui                         |
| `f0ed22e8e`   | keep: Disable issue detection when the AI Gateway is disabled                   |
| `d1c086041`   | keep: Hoist tooltip patch to root workspace                                     |
| `221cb2ec4`   | keep: Fix the architecture typo in .yarnrc.yml                                  |
| `072ae3c4c`   | keep: Squashed commits from PRs #224 #226 #220 (E2E tests, validations)         |
| `df54fb8df`   | keep: Add event tracking to MLflow                                              |
| `7520b39df`   | keep: update fsevents & es5-ext dependency resolutions                          |
| `9700acd22`   | keep: Fix dark lines at the bottom of the LLM judge modals when using dark mode |
| `f00ae72b8`   | keep: Fix Prompts view buttons growing on viewport resize                       |
| `05ebb6685`   | fix i18n check                                                                  |
| `2284d44b8`   | Fix embedded compare runs link guard and fetch error handling                   |
| `3e9892995`   | Expose compare run page as a federated component                                |

### Conflict resolutions

#### Scaffolding commit (3 content conflicts)

- **`.github/workflows/master.yml`**: Upstream added a "Run GenAI Tests (Databricks)" step. Removed it — ODH does not run Databricks-specific tests.
- **`pyproject.toml`** (`[tool.uv]`): Upstream changed `exclude-newer` to `P7D` and bumped `required-version` to `>=0.11.14`. Kept ODH's `P14D` window and extra `exclude-newer-package` entries (`mlflow-kubernetes-plugins`, `starlette`), but took upstream's `required-version = ">=0.11.14"`.
- **`uv.lock`**: Took ODH's `P14D` exclude-newer-span.

15 modify/delete conflicts were resolved by deleting the files (upstream workflows ODH intentionally removes).

Additionally, `slow-tests.yml` (Docker model serving tests) and `helm.yml` (Helm chart tests) were deleted from the fork scaffolding — these test upstream-only features not used in ODH and their flaky failures added noise to CI validation.

#### UI commit (9 content conflicts)

- **`mlflow/environment_variables.py`**: Both sides added new env vars in the same location. Kept both — upstream's `MLFLOW_RBAC_SEED_DEFAULT_ROLES` and ODH's `MLFLOW_ENABLE_ASSISTANT` / `MLFLOW_ENABLE_AI_GATEWAY`.
- **`mlflow/server/handlers.py`**: Upstream renamed `_validate_artifact_root_uri` → `_validate_storage_location_uri`. Kept upstream's rename and added ODH's `_disable_gateway` decorator above it.
- **`mlflow/server/js/craco.config.js`**: Upstream added `preservePdfjsBundles`, ODH added `suppressAutoprefixerWarnings`. Kept both.
- **`mlflow/server/js/src/MlflowRouter.tsx`**: Upstream added account/admin route imports. Kept them and wrapped gateway routes with ODH's `shouldEnableAIGateway()` feature flag.
- **`mlflow/server/js/src/common/components/MlflowSidebar.tsx`**: Upstream added `useActiveWorkspace`, ODH added `isAssistantEnabled`. Kept both imports.
- **`mlflow/server/js/src/common/forms/validations.ts`**: Upstream had detailed error handling with `isResourceDoesNotExistError`. Kept ODH's simplified version (catch → name available). Removed dead `isResourceDoesNotExistError` function and unused `ErrorCodes` import.
- **`mlflow/server/js/src/experiment-tracking/.../ExperimentViewHeader.tsx`**: Upstream added `formatTraceArchivalRetentionForDisplay`, ODH added `MlflowSidebarWorkflowSwitch`. Kept both imports.
- **`mlflow/server/js/src/lang/default/en.json`**: Two conflicts where upstream added new i18n entries. Kept entries from both sides in correct sort order.
- **`mlflow/server/js/src/workspaces/utils/WorkspaceUtils.ts`**: Upstream refactored to `useSyncExternalStore` pattern (`activeWorkspaceListeners`). ODH has `onWorkspaceChange` callback for Redux store dispatch. Kept both subscription patterns; `setActiveWorkspace` notifies both listener sets.

### Post-rebase fixes

**CI fixes:**

- **`.github/actions/setup-python/action.yml`**: `UV_EXCLUDE_NEWER=P7D` env var overrode `pyproject.toml`'s `P14D`, causing `uv lock` drift. Fixed to `P14D`.
- **`en.json`**: Removed orphaned i18n key `RgVN+O` (upstream component removed in v3.13.0).
- **`.github/actions/build-image/action.yml`**: Moved `${{ }}` interpolations to `env:` blocks for conftest lint compliance.
- **`pyproject.toml`**: Added `FORK_HISTORY.md` to typos checker `extend-exclude`.
- **`validations.test.ts`**: Updated test to match ODH's simplified error handling (`callback(undefined)` on any API error instead of upstream's specific error message).

**UI fixes found during visual verification:**

- **`_scope-and-base-controls.scss`**: Removed global `align-self: center` from button override — it fought with form layouts (tags modal `+` button misaligned with inputs) and control bars (`+ New run` misaligned with kebab icon). Replaced with targeted `align-items: center` on the prompts detail action bar container only.

### Late additions to master (merged after initial rebase)

- **PR #281** (`25ffd0263`): `keep: Use sentence case for experiment and prompt UI labels` — merged to master after the rebase was prepared. Integrated via a second `merge -s ours` to link the updated master into the rebase branch.

### Notes

- 5 downstream commits were missing the required `keep:`/`drop:` prefix: `05ebb6685`, `2284d44b8`, `3e9892995`, `b4d3741f3`, `e45541f73`. All were ODH-specific and included in the appropriate squash category.
- The `backport:` prefix on `55be94684` is treated as a `drop:` since the original commit is in v3.13.0.
- Draft PRs skip most CI workflows due to `if: draft == false` guards. The CI validation PR must be created as a normal (non-draft) PR with a `[DO NOT MERGE]` title.
