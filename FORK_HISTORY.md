# Fork History

Rebase log for the OpenDataHub MLflow fork (opendatahub-io/mlflow).

Each rebase section records which downstream commits were kept, dropped, or squashed,
and how merge conflicts were resolved.

## Recurring post-rebase issues

These break CI after every rebase. Fix them proactively before pushing.

1. **i18n key drift** — Conflict resolution keeps i18n entries from both sides, but some upstream keys reference components removed in the same release. Run `cd mlflow/server/js && yarn i18n` to remove orphaned keys from `en.json`.

2. **`UV_EXCLUDE_NEWER` env var** — `.github/actions/setup-python/action.yml` hardcodes `UV_EXCLUDE_NEWER=P7D`. Keep this aligned with `pyproject.toml` and the current repository cooldown guidance (`P7D` for this rebase; older rebases used `P14D`). The env var overrides the config file, so a mismatch causes `uv lock` drift in the version-sync CI check.

3. **Conftest lint for composite actions** — The repo's conftest policy forbids `${{ }}` interpolation directly in `run:` blocks of composite actions. ODH files (e.g., `.github/actions/build-image/action.yml`) may violate this. Move values to `env:` blocks.

4. **Typo checker on git hashes** — `FORK_HISTORY.md` is excluded from the typos checker in `pyproject.toml` because git hashes trigger false positives. If the exclusion is lost during a rebase conflict on `pyproject.toml`, re-add it.

5. **`uv` version pinning** — `.github/actions/setup-python/action.yml` pins a `uv` version. Verify it matches `pyproject.toml`'s `required-version`. Mismatches cause `uv lock` output to differ between local and CI.

6. **Prettier formatting** — Pre-commit uses **prettier v2** (pinned in `.pre-commit-config.yaml`). Do NOT use `npx prettier` (installs v3, formats differently). Use `uv run pre-commit run prettier --files <file>` instead.

7. **Workflow policy drift** — A deletion-only `keep:` commit can be missed while rebuilding the squashed scaffolding commit, and comparing the result only with the new upstream tag does not detect workflows restored from that tag. Run `.claude/skills/rebase-mlflow/audit-workflow-policy.py "$SQUASH_BASE" "$CURRENT_VERSION"` to derive the existing policy from Git history and review every reported workflow.

---

## Rebase: v3.15.2 → v3.17.0

**Date:** 2026-10-08
**Upstream tag:** `v3.17.0` (`6dd94c6de2932d22767769eec5b644e48c457ce8`)
**ODH snapshot:** `92ab3c5ea45ffa528124146e1f9ea098f9e71584`

### Preparation and retained changes

- Preserved the original ODH tip in local branch `backup/odh-master-before-v3.17.0` and the reconstructed squash in `backup/odh-squashed-before-v3.17.0`.
- Reconstructed three commits (fork scaffolding, backend, UI) from the net downstream snapshot against v3.15.2. This includes deletion-only commits and the final state of superseded fixes across previous merges, without replaying old prototype implementations.
- Preserved Konflux scaffolding, security constraints, workflow removals, RHOAI migration-gap repair, prompt model filtering, PatternFly overrides, module federation, embedded routing, session-expiry handling, and workspace change callbacks.
- No downstream-only added files were lost. Files removed by upstream, including the old permission-denied view, follow the upstream removal.

### Dropped upstream backports

- `92ab3c5ea4`: dataset navigation highlighting; upstream `2c8b58b43b` ([PR 26187](https://github.com/mlflow/mlflow/pull/26187)).
- `9687946a0f`: RustFS artifact example; upstream `ca40661cb5` ([PR 25808](https://github.com/mlflow/mlflow/pull/25808)). Its replacement of MinIO also supersedes the downstream MinIO image-registry fix `06b3f8506a`.
- `0f17139428`: trace archival test isolation; upstream `0ace11b56d` ([PR 24874](https://github.com/mlflow/mlflow/pull/24874)).
- Older backports already reconciled by the previous rebase are represented only by their remaining net differences. Original history remains in the backup and squash messages.

### Conflict resolutions and compatibility fixes

- Preserved ODH workflow removals, including newly introduced upstream automation and Helm publishing workflows. Retained the downstream model-catalog release-asset synchronization.
- Reconciled retained workflows with 3.17 policy: explicit cache permissions and concurrency, supported runner names, consistent action pins, and removal of references to deleted workflows.
- Used upstream gateway guards and server feature reporting, retaining ODH guards on issue detection and scorer invocation and the downstream unavailable-feature message. Preserved upstream artifact-host validation, trace ownership checks, and budget validation.
- Preserved the Assistant flag with upstream static-prefix handling and the Starlette 1.3.1 WSGI streaming adaptation. Added httpx2 to test requirements because Starlette 1.x uses it for TestClient.
- Preserved all upstream database commands alongside the RHOAI migration-gap command. Retained the migration compatibility test's MLflow 3.10.1 baseline using upstream's isolated dependency installation.
- Kept upstream server-feature subscriptions together with ODH gateway build flags. Preserved embedded sidebar sections, routing, and both workspace listener mechanisms.
- Preserved the host's single-chat-session routing guard when upstream session grouping maps those URLs to the Traces tab. The guard still reports them as unsupported in Model training and permits them in GenAI.
- Exported the markdown artifact viewer props interface so federated type declarations can name it.
- Regenerated translations, accepted upstream sanitize-html 2.x, and added a Jest 27 alias for htmlparser2's exports-only `entities/decode` dependency instead of carrying the old sanitize-html downgrade.
- Restored the small GitHub client helpers needed by the retained unresolved-comments command and removed obsolete skill permission metadata to satisfy upstream lint.

### Dependency updates

- Pinned `mlflow-kubernetes-plugins==2.0.0`, whose [release](https://github.com/kubeflow/mlflow-integration/releases/tag/v2.0.0) supports MLflow 3.17. The plugin requires Python 3.12; the Konflux image and lock compilation use Python 3.12.
- Pinned pandas 3.0.2 for consistent AIPCC resolution across amd64, arm64, ppc64le, and s390x. The unpinned index resolves 3.0.3 only on s390x.
- Used the current repository guidance of `P7D` for Python cooldown in pyproject, uv.lock, and CI, superseding the historical rebase skill's `P14D` instructions. Retained downstream exceptions for the auth plugin and Starlette.

### Late addition to ODH master

- Reapplied `ce140990e1` (SimpleSelect PatternFly dropdown styling) after linking the updated ODH history. It merged after the initial snapshot; its two stylesheet changes are retained in a separate signed-off commit.

### Local validation

- Focused downstream Python tests: 183 passed.
- Server-handler, FastAPI, and model-registry workspace reconciliation tests: 629 passed, 1 skipped.
- Final combined Python run, including artifact upload/download and migration-gap coverage: 812 passed, 1 skipped with the resolved Starlette 1.7.0 test environment.
- Multi-architecture runtime/build locks and PyPI side-channel lock regenerated successfully; security floors and auth plugin 2.0.0 retained.
- Version regeneration at 3.17.0 produced no drift.
- Workflow-policy audit and missing-downstream-file check passed.
- CSS override audit passed with 31 existing baseline issues; a drift checklist was generated for browser review.
- TypeScript and production federation build passed, including generation of federated type declarations. The build retains its bundle-size warning.
- All pre-commit hooks passed for the rebase changes; the subsequent session-routing fix also passed pre-commit, ESLint, TypeScript, and its 40-test guard suite.
- Full UI ESLint passed with seven existing disabled-test warnings; the translation check passed with 4,044 synchronized keys.
- Full JavaScript run: 749 of 752 suites passed initially (7,212 tests passed, six failed, eight skipped). One failure exposed the session-routing regression fixed above. The other five failures were in the two unchanged upstream TracesV4 suites, primarily under concurrent build/test load; both suites passed when rerun serially without a build (72 passed, three skipped). Together with the 40-test guard rerun, every initially failing suite now passes without changing upstream assertions or timeouts.

Remote CI, Kubernetes/OpenShift integration tests, and browser visual verification remain follow-up steps. No CSS versions are marked visually verified by this local rebase.

### Post-rebase CI fixes

- Restored the original whitespace in `dev/run-dev-server.sh` and made the new empty TypeSafe test package marker zero bytes, eliminating whitespace-only PR changes without bypassing lint.
- Preserved development and release-candidate suffixes in `get_current_py_version()` while still stripping downstream local-version labels. The previous use of `base_version` caused release-ordering tests to treat a development version as a final release.
- Removed the orphaned test for the upstream `push-images.yml` publishing workflow, which ODH intentionally does not carry. Kept the workflow policy unchanged.
- Updated the legacy standalone gateway test to assert ODH's existing HTTP 501 behavior when `MLFLOW_ENABLE_AI_GATEWAY=false`; production gateway guards and job execution settings are unchanged.
- Derived the expected default service name from the installed OpenTelemetry SDK, so the resource-attribute test works with both the 1.27 protobuf matrix and newer SDKs while still checking MLflow attributes and explicit environment overrides.
- Kept MLflow 3.10.1 as the pre-workspace migration baseline, exporting only locked DB test tools for its isolated environment. The current application lock pins PyArrow 25, which conflicts with the baseline's PyArrow <24 requirement; the baseline's own dependencies now resolve independently, with the DB drivers provided by its `db` extra and the DB test group.
- Local verification: 66 focused Python tests passed, the tracing test also passed with an isolated OpenTelemetry 1.27 overlay, and all four ResponseFormatForm tests passed in about four seconds without timeout changes. Baseline dependency resolution and shell syntax checks passed. No database, E2E, integration, or full-suite tests were run for these fixes.
- The operator runtime-image failure was repeated HTTP 503 responses from packages.redhat.com while downloading opentelemetry-sdk. Konflux passed; no dependency or container-build change was made for the package-server failure. The ResponseFormatForm timeout did not reproduce locally.

---

## Rebase: v3.14.0 → v3.15.2

**Date:** 2026-09-02
**Upstream tag:** `v3.15.2`

### Dropped commits (already in v3.15.0)

- MCP Registry prototype UI (`885ed9ece`) and its superseded federation export (`7502c8c82`)
- Upstream MCP Registry import/follow-up commits, artifacts-only workspaces, generated schema alignment, and DNS-rebinding fix

### Retained ODH changes

- Fork scaffolding, Konflux configuration, and ODH workflow policy
- Federated MCP Registry integration, embedded-mode behavior, PatternFly overrides, and UI refinements
- Konflux dependency security pins and `mlflow-kubernetes-plugins` `1.6.0`, which provides MLflow 3.15 authorization coverage

### Conflict resolutions and validation

- Removed upstream-only workflows retained by ODH policy; kept the ODH `master.yml` behavior
- Preserved ODH gateway feature flags and gateway-disable handlers while accepting v3.15 refactors
- Preserved the downstream MCP federation layer over the upstream MCP Registry implementation
- TypeScript compilation, CSS override audit, and `tests/server/test_gateway_disable.py` passed

### Post-rebase follow-up

- **Workflow policy restoration:** Removed the new YAML wrappers for auto-close
  and PR-size automation whose JavaScript implementations were intentionally
  removed by PR #342. Also removed the upstream-only heads-up workflow, which
  is explicitly gated to `mlflow/mlflow` and cannot run meaningfully in the ODH
  fork. The rebase audit now derives these removals from Git history so future
  rebases preserve them without a hardcoded policy list.

- **Reconciliation and CI fixes:** Reconciled ODH gateway-disable behavior with
  v3.15.2 handler guards while retaining workspace artifact-path scoping.
  Formatted the component-ID registry with the pinned Prettier v2 hook, restored
  the v3.15.2 budget-window filter, updated affected JS tests, and retained the
  needed Konflux fsevents resolution.

- **Focused JS timeout investigation:** The CopyButton minimal render,
  StarterCodeCard Python-tab, and PlaygroundTopBar Save-callback tests did not
  reproduce their CI timeouts (each completed in about two seconds). The MCP
  Registry display-name overflow test consistently completed successfully only
  after roughly eight seconds; it now has a local 10-second allowance. No
  production behavior or global Jest timeout was changed. The S3 multipart
  presigned-upload operator failure remains owned by mlflow-operator and is
  intentionally not addressed here.

- **v3.15.2 handler reconciliation:** Restored the upstream presigned-download
  endpoint, multipart capability advertisement, artifacts-only guards, budget
  target validation, issue-detection provider validation, scorer JSON
  validation, and Python CI's two-pass xdist partition. ODH additionally
  disables the three job-invocation endpoints at the backend when
  `MLFLOW_ENABLE_AI_GATEWAY` is false; their upstream behavior remains covered
  with the flag enabled in focused tests.

- **Streaming artifact uploads:** v3.15.2's `_upload_artifact()` uses
  `StreamUploadMixin.log_artifact_from_stream()` when the artifact repository
  supports it, falling back to a temporary file otherwise. Keep that upstream
  branch together with ODH's workspace-path scoping. This is conflict
  reconciliation against v3.15.2, not a separately carried downstream patch.

- **Whitespace-only CI policy:** Restored the pre-rebase blank line whitespace
  in `dev/run-dev-server.sh`. The whitespace checker correctly rejects an
  otherwise unnecessary formatting-only diff; this restoration leaves runtime
  behavior unchanged and avoids requiring its bypass label.

- **Protobuf cross-test diagnostics:** The Docker-backed MySQL, PostgreSQL, and
  MSSQL integration test now emits Compose logs before `testcontainers` tears
  down failed containers. The temporary workflow-level post-failure log step
  was removed because it runs too late.

- **AnyIO-compatible WSGI adapter:** Fresh Docker integration images resolved
  AnyIO 4.15, where `anyio.from_thread` is no longer implicitly exposed from
  the package. The fork's efficient WSGI adapter now explicitly uses the
  supported submodule API instead of inheriting Starlette's incompatible
  implementation, restoring server health checks without constraining AnyIO.

- **TLS handling for multipart downloads:** Upstream #24113
  (`bd94df33e`) made multipart presigned uploads honor `MLFLOW_S3_IGNORE_TLS`.
  The release still omitted the equivalent multipart-download path, so this is
  retained as a separate follow-up commit. Remove it when an upstream fix is
  available.

### Late master commits and history link

- `49fb992a1b` (MCP detail-page action order), `ba31788507` (PF6 toggle styles),
  and `ed640d9a7` (`OWNERS` approvers) were already in the second parent of the
  original history-link merge. Their intended final content is incorporated in
  the three squashed carried commits because an `ours` merge does not retain the
  second parent's tree.
- `55ffb4147c` (modal footer and link-button styles plus the edit-modal cancel
  action) landed after that merge. Its patch is incorporated into the UI
  reconciliation and the rewritten history link uses `55ffb4147c` as its master
  parent. It was not separately cherry-picked.

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
- Gated Playground tab and route behind `shouldEnableAIGateway()` — Playground requires the AI Gateway backend, so it should be hidden when `MLFLOW_ENABLE_AI_GATEWAY=false`
- Passed MLflow version override (`SUPPORTED_MLFLOW_VERSION_OVERRIDE`) to the operator CI build to resolve the chicken-and-egg version mismatch during rebase PRs

### Upstream test fixes cherry-picked

| Commit    | Subject                                                         | Upstream PR                                           |
| --------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| `8cbf564` | drop: Fix core tracing tests broken by opentelemetry-sdk 1.43.0 | [#24250](https://github.com/mlflow/mlflow/pull/24250) |
| `45946ec` | drop: Match any non-zero exit code in `test_host_invalid_value` | [#24288](https://github.com/mlflow/mlflow/pull/24288) |

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
