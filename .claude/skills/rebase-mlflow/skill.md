---
name: rebase-mlflow
description: Rebase the ODH MLflow fork onto a new upstream MLflow release tag
allowed-tools:
  - Read
  - Bash
  - Edit
  - Write
  - Agent
  - AskUserQuestion
  - TaskCreate
  - TaskUpdate
  - TaskList
argument-hint: "<upstream_tag> (e.g. v3.14.0)"
arguments: [upstream_tag]
---

# Rebase ODH MLflow Fork

Rebase the OpenDataHub MLflow downstream fork onto an upstream MLflow release.

**Reference:** [RHOAIENG-61516](https://redhat.atlassian.net/browse/RHOAIENG-61516)
**History:** See `FORK_HISTORY.md` in the repo root for past rebase records.

## How This Works (Read This First)

The ODH MLflow repo is a fork of upstream `mlflow/mlflow`. We carry ~20 downstream commits (PatternFly CSS overrides, module federation, Konflux build configs, feature flags, E2E tests, etc.) on top of an upstream release tag.

When upstream cuts a new release, we need to reapply our changes on top of it. This skill walks through that process in 8 phases:

| Phase             | What happens                                           | Time estimate |
| ----------------- | ------------------------------------------------------ | ------------- |
| 1. Preparation    | Fetch, back up, inventory commits                      | ~10 min       |
| 2. Squash         | Group 20+ keep commits into 3 clean commits            | ~15 min       |
| 3. Rebase         | `git rebase --onto` the target tag, resolve conflicts  | ~30 min       |
| 4. CI fixes       | Fix recurring issues + cherry-pick upstream test fixes | ~30 min       |
| 5. Merge strategy | `git merge -s ours` to link histories (no force push)  | ~2 min        |
| 6. Documentation  | Update FORK_HISTORY.md                                 | ~10 min       |
| 7. CI validation  | Push, create PR, wait for ~70 CI jobs, fix failures    | ~2 hours      |
| 8. Real PR        | Create the actual merge PR, get reviews                | ~1 day        |
| 9. Downstream     | Sync downstream repo, notify release engineering       | ~30 min       |
| 10. Operator      | Bump operator version to match new MLflow release      | ~15 min       |

**You will need:** Push access to `opendatahub-io/mlflow` and the following remotes:

```
mlflow   → https://github.com/mlflow/mlflow.git        (upstream source)
upstream → https://github.com/opendatahub-io/mlflow.git (ODH fork)
origin   → your personal fork
```

## Prerequisites

Before starting, verify:

1. The [mlflow-integration auth plugin](https://github.com/kubeflow/mlflow-integration) supports the target MLflow version. Check for a recent release or PR. If not, **abort and notify the team**.
2. You have push access to `opendatahub-io/mlflow`.
3. Remotes are configured (see above).

---

## Phase 1: Preparation

**Goal:** Understand what we're working with — the current base, all downstream commits, and which can be dropped.

1. **Fetch all remotes and tags:**

   ```bash
   git fetch mlflow --tags
   git fetch upstream
   ```

2. **Identify the current base version** (the upstream tag ODH master is built on):

   ```bash
   git log --oneline upstream/master | grep 'Bump version to' | head -1
   ```

   This gives you `CURRENT_VERSION` (e.g., `v3.12.0`). You'll use this throughout.

3. **Back up master** (naming convention: `master-MM-DD`):

   ```bash
   git push upstream upstream/master:refs/heads/master-$(date +%m-%d)
   ```

   Verify the backup exists: `git ls-remote upstream refs/heads/master-$(date +%m-%d)`

4. **Inventory all downstream commits:**

   ```bash
   git log --format='%h %s' upstream/master --not $CURRENT_VERSION
   ```

   Categorize each commit:

   - `drop:` — cherry-picks from upstream. Drop if the original is in the target tag.
   - `backport:` — treat as `drop:` if the original commit (check `cherry picked from` trailer) is in the target tag.
   - `keep:` — ODH-specific changes to preserve.
   - **No prefix** — flag these; they should be `keep:` commits.

5. **Verify all drops are in the target tag:**

   ```bash
   git log --oneline $UPSTREAM_TAG --grep="<PR number>"
   ```

6. **Check files touched by each keep commit** to assign it to a category:
   ```bash
   for hash in <keep_commit_hashes>; do
     echo "=== $(git log --format='%h %s' -1 $hash) ==="
     git diff-tree --no-commit-id --name-only -r $hash | head -20
     echo ""
   done
   ```

**Next:** You now have a list of commits to keep, grouped by category. Move to Phase 2.

---

## Phase 2: Build the Squashed Branch

**Goal:** Produce a branch with exactly 3 clean commits on top of `CURRENT_VERSION`.

Squash `keep:` commits into 3 categories, in this order:

| Category             | What goes here                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Fork scaffolding** | GitHub workflows, Dockerfiles, Tekton, OWNERS, Konflux configs, `.syft.yaml`, `requirements/konflux-*`, `requirements/rpms.*` |
| **Backend changes**  | Python code, `uv.lock`, `requirements/` (non-Konflux)                                                                         |
| **UI changes**       | Everything under `mlflow/server/js/`, CSS overrides, module federation, E2E tests, `src/odh/`                                 |

**Why squash?** 20+ commits = 20+ conflict rounds during rebase. 3 commits = at most 3. Originals are preserved in the backup branch and in squash commit messages.

7. **Create the rebase branch:**

   ```bash
   git checkout -b rebase-$UPSTREAM_TAG $CURRENT_VERSION
   ```

8. **Cherry-pick each category** using `--no-commit` to squash:

   ```bash
   # 1. Scaffolding (oldest first)
   git cherry-pick --no-commit <hash1> <hash2> ...
   git commit -s -m "keep: Fork scaffolding (squashed)

   Squashed from:
   - <hash> <subject>
   ..."

   # 2. Backend
   git cherry-pick --no-commit <hash1> ...
   git commit -s -m "keep: Backend changes (squashed)

   Squashed from:
   - <hash> <subject>
   ..."

   # 3. UI
   git cherry-pick --no-commit <hash1> <hash2> ...
   git commit -s -m "keep: UI changes (squashed)

   Squashed from:
   - <hash> <subject>
   ..."
   ```

   **If you hit conflicts during squashing:** Later commits may conflict with earlier ones in the same category (e.g., one creates a file, another modifies it). Resolve by taking the final version from `upstream/master`:

   ```bash
   git show upstream/master:<conflicted-file> > <conflicted-file>
   git add <conflicted-file>
   ```

**Next:** You have a branch with 3 squashed commits on `CURRENT_VERSION`. Move to Phase 3 to rebase them onto the target tag.

---

## Phase 3: Rebase onto Target Tag

**Goal:** Move the 3 squashed commits from `CURRENT_VERSION` to the target tag, resolving all merge conflicts.

9. **Rebase:**

   ```bash
   git rebase --onto $UPSTREAM_TAG $CURRENT_VERSION rebase-$UPSTREAM_TAG
   ```

10. **Resolve conflicts.** Git will stop at each conflicted commit. See the [Conflict Resolution Reference](#conflict-resolution-reference) at the bottom for file-by-file patterns. The general rules:

    - **Modify/delete (workflows):** ODH intentionally deletes upstream CI files → `git rm`
    - **Both sides added code:** Keep both (upstream's + ODH's)
    - **Upstream renamed something:** Accept the rename, keep ODH additions

    After resolving each commit's conflicts:

    ```bash
    git add -A
    GIT_EDITOR=true git rebase --continue
    ```

11. **Verify the rebase:**

    ```bash
    # No stray conflict markers
    git diff $UPSTREAM_TAG..rebase-$UPSTREAM_TAG -- . | grep -c '<<<<<<<'

    # TypeScript compiles
    cd mlflow/server/js && npx tsc --noEmit --pretty

    # ODH-specific files exist
    ls OWNERS Dockerfile.konflux mlflow/server/js/src/odh/

    # Key ODH features present
    grep -n 'MLFLOW_ENABLE_ASSISTANT\|MLFLOW_ENABLE_AI_GATEWAY' mlflow/environment_variables.py
    grep -n '_disable_gateway' mlflow/server/handlers.py | head -3
    grep -n 'onWorkspaceChange' mlflow/server/js/src/workspaces/utils/WorkspaceUtils.ts
    ```

**Next:** The rebase is done but CI will fail on several known issues. Move to Phase 4 to fix them before pushing.

---

## Phase 4: Fix Recurring CI Issues

**Goal:** Fix 5 issues that break CI on **every** rebase because upstream changes reset ODH-specific config.

12. **i18n key drift** — Conflict resolution keeps i18n entries from both sides, but some upstream keys reference components removed in the same release:

    ```bash
    cd mlflow/server/js && yarn i18n
    git diff src/lang/default/en.json   # confirm only orphaned keys removed
    ```

13. **`UV_EXCLUDE_NEWER` env var** — `.github/actions/setup-python/action.yml` hardcodes `UV_EXCLUDE_NEWER`. Upstream sets `P7D`; ODH needs `P14D`. The env var overrides `pyproject.toml`, causing `dev/pyproject.py` → `uv lock` to regenerate `uv.lock` with the wrong span, failing the version-sync CI check:

    ```bash
    # Verify — must say P14D, not P7D
    grep 'UV_EXCLUDE_NEWER' .github/actions/setup-python/action.yml
    ```

14. **`uv` version pinning** — Same action file pins a `uv` version. If upstream bumped it, verify compatibility with `pyproject.toml`'s `required-version`. Mismatches cause `uv lock` output to differ between local and CI.

15. **Conftest lint for composite actions** — Repo policy forbids `${{ }}` interpolation in `run:` blocks of composite actions. ODH files (e.g., `.github/actions/build-image/action.yml`) may violate this. Move values to `env:` blocks:

    ```yaml
    # Bad
    run: echo ${{ inputs.FOO }}
    # Good
    env:
      FOO: ${{ inputs.FOO }}
    run: echo "$FOO"
    ```

    Verify: `uv run pre-commit run conftest --all-files`

16. **FORK_HISTORY.md typos exclusion** — `FORK_HISTORY.md` is excluded from the typos checker via `[tool.typos.files]` `extend-exclude` in `pyproject.toml` (git hashes trigger false positives). If lost during a rebase conflict, re-add `"FORK_HISTORY.md"` to the list.

17. **Prettier formatting** — The pre-commit hook uses **prettier v2** (pinned in `.pre-commit-config.yaml`), NOT the latest v3. Do NOT use `npx prettier` (which installs v3 and formats differently). Always use the pre-commit hook:

    ```bash
    uv run pre-commit run prettier --files FORK_HISTORY.md .claude/skills/rebase-mlflow/skill.md
    ```

18. **Upstream tests broken by ODH simplifications** — When conflict resolution simplifies upstream behavior (e.g., `validations.ts` catch-all), the corresponding upstream tests may still expect the old behavior. Run the JS tests locally to catch these:

    ```bash
    cd mlflow/server/js && yarn test --watchAll=false 2>&1 | tail -20
    ```

    Update the test expectations to match ODH's implementation, not the other way around.

19. **Commit all ODH-specific fixes together:**

    ```bash
    git add -A && git commit -s -m "keep: Post-rebase CI fixes

    - Run yarn i18n to remove orphaned keys
    - Set UV_EXCLUDE_NEWER=P14D in setup-python action
    - Fix conftest lint violations in composite actions
    - Verify FORK_HISTORY.md typos exclusion in pyproject.toml
    - Run prettier on markdown files
    - Update tests broken by ODH simplifications"
    ```

20. **Cherry-pick upstream flaky test fixes** — v3.13.0 may include tests that fail due to bugs fixed on upstream `master` after the release. These cause CI failures on every PR if not addressed. Check upstream for fixes:

    ```bash
    git fetch mlflow master
    # Search for fixes to failing test files
    git log --oneline mlflow/master --not $UPSTREAM_TAG -- <failing-test-file>
    ```

    Cherry-pick carefully — avoid full `uv.lock` regenerations. For commits that bundle test fixes with lock file changes, apply only the test file changes manually:

    ```bash
    # Safe: cherry-pick commits that only touch test files
    git cherry-pick --no-commit <hash>

    # For commits that also update uv.lock: apply only the test fix
    sed -i 's/old_pattern/new_pattern/' <test-file>
    ```

    Commit with `drop:` prefix (these get removed on the next rebase):

    ```bash
    git commit -s -m "drop: Cherry-pick upstream test fixes for CI stability

    Cherry-picked from upstream master (post-$UPSTREAM_TAG):
    - <hash> <subject>"
    ```

    Common upstream flaky tests to check for fixes:

    - `tests/assistant/test_tool_executor.py` — `asyncio.get_event_loop()` → `asyncio.run()`
    - `tests/gateway/test_tracing_utils.py` — same asyncio pattern
    - `tests/data/test_huggingface_dataset_and_source.py` — HF Hub rate limits / network issues
    - `tests/webhooks/test_e2e.py` — server startup timeout too short

**Next:** CI issues are fixed. Move to Phase 5 to prepare the branch for merging.

---

## Phase 5: Merge Strategy (No Force Push)

**Goal:** Make the rebase branch mergeable to `master` via a normal PR, without force pushing.

Product security prohibits force pushing. Use the `merge -s ours` strategy:

21. **Link histories:**

    ```bash
    git merge -s ours upstream/master -m "Automated sync: integrating upstream MLflow $UPSTREAM_TAG"
    ```

    This creates a merge commit that keeps our rebased content bit-for-bit but adds `upstream/master` as an ancestor. GitHub now sees `master` as reachable from our branch, so a PR can be merged normally.

    **If new PRs merge to master during the rebase process**, run `git merge -s ours upstream/master` again on the rebase branch. This is safe to repeat — it just adds another merge commit linking the latest master. Update FORK_HISTORY.md to note which PRs were included. Then rebuild the ci-check branch.

**Next:** Move to Phase 6 to document what was done.

---

## Phase 6: Documentation

**Goal:** Record everything in FORK_HISTORY.md so the next rebase has full context.

22. **Add a rebase entry to `FORK_HISTORY.md`** documenting:

    - Dropped commits (with upstream equivalents)
    - Squashed commits by category (with original hashes)
    - Conflict resolutions (file-by-file)
    - Post-rebase CI fixes applied
    - UI fixes found during visual verification
    - Test updates for ODH-simplified behavior
    - Upstream test fixes cherry-picked (with commit hashes)
    - Commits that were missing the `keep:`/`drop:` prefix

    **Keep updating FORK_HISTORY.md throughout the process** — don't wait until the end. Every fix you make after the initial rebase (CI failures, UI regressions, test mismatches, upstream cherry-picks) should be added.

23. **Commit:**

    ```bash
    git add FORK_HISTORY.md .claude/skills/rebase-mlflow/skill.md && \
    git commit -s -m "keep: Post-rebase fixes and documentation"
    ```

    Combine the CI fixes, test fixes, documentation, and skill into a single `keep:` commit. The upstream cherry-picks stay as a separate `drop:` commit.

**Next:** The branch is ready. Move to Phase 7 to validate with CI.

---

## Phase 7: CI Validation

**Goal:** Run CI against the rebase branch to catch issues before the real PR. Most relevant workflows trigger naturally; optionally remove path filters for broader coverage (skip `slow-tests.yml` and `helm.yml` — they test upstream-only features).

24. **Push the clean rebase branch:**

    ```bash
    git push upstream rebase-$UPSTREAM_TAG
    ```

25. **Create a CI check branch** with workflow path filters removed so all jobs fire:

    ```bash
    git checkout -b ci-check-rebase-$UPSTREAM_TAG rebase-$UPSTREAM_TAG

    python3 -c "
    import re, glob
    for wf in sorted(glob.glob('.github/workflows/*.yml')):
        with open(wf) as f: content = f.read()
        original = content
        content = re.sub(r'(\n    paths(?:-ignore)?:\n(?:      - .*\n)+)', '\n', content)
        if content != original:
            with open(wf, 'w') as f: f.write(content)
    "

    git add .github/workflows/
    git commit -s -m "TEMPORARY: Remove workflow path filters for full CI validation

    DO NOT MERGE - this commit exists only to trigger all CI workflows."
    git push upstream ci-check-rebase-$UPSTREAM_TAG
    ```

26. **Create the CI validation PR — NOT as a draft.** Include collaboration instructions in the body so teammates know how to contribute fixes:

    ```bash
    gh pr create --repo opendatahub-io/mlflow --base master \
      --head ci-check-rebase-$UPSTREAM_TAG \
      --title "[DO NOT MERGE] CI validation for MLflow $UPSTREAM_TAG rebase" \
      --body "$(cat <<'EOF'
    ## DO NOT MERGE THIS PR

    CI validation only for the MLflow $UPSTREAM_TAG rebase. Workflow path filters removed to trigger all pipelines.

    **Clean rebase branch:** `rebase-$UPSTREAM_TAG`

    ### Want to help test or fix something?

    If you spot an issue on the rebased branch, here's how to submit a fix:

    1. Create a branch off `rebase-$UPSTREAM_TAG` (not master)
    2. Commit your fix with a `keep:` prefix (e.g. `keep: Fix modal padding after rebase`)
    3. Add a line to `FORK_HISTORY.md` under "Post-rebase fixes" describing what you fixed
    4. Open a PR targeting `rebase-$UPSTREAM_TAG` (not master)

    The rebase owner will merge it and rebuild the CI validation branch.
    EOF
    )"
    ```

    **Do NOT use `--draft`.** Most workflows have `if: draft == false` and will skip. Un-drafting later does not re-trigger them (the `ready_for_review` event is not in the triggers).

27. **Monitor CI:** `gh pr checks <PR_NUMBER> --repo opendatahub-io/mlflow`

28. **If CI fails:** Always fix on the clean branch first, then rebuild ci-check:

    ```bash
    # 1. Fix on the clean branch
    git checkout rebase-$UPSTREAM_TAG
    # ... make fixes, commit ...
    git push upstream rebase-$UPSTREAM_TAG

    # 2. Rebuild ci-check: reset to clean branch, re-apply workflow removal
    git checkout ci-check-rebase-$UPSTREAM_TAG
    git reset --hard rebase-$UPSTREAM_TAG

    python3 -c "
    import re, glob
    for wf in sorted(glob.glob('.github/workflows/*.yml')):
        with open(wf) as f: content = f.read()
        original = content
        content = re.sub(r'(\n    paths(?:-ignore)?:\n(?:      - .*\n)+)', '\n', content)
        if content != original:
            with open(wf, 'w') as f: f.write(content)
    "

    git add .github/workflows/
    git commit -s -m "TEMPORARY: Remove workflow path filters for full CI validation

    DO NOT MERGE - this commit exists only to trigger all CI workflows."
    git push upstream ci-check-rebase-$UPSTREAM_TAG --force-with-lease
    ```

    This keeps ci-check as exactly `rebase-$UPSTREAM_TAG` + one disposable commit.

29. **Close the PR** once all CI passes (do NOT merge).

**Next:** CI is green. Move to Phase 8 to create the real PR.

---

## Phase 8: Real Merge PR

**Goal:** Get the rebase reviewed and merged into master.

30. **Create the real PR.** The repo requires `## Upstream / Downstream Impact` and `## Testing` sections in the PR body:

    ```bash
    gh pr create --repo opendatahub-io/mlflow --base master \
      --head rebase-$UPSTREAM_TAG \
      --title "Rebase ODH MLflow onto upstream $UPSTREAM_TAG"
    ```

    Include in the body: summary of commits, what changed, regression check results, and the required template sections:

    ```markdown
    ## Upstream / Downstream Impact

    - [x] Downstream-only change for `opendatahub-io/mlflow`

    ## Testing

    - [x] CI
    - [x] Unit tests
    - [x] Manual testing
    ```

31. **Get reviews**, then merge. The `merge -s ours` commit ensures the PR diff is clean.

32. **Cleanup** midstream:
    - Delete `ci-check-rebase-$UPSTREAM_TAG` branch from upstream
    - Keep `rebase-$UPSTREAM_TAG` and `master-MM-DD` for reference

---

## Phase 9: Downstream Sync

**Goal:** Sync the downstream productization repo (`red-hat-data-services/mlflow`) from midstream, then get the release branch updated.

33. **Create a sync branch from midstream master and merge downstream main into it:**

    ```bash
    git remote add downstream https://github.com/red-hat-data-services/mlflow.git 2>/dev/null || true
    git fetch downstream main
    git checkout -b sync-odh-$UPSTREAM_TAG upstream/master
    git merge downstream/main --no-edit
    ```

34. **Resolve conflicts.** The downstream repo has its own deployment configs. Follow this rule:

    | File                    | Take from      | Why                                                                                    |
    | ----------------------- | -------------- | -------------------------------------------------------------------------------------- |
    | `.tekton/*`             | **Downstream** | Auto-synced from `konflux-central`; downstream version matches the RHDS Konflux tenant |
    | `Dockerfile.konflux`    | **Downstream** | May have RHDS-specific build steps                                                     |
    | `.github/renovate.json` | **Downstream** | RHDS-specific renovate config                                                          |
    | `pyproject.toml`        | **Midstream**  | Take upstream's `required-version` and ODH config                                      |
    | Everything else         | **Midstream**  | That's the whole point of the sync                                                     |

    Git usually auto-merges correctly (downstream for deployment configs, midstream for code). Verify with:

    ```bash
    git diff downstream/main -- .tekton/ Dockerfile.konflux .github/renovate.json  # should be 0
    git diff upstream/master -- mlflow/ FORK_HISTORY.md                             # should be 0
    ```

35. **Run prettier** on any auto-merged files that might need formatting:

    ```bash
    uv run pre-commit run prettier --files .github/renovate.json
    ```

36. **Push and create PR** targeting `main` on the downstream repo. Use **"Create a merge commit"** when merging (not squash or rebase):

    ```bash
    git push downstream sync-odh-$UPSTREAM_TAG
    gh pr create --repo red-hat-data-services/mlflow --base main \
      --head sync-odh-$UPSTREAM_TAG \
      --title "ODH Sync: MLflow $UPSTREAM_TAG rebase"
    ```

    Expected CI: `Build and Push Image` will fail on PRs (no quay.io credentials for branches — works after merge). `CodeQL` may flag pre-existing upstream patterns. Both are safe to ignore — previous sync PRs were merged with the same failures.

37. **After the sync PR merges to `main`**, notify the release engineering team to merge `main` into the active release branch (e.g., `rhoai-3.5-ea.2`). They do this via direct push (`git merge main`), not PRs. The Tekton automation from `konflux-central` will auto-sync the `.tekton/` files to the release branch afterward.

---

## Phase 10: Operator Version Bump

**Goal:** Update the MLflow operator to expect the new MLflow version. Without this, the migration job fails with "unexpected MLflow version."

38. **Submit a PR to `opendatahub-io/mlflow-operator`** updating version references. These files must be updated on **every** version bump:

    | File                                       | What to change                                     |
    | ------------------------------------------ | -------------------------------------------------- |
    | `config/component_metadata.yaml`           | `version: v3.X.0` — the source of truth            |
    | `.github/workflows/upgrade-validation.yml` | `jsonpath={.status.version}=3.X.0` in kubectl wait |

    ```bash
    # Quick way to find all references to the old version:
    grep -rn 'OLD_VERSION' config/ .github/workflows/upgrade-validation.yml
    ```

    Note: `mlflow-tests/tests/upgrade/` also contains version strings in test fixtures, but they test version parsing logic, not the actual deployed version. Updating them is optional.

39. **After the operator PR merges**, notify Matt to sync it to `red-hat-data-services/mlflow-operator` (he owns all operator sync PRs).

---

## Team Collaboration During Rebase

Teammates can help test and fix the rebase branch without running this skill.

**For teammates submitting fixes:**

1. Create a branch off `rebase-$UPSTREAM_TAG` (not master)
2. Fix the issue, commit with `keep:` prefix
3. Add a line to `FORK_HISTORY.md` under "Post-rebase fixes" describing what was fixed and why
4. Open a PR targeting `rebase-$UPSTREAM_TAG` (not master)

**For the rebase owner (the person running this skill):**

1. Review and merge the teammate's PR into `rebase-$UPSTREAM_TAG`
2. Pull the latest: `git pull upstream rebase-$UPSTREAM_TAG`
3. Rebuild the ci-check branch (step 27 above) to re-trigger CI
4. Push: `git push upstream ci-check-rebase-$UPSTREAM_TAG --force-with-lease`

This keeps the rebase owner in control of the ci-check branch and the final merge, while letting the team contribute fixes in parallel.

---

## Conflict Resolution Reference

**Priority order:**

1. **Keep ODH customizations** — feature flags, module federation, PatternFly overrides, Konflux configs, gateway disable decorator, `onWorkspaceChange`
2. **Accept upstream renames/refactors** — function renames, new parameters, API changes
3. **Merge when both sides add** — imports, env vars, i18n entries, route definitions, webpack config functions
4. **Remove upstream-only CI** — Databricks tests, upstream-specific workflows
5. **For lock files** — take ODH's `exclude-newer-span`, accept upstream deps
6. **When in doubt** — check `git show upstream/master:<file>` for the intended final state

### File-by-file patterns

**Scaffolding commit:**

| File                                      | Resolution                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `.github/workflows/*.yml` (modify/delete) | ODH deletes upstream workflows (approval, autoformat, cross-version-tests, slow-tests, helm, etc.). `git rm` all.  |
| `.github/workflows/master.yml`            | Remove Databricks-specific test steps.                                                                             |
| `pyproject.toml` `[tool.uv]`              | Keep ODH's `exclude-newer = "P14D"` and extra `exclude-newer-package` entries. Take upstream's `required-version`. |
| `uv.lock`                                 | Take ODH's `exclude-newer-span = "P14D"`.                                                                          |

**UI commit:**

| File                              | Resolution                                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `mlflow/environment_variables.py` | Keep both upstream's new vars and ODH's `MLFLOW_ENABLE_ASSISTANT` / `MLFLOW_ENABLE_AI_GATEWAY`.                                                 |
| `mlflow/server/handlers.py`       | Keep ODH's `_disable_gateway` decorator. Accept upstream function renames.                                                                      |
| `craco.config.js`                 | Keep both webpack config functions (upstream's + ODH's `suppressAutoprefixerWarnings`).                                                         |
| `MlflowRouter.tsx`                | Keep upstream route imports + ODH's `shouldEnableAIGateway()` wrapper on gateway routes.                                                        |
| `MlflowSidebar.tsx`               | Keep upstream imports + ODH's `isAssistantEnabled`.                                                                                             |
| `validations.ts`                  | Keep ODH's simplified `.catch(() => callback(undefined))`. Remove dead `isResourceDoesNotExistError` and unused `ErrorCodes` import.            |
| `ExperimentViewHeader.tsx`        | Keep imports from both sides.                                                                                                                   |
| `en.json`                         | Keep entries from both sides in alphabetical order. Then run `yarn i18n` in Phase 4 to prune orphans.                                           |
| `WorkspaceUtils.ts`               | Keep both upstream's `useSyncExternalStore` pattern AND ODH's `onWorkspaceChange`. Both listener sets must be notified in `setActiveWorkspace`. |

## Safety Checklist

Run through this before creating the real PR:

**Rebase integrity:**

- [ ] Auth plugin compatibility verified
- [ ] Master backed up to `master-MM-DD`
- [ ] All `drop:`/`backport:` commits confirmed in target tag
- [ ] No stray conflict markers (`grep -c '<<<<<<<'`)
- [ ] TypeScript compiles with zero errors
- [ ] Key ODH features verified (env vars, gateway decorator, workspace utils, PatternFly overrides)

**Recurring CI fixes applied:**

- [ ] i18n keys synced (`yarn i18n`)
- [ ] `UV_EXCLUDE_NEWER` set to `P14D` in `.github/actions/setup-python/action.yml`
- [ ] `uv` version pin compatible with `pyproject.toml` `required-version`
- [ ] Conftest lint passes for composite actions
- [ ] `FORK_HISTORY.md` excluded from typos checker in `pyproject.toml`
- [ ] Prettier v2 run on all modified markdown files (`uv run pre-commit run prettier`)

**Upstream test fixes:**

- [ ] Upstream flaky test fixes cherry-picked (asyncio, HF cache, webhook retries)
- [ ] Cherry-picks tagged with `drop:` prefix

**Documentation and validation:**

- [ ] `FORK_HISTORY.md` updated with full changelog (conflicts, fixes, cherry-picks)
- [ ] Visual verification of federated components (experiments, prompts, run tabs, compare runs)
- [ ] CI validation PR passes (NOT a draft PR)
- [ ] All fixes committed on clean `rebase-$UPSTREAM_TAG` branch (not only on ci-check)
- [ ] Real PR includes required template sections (Upstream/Downstream Impact, Testing)

**Downstream sync:**

- [ ] Downstream sync PR merged (downstream deployment configs kept, midstream code synced)
- [ ] Release engineering notified to merge `main` into active release branch

**Operator version bump:**

- [ ] `config/component_metadata.yaml` updated
- [ ] `.github/workflows/upgrade-validation.yml` updated
- [ ] Operator PR merged, synced to `red-hat-data-services/mlflow-operator`
