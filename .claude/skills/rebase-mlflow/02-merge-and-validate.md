# Phases 5–8: Merge, Document, Validate, Ship

## Phase 5: Merge Strategy (No Force Push)

**Goal:** Make the rebase branch mergeable to `master` via a normal PR, without force pushing.

Product security prohibits force pushing. Use the `merge -s ours` strategy:

23. **Link histories:**

    ```bash
    git fetch $ODH_REMOTE master
    git merge -s ours $ODH_REMOTE/master -m "Merge upstream MLflow $UPSTREAM_TAG into ODH fork"
    ```

    This creates a merge commit that keeps our rebased content bit-for-bit but adds `upstream/master` as an ancestor.

    > **WARNING — `merge -s ours` discards master's tree.** The merge commit's file tree is identical to the rebase branch. Any commits on master that were NOT included in the Phase 2 squash are silently dropped — their history is linked but their content is gone. You MUST cherry-pick late-merging PRs (step 24) to preserve their content.

    **Recovery:** If you ran `merge -s ours` from the wrong branch or it went wrong: `git reset --hard HEAD~1` to undo the merge commit, then retry.

24. **Cherry-pick any late-merging PRs.** Use the `$SQUASH_BASE` SHA from step 6 (if not set, reload: `source /tmp/rebase-vars.env`):

    ```bash
    git log --oneline $SQUASH_BASE..$ODH_REMOTE/master
    ```

    For each listed commit, cherry-pick it:

    ```bash
    git cherry-pick <hash>
    ```

    If conflicts arise, resolve them (the cherry-picked content should win).

    **Repeat this step every time `merge -s ours` is re-run.** Before each re-run, record the current master SHA so you can find the delta:

    ```bash
    PREV_MASTER=$(git rev-parse $ODH_REMOTE/master)
    git fetch $ODH_REMOTE master
    git merge -s ours $ODH_REMOTE/master -m "Merge upstream MLflow $UPSTREAM_TAG into ODH fork (including latest master)"
    git log --oneline $PREV_MASTER..$ODH_REMOTE/master
    git cherry-pick <new-hash-1> <new-hash-2> ...
    ```

    Update FORK_HISTORY.md to note which late-merging PRs were cherry-picked and why.

25. **Verify no content was dropped:**

    ```bash
    git diff --name-only --diff-filter=D $ODH_REMOTE/master..HEAD
    git diff $ODH_REMOTE/master..HEAD -- $(git diff --name-only $SQUASH_BASE..$ODH_REMOTE/master)
    ```

    For each difference, confirm it was intentional (upstream deletion or `drop:` commit) and not a late-merge casualty.

---

## Phase 6: Documentation

**Goal:** Record everything in FORK_HISTORY.md so the next rebase has full context.

26. **Add a rebase entry to `FORK_HISTORY.md`** documenting:

    - Dropped commits (with upstream equivalents)
    - Squashed commits by category (with original hashes)
    - Conflict resolutions (file-by-file)
    - Post-rebase CI fixes applied
    - UI fixes found during visual verification
    - Test updates for ODH-simplified behavior
    - Upstream test fixes cherry-picked (with commit hashes)
    - Late-merging PRs cherry-picked (with PR numbers and why they were late)

    **Keep updating FORK_HISTORY.md throughout the process** — don't wait until the end.

27. **Commit documentation changes:**

    ```bash
    git add FORK_HISTORY.md .claude/skills/rebase-mlflow/ && \
    git commit -s -m "keep: Rebase documentation update"
    ```

---

## Phase 7: CI Validation

**Goal:** Run CI against the rebase branch to catch issues before the real PR.

28. **Push the clean rebase branch:**

    ```bash
    git push $ODH_REMOTE rebase-$UPSTREAM_TAG
    ```

29. **Create a CI check branch** with workflow path filters removed so all jobs fire:

    ```bash
    git checkout -b ci-check-rebase-$UPSTREAM_TAG rebase-$UPSTREAM_TAG
    python3 .claude/skills/rebase-mlflow/remove-workflow-path-filters.py
    git add .github/workflows/
    git commit -s -m "TEMPORARY: Remove workflow path filters for full CI validation

    DO NOT MERGE - this commit exists only to trigger all CI workflows."
    git push $ODH_REMOTE ci-check-rebase-$UPSTREAM_TAG
    ```

    > **Security note:** This same-repo PR runs the branch's workflow definitions with repository secrets. The only change to workflows is path-filter removal (no new run commands). Review the rebase branch's workflow files before pushing if you're concerned about blast radius.

30. **Create the CI validation PR — NOT as a draft:**

    ```bash
    gh pr create --repo opendatahub-io/mlflow --base master \
      --head ci-check-rebase-$UPSTREAM_TAG \
      --title "[DO NOT MERGE] CI validation for MLflow $UPSTREAM_TAG rebase" \
      --body "## DO NOT MERGE THIS PR

    CI validation only for the MLflow $UPSTREAM_TAG rebase. Workflow path filters removed to trigger all pipelines.

    **Clean rebase branch:** rebase-$UPSTREAM_TAG

    ### Want to help test or fix something?

    1. Create a branch off rebase-$UPSTREAM_TAG (not master)
    2. Commit your fix with a keep: prefix
    3. Add a line to FORK_HISTORY.md under Post-rebase fixes
    4. Open a PR targeting rebase-$UPSTREAM_TAG (not master)"
    ```

    **Do NOT use `--draft`.** Most workflows have `if: draft == false` and will skip.

31. **Monitor CI:** `gh pr checks <PR_NUMBER> --repo opendatahub-io/mlflow`

32. **If CI fails:** Always fix on the clean branch first, then rebuild ci-check:

    ```bash
    git checkout rebase-$UPSTREAM_TAG
    # ... make fixes, commit ...
    git push $ODH_REMOTE rebase-$UPSTREAM_TAG

    git checkout ci-check-rebase-$UPSTREAM_TAG
    git reset --hard rebase-$UPSTREAM_TAG
    python3 .claude/skills/rebase-mlflow/remove-workflow-path-filters.py
    git add .github/workflows/
    git commit -s -m "TEMPORARY: Remove workflow path filters for full CI validation

    DO NOT MERGE - this commit exists only to trigger all CI workflows."
    git push $ODH_REMOTE ci-check-rebase-$UPSTREAM_TAG --force-with-lease
    ```

33. **If new PRs merge to master during CI validation**, re-run the late-merge handling (steps 23–25) before rebuilding ci-check.

34. **Close the PR** once all CI passes (do NOT merge).

---

## Phase 8: Real Merge PR

**Goal:** Get the rebase reviewed and merged into master.

35. **Re-run late-merge check one final time.** Fetch master and verify no new PRs merged since the last `merge -s ours`. If any did, repeat steps 23–25.

36. **Read the safety checklist** at `.claude/skills/rebase-mlflow/safety-checklist.md` and verify every item before proceeding.

37. **Create the real PR:**

    ```bash
    gh pr create --repo opendatahub-io/mlflow --base master \
      --head rebase-$UPSTREAM_TAG \
      --title "Rebase ODH MLflow onto upstream $UPSTREAM_TAG" \
      --body "## Summary

    Rebase ODH MLflow onto upstream $UPSTREAM_TAG.

    ## Upstream / Downstream Impact

    - [x] Downstream-only change for opendatahub-io/mlflow

    ## Testing

    - [x] CI
    - [x] Unit tests
    - [x] Manual testing"
    ```

38. **Get reviews**, then merge.

39. **Cleanup** midstream:
    - Delete `ci-check-rebase-$UPSTREAM_TAG` branch from upstream
    - Keep `rebase-$UPSTREAM_TAG` for reference

**Next:** PR is merged. Read `.claude/skills/rebase-mlflow/03-downstream-sync.md` for downstream sync and operator bump.
