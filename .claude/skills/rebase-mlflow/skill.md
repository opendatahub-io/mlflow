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

## How This Works

The ODH MLflow repo is a fork of upstream `mlflow/mlflow`. We carry ~20 downstream commits (PatternFly CSS overrides, module federation, Konflux build configs, feature flags, E2E tests, etc.) on top of an upstream release tag. When upstream cuts a new release, we reapply our changes on top of it.

The process is split across multiple files to keep each phase focused. **Read each file when you reach that phase** — do not load them all upfront.

| Phase             | What happens                                           | Time     | File                       |
| ----------------- | ------------------------------------------------------ | -------- | -------------------------- |
| 1. Preparation    | Fetch, back up, inventory commits                      | ~10 min  | `01-prepare-and-rebase.md` |
| 2. Squash         | Group 20+ keep commits into 3 clean commits            | ~15 min  | `01-prepare-and-rebase.md` |
| 3. Rebase         | `git rebase --onto` the target tag, resolve conflicts  | ~30 min  | `01-prepare-and-rebase.md` |
| 4. CI fixes       | Fix recurring issues + cherry-pick upstream test fixes | ~30 min  | `01-prepare-and-rebase.md` |
| 5. Merge strategy | `git merge -s ours` to link histories (no force push)  | ~2 min   | `02-merge-and-validate.md` |
| 6. Documentation  | Update FORK_HISTORY.md                                 | ~10 min  | `02-merge-and-validate.md` |
| 7. CI validation  | Push, create PR, wait for ~70 CI jobs, fix failures    | ~2 hours | `02-merge-and-validate.md` |
| 8. Real PR        | Create the actual merge PR, get reviews                | ~1 day   | `02-merge-and-validate.md` |
| 9. Downstream     | Sync downstream repo, notify release engineering       | ~30 min  | `03-downstream-sync.md`    |
| 10. Operator      | Bump operator version to match new MLflow release      | ~15 min  | `03-downstream-sync.md`    |

All phase files are in `.claude/skills/rebase-mlflow/`.

## Prerequisites

Before starting, verify:

1. The [mlflow-integration auth plugin](https://github.com/kubeflow/mlflow-integration) supports the target MLflow version. Check for a recent release or PR. If not, **abort and notify the team**.
2. You have push access to `opendatahub-io/mlflow` and `red-hat-data-services/mlflow` (needed for Phase 9).
3. Remotes are configured — you need remotes pointing to these three repos (names are up to you; step 1 in Phase 1 maps your names to variables used in the commands):

   - `https://github.com/mlflow/mlflow.git` (upstream OSS)
   - `https://github.com/opendatahub-io/mlflow.git` (ODH fork / midstream)
   - Your personal fork

4. `node_modules` is installed: `cd mlflow/server/js && yarn install` (needed for Phase 4 audit tools and TypeScript checks).

## Execution

1. Read `.claude/skills/rebase-mlflow/01-prepare-and-rebase.md` and execute Phases 1–4 (steps 1–22).
2. Read `.claude/skills/rebase-mlflow/02-merge-and-validate.md` and execute Phases 5–8 (steps 23–39).
3. Read `.claude/skills/rebase-mlflow/03-downstream-sync.md` and execute Phases 9–10 (steps 40–47).

**Before creating the real PR (step 37 in `02-merge-and-validate.md`):** Read `.claude/skills/rebase-mlflow/safety-checklist.md` and verify every item.

**During conflict resolution (step 9):** Read `.claude/skills/rebase-mlflow/conflict-resolution.md` for file-by-file patterns.

## Key Variables

Track these throughout the process. **Persist them** — write to a scratch file or env file so they survive across sessions:

```bash
# Write after setting each variable:
echo "UPSTREAM_REMOTE=$UPSTREAM_REMOTE" >> /tmp/rebase-vars.env
echo "ODH_REMOTE=$ODH_REMOTE" >> /tmp/rebase-vars.env
echo "DOWNSTREAM_REMOTE=$DOWNSTREAM_REMOTE" >> /tmp/rebase-vars.env
echo "CURRENT_VERSION=$CURRENT_VERSION" >> /tmp/rebase-vars.env
echo "SQUASH_BASE=$SQUASH_BASE" >> /tmp/rebase-vars.env

# Reload in a new session:
source /tmp/rebase-vars.env
```

| Variable             | Format                                                        | Set in          | Used in                                             |
| -------------------- | ------------------------------------------------------------- | --------------- | --------------------------------------------------- |
| `$UPSTREAM_REMOTE`   | Git remote name (e.g., `upstream`)                            | Phase 1, step 1 | Everywhere (fetch, rebase)                          |
| `$ODH_REMOTE`        | Git remote name (e.g., `odh`)                                 | Phase 1, step 1 | Everywhere (push, merge, diff)                      |
| `$DOWNSTREAM_REMOTE` | Git remote name (e.g., `downstream`)                          | Phase 1, step 1 | Phase 9 (downstream sync)                           |
| `$UPSTREAM_TAG`      | `v3.14.0` (with `v` prefix)                                   | Skill argument  | Everywhere                                          |
| `$CURRENT_VERSION`   | `v3.13.0` (with `v` prefix — the tag, not the commit message) | Phase 1, step 2 | Phase 2 step 6, Phase 3 step 8                      |
| `$SQUASH_BASE`       | Full SHA                                                      | Phase 2, step 6 | Phase 4 steps 20–21, Phase 5 steps 24–25, checklist |

## Team Collaboration During Rebase

Teammates can help test and fix the rebase branch without running this skill.

**For teammates submitting fixes:**

1. Create a branch off `rebase-$UPSTREAM_TAG` (not master)
2. Fix the issue, commit with `keep:` prefix
3. Add a line to `FORK_HISTORY.md` under "Post-rebase fixes" describing what was fixed and why
4. Open a PR targeting `rebase-$UPSTREAM_TAG` (not master)

**For the rebase owner (the person running this skill):**

1. Review and merge the teammate's PR into `rebase-$UPSTREAM_TAG`
2. Pull the latest: `git pull $ODH_REMOTE rebase-$UPSTREAM_TAG`
3. Rebuild the ci-check branch (step 32 in `02-merge-and-validate.md`) to re-trigger CI
4. Push: `git push $ODH_REMOTE ci-check-rebase-$UPSTREAM_TAG --force-with-lease`
