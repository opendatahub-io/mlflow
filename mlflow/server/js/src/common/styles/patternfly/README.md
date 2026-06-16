# ODH PatternFly CSS Override System

This directory bridges the Databricks Design System (Du Bois) with the
PatternFly shell used by Open Data Hub. The OSS
[mlflow/mlflow](https://github.com/mlflow/mlflow) repo uses Du Bois components
throughout its UI; this layer makes them visually consistent inside the
ODH/PatternFly environment without touching the OSS component code.

> **Rebase note** — this entire directory is ODH-owned and does not exist in
> the OSS `mlflow/mlflow` repo. There is zero conflict risk on rebase for any
> file here. After rebasing, run the audit tools described below before pushing
> to catch CSS regressions introduced by OSS component changes.

---

## How it works

Du Bois components render with stable, predictable class names
(`du-bois-light-*` / `du-bois-dark-*`). The SCSS overrides target those
class names and remap their visual properties to PatternFly design tokens
(CSS custom properties), so the components look native to the PF shell without
requiring any changes to OSS MLflow component code.

The token values are read from `@patternfly/react-tokens` via the TypeScript
files in `patternflyStyles/`, converted into an Emotion theme object, and
injected at render time. The SCSS files consume the resulting CSS custom
properties.

```
@patternfly/react-tokens
        ↓
patternflyStyles/*.ts  (convert token objects to CSS custom property names)
        ↓
patternflyTokenTranslation.ts  (build the Emotion theme object)
        ↓
EmotionThemeProvider  (injects token values onto the container)
        ↓
pf-shell-overrides.scss  (applies overrides using those values)
```

The whole thing is scoped to `.pf-shell-root` so it never leaks outside
the MLflow container in federated mode.

---

## Adding a new override

1. Find the Du Bois class name by inspecting the element in the browser
   (look for `du-bois-light-*` on the rendered DOM node).
2. Add the rule to the appropriate partial above. Use PatternFly token
   variables for all values — check `patternflyStyles/` for what is
   available. Never hard-code colors or spacing.
3. Run the selector audit to confirm the class name exists in the installed
   package:
   ```
   yarn audit:css-overrides
   ```
   A `MISS` means you have a typo or the class name is wrong.

---

## Post-rebase workflow

After every rebase from [mlflow/mlflow](https://github.com/mlflow/mlflow),
run **both** audit tools before pushing. They take about 10 seconds combined
and require no browser.

### 1 — Selector existence check

```bash
yarn audit:css-overrides
```

Checks that every class name and CSS variable referenced in these SCSS files
still exists in the installed design system packages. A new failure (not in
the baseline) means a selector was renamed or removed by a package bump —
update the override or delete the dead rule.

If the failure is pre-existing dead CSS you are intentionally deferring:
```bash
yarn audit:css-overrides:update   # adds it to the known baseline
```

### 2 — Rebase impact report

```bash
yarn audit:rebase
```

Produces a targeted human-review checklist covering:

- **Package CSS drift** — if the design system packages changed version,
  shows which classes you override had their base CSS rules changed. These
  are the components where your override assumptions may now be wrong.

- **New files from OSS** — new TSX files pulled in by the rebase that
  import from the design system. These are new UI areas that may need
  overrides.

- **Changed files from OSS** — existing MLflow components that changed and
  import from the design system. The DOM structure may have shifted in ways
  that affect selector specificity.

After checking the flagged areas in the browser:
```bash
yarn audit:rebase --update-versions   # records current package versions as verified
git add scripts/css-overrides-verified-versions.txt
```

### Quick checklist

```
[ ] yarn audit:css-overrides      → no new failures
[ ] yarn audit:rebase             → reviewed all flagged areas in browser
[ ] yarn audit:rebase --update-versions + commit versions file
```

---

## Audit tool reference

| Script | Location | When to run |
|---|---|---|
| `yarn audit:css-overrides` | CI + local | Every PR (runs in CI automatically) |
| `yarn audit:css-overrides:update` | Local only | After deferring a known dead selector |
| `yarn audit:rebase` | Local only | After every rebase from OSS mlflow/mlflow |
| `yarn audit:rebase --update-versions` | Local only | After visually verifying the rebase |
