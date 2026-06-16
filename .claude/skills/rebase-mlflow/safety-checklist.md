# Safety Checklist

Run through this before creating the real PR (step 37 in `02-merge-and-validate.md`).

If `$SQUASH_BASE` is not set, reload it: `source /tmp/rebase-vars.env`

**Rebase integrity:**

- [ ] Auth plugin compatibility verified and `mlflow-kubernetes-plugins` bumped in `requirements/konflux-pypi.in`
- [ ] All `drop:`/`backport:` commits confirmed in target tag
- [ ] No stray conflict markers (`grep -c '<<<<<<<'`)
- [ ] TypeScript compiles with zero errors
- [ ] Key ODH features verified (env vars, gateway decorator, workspace utils, PatternFly overrides)
- [ ] Late-merging PRs cherry-picked — no PRs merged to master after `$SQUASH_BASE` whose content is missing

**CSS override audit:**

- [ ] `yarn audit:css-overrides` passes (no new failures)
- [ ] `yarn audit:rebase --from=$SQUASH_BASE` reviewed — all flagged override areas visually verified
- [ ] Verified versions updated (`yarn audit:rebase --update-versions`) and committed

**Recurring CI fixes applied:**

- [ ] i18n keys synced (`yarn i18n`)
- [ ] `UV_EXCLUDE_NEWER` set to `P14D` in `.github/actions/setup-python/action.yml`
- [ ] `uv` version pin compatible with `pyproject.toml` `required-version`
- [ ] Conftest lint passes for composite actions
- [ ] `FORK_HISTORY.md` excluded from typos checker in `pyproject.toml`
- [ ] Prettier v2 run on all modified markdown files

**Upstream test fixes:**

- [ ] Upstream flaky test fixes cherry-picked
- [ ] Cherry-picks tagged with `drop:` prefix

**Documentation and validation:**

- [ ] `FORK_HISTORY.md` updated with full changelog (conflicts, fixes, cherry-picks)
- [ ] Visual verification of federated components (requires running dev server)
- [ ] CI validation PR passes (NOT a draft PR)
- [ ] All fixes committed on clean `rebase-$UPSTREAM_TAG` branch (not only on ci-check)
- [ ] Real PR includes required template sections (Upstream/Downstream Impact, Testing)

**Downstream sync (after merge):**

- [ ] Downstream sync PR merged (downstream deployment configs kept, midstream code synced)
- [ ] Release engineering notified to merge `main` into active release branch

**Operator version bump (after merge):**

- [ ] `config/component_metadata.yaml` updated
- [ ] `.github/workflows/upgrade-validation.yml` updated
- [ ] Operator PR merged, synced to `red-hat-data-services/mlflow-operator`
