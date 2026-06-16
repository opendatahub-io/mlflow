# Phases 1–4: Prepare, Squash, Rebase, Fix

## Phase 1: Preparation

**Goal:** Understand what we're working with — the current base, all downstream commits, and which can be dropped.

1. **Verify git remotes point to the right repos.** Run `git remote -v` and confirm you have remotes for these three repos (the remote names are up to you):

   | Repo                   | URL                                                   | Used as in this guide |
   | ---------------------- | ----------------------------------------------------- | --------------------- |
   | Upstream OSS MLflow    | `https://github.com/mlflow/mlflow.git`                | `$UPSTREAM_REMOTE`    |
   | ODH fork (midstream)   | `https://github.com/opendatahub-io/mlflow.git`        | `$ODH_REMOTE`         |
   | RHDS fork (downstream) | `https://github.com/red-hat-data-services/mlflow.git` | `$DOWNSTREAM_REMOTE`  |
   | Your personal fork     | `https://github.com/<you>/mlflow.git`                 | `origin`              |

   Set variables matching your remote names so the commands below work as-is:

   ```bash
   UPSTREAM_REMOTE=upstream    # whatever you named the mlflow/mlflow remote
   ODH_REMOTE=odh              # whatever you named the opendatahub-io/mlflow remote
   DOWNSTREAM_REMOTE=downstream  # whatever you named the red-hat-data-services/mlflow remote
   ```

   Then fetch:

   ```bash
   git fetch $UPSTREAM_REMOTE --tags
   git fetch $ODH_REMOTE
   ```

2. **Identify the current base version** from `pyproject.toml` (more reliable than git log):

   ```bash
   CURRENT_VERSION=v$(grep '^version' pyproject.toml | head -1 | sed 's/version = "\(.*\)"/\1/')
   echo "Current version: $CURRENT_VERSION"
   ```

   This must match a git tag (e.g., `v3.13.0`). Verify: `git tag -l $CURRENT_VERSION`

3. **Inventory all downstream commits:**

   ```bash
   git log --format='%h %s' $ODH_REMOTE/master --not $CURRENT_VERSION
   ```

   Categorize each commit:

   - `drop:` — cherry-picks from upstream. Drop if the original is in the target tag.
   - `backport:` — treat as `drop:` if the original commit (check `cherry picked from` trailer) is in the target tag.
   - `keep:` — ODH-specific changes to preserve.
   - **No prefix** — flag these; they should be `keep:` commits.

4. **Verify all drops are in the target tag:**

   ```bash
   git log --oneline $UPSTREAM_TAG --grep="<PR number>"
   ```

5. **Check files touched by each keep commit** to assign it to a category:
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

6. **Create the rebase branch and record the squash base:**

   ```bash
   git checkout -b rebase-$UPSTREAM_TAG $CURRENT_VERSION
   SQUASH_BASE=$(git rev-parse $ODH_REMOTE/master)
   echo "SQUASH_BASE=$SQUASH_BASE" >> /tmp/rebase-vars.env
   echo "Squash base (master at squash time): $SQUASH_BASE"
   ```

   **Save `$SQUASH_BASE`** — you will need it in Phase 4 for CSS audit and Phase 5 to detect late-merging PRs.

7. **Cherry-pick each category** using `--no-commit` to squash:

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

   **If you hit conflicts during squashing:** Later commits may conflict with earlier ones in the same category. Resolve by taking the final version from `$ODH_REMOTE/master` (which has the intended downstream state):

   ```bash
   git show $ODH_REMOTE/master:<conflicted-file> > <conflicted-file>
   git add <conflicted-file>
   ```

**Next:** You have a branch with 3 squashed commits on `CURRENT_VERSION`. Move to Phase 3 to rebase them onto the target tag.

---

## Phase 3: Rebase onto Target Tag

**Goal:** Move the 3 squashed commits from `CURRENT_VERSION` to the target tag, resolving all merge conflicts.

8. **Rebase:**

   ```bash
   git rebase --onto $UPSTREAM_TAG $CURRENT_VERSION rebase-$UPSTREAM_TAG
   ```

   **If the rebase fails catastrophically** (not just conflicts): run `git rebase --abort` and re-examine the squash commits from Phase 2.

9. **Resolve conflicts.** Git will stop at each conflicted commit. Read `.claude/skills/rebase-mlflow/conflict-resolution.md` for file-by-file patterns. The general rules:

   - **Modify/delete (workflows):** ODH intentionally deletes upstream CI files → `git rm`
   - **Both sides added code:** Keep both (upstream's + ODH's)
   - **Upstream renamed something:** Accept the rename, keep ODH additions

   After resolving each commit's conflicts:

   ```bash
   git add -A
   GIT_EDITOR=true git rebase --continue
   ```

10. **Verify the rebase:**

    ```bash
    # No stray conflict markers
    git diff $UPSTREAM_TAG..rebase-$UPSTREAM_TAG -- . | grep -c '<<<<<<<'

    # TypeScript compiles (subshell to avoid changing working directory)
    (cd mlflow/server/js && npx tsc --noEmit --pretty)

    # ODH-specific files exist
    ls OWNERS Dockerfile.konflux mlflow/server/js/src/odh/

    # Key ODH features present
    grep -n 'MLFLOW_ENABLE_ASSISTANT\|MLFLOW_ENABLE_AI_GATEWAY' mlflow/environment_variables.py
    grep -n '_disable_gateway' mlflow/server/handlers.py | head -3
    grep -n 'onWorkspaceChange' mlflow/server/js/src/workspaces/utils/WorkspaceUtils.ts
    ```

10a. **Flag new upstream workflows** that were added by the rebase. Any workflow not relevant to the ODH fork should be deleted and squashed into the scaffolding commit:

    ```bash
    git diff $UPSTREAM_TAG..HEAD --name-only --diff-filter=A -- .github/workflows/
    ```

    Review each new workflow — if it's Databricks-specific, upstream-only CI, or not applicable to the fork, `git rm` it and amend the scaffolding commit.

**Next:** The rebase is done but CI will fail on several known issues. Move to Phase 4 to fix them before pushing.

---

## Phase 4: Fix Recurring CI Issues

**Goal:** Fix issues that break CI on **every** rebase because upstream changes reset ODH-specific config.

11. **i18n key drift** — Conflict resolution keeps i18n entries from both sides, but some upstream keys reference components removed in the same release:

    ```bash
    (cd mlflow/server/js && yarn i18n)
    git diff mlflow/server/js/src/lang/default/en.json
    ```

    If `yarn i18n` fails, run `(cd mlflow/server/js && yarn install)` first.

12. **`UV_EXCLUDE_NEWER` env var** — `.github/actions/setup-python/action.yml` hardcodes `UV_EXCLUDE_NEWER`. Upstream sets `P7D`; ODH needs `P14D`:

    ```bash
    grep 'UV_EXCLUDE_NEWER' .github/actions/setup-python/action.yml
    ```

13. **`uv` version pinning** — Same action file pins a `uv` version. If upstream bumped it, verify compatibility with `pyproject.toml`'s `required-version`.

14. **Conftest lint for composite actions** — Repo policy forbids `${{ }}` interpolation in `run:` blocks of composite actions. Move values to `env:` blocks. Verify: `uv run pre-commit run conftest --all-files`

15. **FORK_HISTORY.md typos exclusion** — `FORK_HISTORY.md` is excluded from the typos checker via `[tool.typos.files]` `extend-exclude` in `pyproject.toml`. If lost during a rebase conflict, re-add it.

16. **Prettier formatting** — Use **prettier v2** via the pre-commit hook (NOT `npx prettier` which installs v3):

    ```bash
    uv run pre-commit run prettier --files FORK_HISTORY.md .claude/skills/rebase-mlflow/skill.md
    ```

17. **Upstream tests broken by ODH simplifications** — Run the JS tests to catch breakage:

    ```bash
    (cd mlflow/server/js && yarn test --watchAll=false 2>&1 | tail -20)
    ```

    If tests fail: check whether the failure is from an ODH simplification (update test expectations) or a genuine upstream bug (cherry-pick a fix in step 20). If unclear, investigate before changing tests.

18. **Commit CI fixes** by amending them into the relevant squash commit (scaffolding, backend, or UI) rather than creating a separate commit:

    ```bash
    # Stage the fixes, then amend into the appropriate squash commit.
    # For example, if the fix is to a workflow file (scaffolding):
    git add -A && git commit --amend --no-edit
    ```

    If fixes span multiple categories, commit them into the last `keep:` commit (UI changes).

19. **Cherry-pick upstream flaky test fixes** — the target tag may include tests that fail due to bugs fixed on upstream `master` after the release. Cherry-pick each individually with `-x` to record the source:

    ```bash
    git fetch $UPSTREAM_REMOTE master
    git log --oneline $UPSTREAM_REMOTE/master --not $UPSTREAM_TAG -- <failing-test-file>

    # Cherry-pick with -x (records source hash) and override the message with drop: prefix
    git cherry-pick -x <hash>
    git commit --amend -s -m "drop: <original subject>"
    ```

20. **Run CSS override audit** to detect selector breakage from upstream dependency changes:

    ```bash
    (cd mlflow/server/js && yarn audit:css-overrides)
    ```

    If new failures appear (exit code 1), either fix the override selectors in `src/common/styles/patternfly/` or accept them into the baseline with `yarn audit:css-overrides:update`.

21. **Run post-rebase CSS drift analysis** to generate a visual review checklist:

    ```bash
    (cd mlflow/server/js && yarn audit:rebase --from=$SQUASH_BASE)
    ```

    This reports which override areas were affected by package version changes. After visual verification, record the verified versions:

    ```bash
    (cd mlflow/server/js && yarn audit:rebase --update-versions)
    git add mlflow/server/js/scripts/css-overrides-verified-versions.txt
    ```

22. **Bump the Kubernetes auth plugin** to a version compatible with the target MLflow release. Check [mlflow-integration releases](https://github.com/kubeflow/mlflow-integration/releases) for a version that supports `$UPSTREAM_TAG`:

    ```bash
    # Current pinned version:
    grep mlflow-kubernetes-plugins requirements/konflux-pypi.in

    # Update to the compatible version:
    sed -i '' 's/mlflow-kubernetes-plugins==.*/mlflow-kubernetes-plugins==<new-version>/' requirements/konflux-pypi.in
    ```

    Then regenerate the locked requirements:

    ```bash
    uv run python requirements/compile.py
    ```

    **If no compatible version exists**, abort the rebase and notify the team — the auth plugin must support the target MLflow version before we can ship.

**Next:** CI issues are fixed. Move to Phase 5 (read `.claude/skills/rebase-mlflow/02-merge-and-validate.md`).
