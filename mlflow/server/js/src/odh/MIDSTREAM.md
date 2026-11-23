# ODH Midstream Frontend Guide

This repository is `opendatahub-io/mlflow`, the Open Data Hub (ODH) midstream fork of
[mlflow/mlflow](https://github.com/mlflow/mlflow). It is rebased onto each upstream release
(see `FORK_HISTORY.md` at the repo root and the `rebase-mlflow` skill). The UI ships in two modes
from one codebase:

| Mode           | Build                                         | Entry point                                      | Used by                                           |
| -------------- | --------------------------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| **Standalone** | CRACO: `yarn start` / `yarn build`            | `src/app.tsx` → `MlflowRouter` (HashRouter)      | The MLflow server UI itself                       |
| **Federated**  | `yarn start:federated` / `yarn build:federated` (`config/webpack.federated.js`) | `src/odh/**/Mlflow*Wrapper.tsx` (no `app.tsx`) | [odh-dashboard](https://github.com/opendatahub-io/odh-dashboard) via Module Federation |

In ODH the federated pages render inside a PatternFly 6 (PF) host, so the Du Bois
(`@databricks/design-system`) look is restyled to PF by `src/common/styles/patternfly/`.

Where this guide conflicts with the upstream guidance in `mlflow/server/js/CLAUDE.md`, this guide wins.

## Golden rule: keep the upstream diff small

Every line changed in an upstream-owned file has to be carried and conflict-resolved on every rebase.
Before writing code, pick the location from this table:

| Need                                                         | Put it in                                                                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New ODH-only UI, wrappers, routes, breadcrumbs, assets       | `src/odh/` (ODH-owned, no rebase conflicts)                                                                                                                        |
| Making a Du Bois component look like PF (color, spacing, borders, icons, layout of a stable class) | `src/common/styles/patternfly/` (SCSS partial or token map). Not in the component.                                                                                 |
| Different behavior only when embedded in the dashboard       | A minimal inline guard in the upstream component using `useIsIntegrated()` (function components) or `isIntegrated()` (class components / module scope) from `src/common/utils/embedUtils.ts` |
| A feature ODH does not ship (AI Gateway, Assistant, Judges…) | Gate it with the existing flags in `src/common/utils/FeatureUtils.ts` (`shouldEnableAIGateway()`, `isAssistantEnabled()`, `enableScorersUI()`). Never delete the upstream code. |
| Host-provided UI inside an MLflow page                       | A React context that the wrapper provides and the page reads with a safe default, like `src/mcp-registry/contexts/MCPRegistryIntegrationContext.tsx` (`renderDetailActions`) |
| Segment analytics                                            | Helpers in `src/odh/analytics/` (fire only when integrated and `window.analytics` exists); add event names in `trackingProperties.ts`                             |
| A bug that also exists upstream                              | Fix it upstream. If it is blocking, add a temporary PF override with a comment linking the upstream issue (`https://github.com/mlflow/mlflow/issues/<n>`) and land it as a `drop:` commit. |

To tell whether a file is ODH-owned, check whether it exists at the upstream base tag (the latest
"Upstream tag" in `FORK_HISTORY.md`): `git cat-file -e v<base>:<path>` fails for ODH-only files.
`git diff --name-status v<base> HEAD -- mlflow/server/js` lists every carried change (fetch the tag from the
`mlflow/mlflow` remote if it is missing).

### Rules for inline edits to upstream files

- Keep the standalone code path byte-for-byte equivalent in behavior; add the embedded branch next to it
  (e.g. `{!isEmbedded && <div css={{ height: 500 }} />}`), do not rewrite the upstream logic.
- Do not rename, move, or reformat upstream code you are not changing. Add ODH imports as new lines (e.g.
  after the last upstream import) rather than editing upstream import lines, so rebase conflicts stay small.
- Prefer one-line guards over new props threaded through many upstream components.
- Add a `data-testid` when a test must target the ODH-only branch, and test both modes (wrap in
  `ModularArchContextProvider` with `DeploymentMode.Federated` for the embedded case; `useIsIntegrated()`
  returns `false` when there is no provider).
- If you edit user-facing strings, run `yarn i18n` so `src/lang/default/en.json` stays in sync.

## Module Federation contract

Remote name `mlflowEmbedded`, `remoteEntry.js` served at `/mlflow/static-files/federated/`. Exposed modules
(`config/moduleFederation.js`):

| Exposed module             | Router                                               | Props                                                            | Host consumer in odh-dashboard                               |
| -------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `MlflowExperimentWrapper`  | BrowserRouter, basename `/develop-train/mlflow/experiments` | `basename?`, `onBreadcrumbChange?`, `workflowType?`, `onUnsupportedTab?` | `packages/mlflow-embedded/experiments/`                      |
| `MlflowPromptsWrapper`     | BrowserRouter, basename `/gen-ai-studio/prompts`     | `basename?`, `onBreadcrumbChange?`                               | `packages/mlflow-embedded/prompts/`                          |
| `MlflowMcpRegistryWrapper` | BrowserRouter, basename `/ai-hub/mcp-servers/registry` | `basename?`, `onBreadcrumbChange?`, `renderDetailActions?`       | `packages/mlflow-embedded/mcp-registry/`                     |
| `MlflowRunTabsWrapper`     | MemoryRouter (no URL changes)                        | `experimentId`, `runUuid`, `workspace?`, `onTabChange?`          | `packages/eval-hub/frontend/.../EvaluationResultsPage.tsx`   |
| `MlflowCompareRunsWrapper` | MemoryRouter                                         | `experimentIds`, `runUuids`, `workspace?`                        | `packages/eval-hub/frontend/.../MlflowCompareRuns.tsx`       |
| `MlflowTraceDetailWrapper` | MemoryRouter                                         | `traceId`, `workspace?`                                          | `packages/gen-ai/frontend/.../Chatbot/components/TracePanel.tsx` |

- **Props are a cross-repo API.** The host re-declares these prop types locally and loads modules by string
  name with `loadRemote('mlflowEmbedded/<Name>')`; there is no shared type package. Renaming/removing an
  exposed module or a prop, or making a prop required, silently breaks the dashboard. Only add optional
  props, and call out any contract change so a matching odh-dashboard PR can be made.
- **`app.tsx` is not in the federated bundle.** `src/odh/wrappers/MlflowWrapperBase.tsx` re-creates every
  provider (ModularArch, Apollo, Intl, Redux, Design System, Emotion PF theme, React Query, ServerInfo,
  DarkTheme, host-aware WorkflowType, error boundary) and imports the global CSS. A provider or global stylesheet
  added to `app.tsx`/`MlflowRouter.tsx` must also be added to `MlflowWrapperBase`, or the page breaks only
  in the dashboard.
- **Workflow type.** When the host passes `workflowType`, `HostWorkflowTypeProvider`
  (`src/odh/contexts/ForcedWorkflowTypeProvider.tsx`) locks `useWorkflowType()` to it, ignoring the URL and
  localStorage, and `UnsupportedTabGuard` reports tabs the host serves elsewhere via `onUnsupportedTab`
  (or falls back to Runs). Do not add UI that lets the user switch workflow type while it is locked.
- **Routing.** `react-router` is not shared (MLflow uses v6, the host v7). Federated routes are declared
  separately with relative paths in `src/odh/*/…Routes.tsx`; a page added to upstream `route-defs.ts` is
  not reachable in the dashboard until it is added there too. In federated mode `createMLflowRoutePath()`
  strips the `/experiments` and `/mcp-registry` prefixes because the basename already contains them.
- **Links.** Always use `Link`/`NavLink`/`useNavigate` from `src/common/utils/RoutingUtils.tsx`, never
  `react-router-dom` directly. In federated mode links to `/models`, `/explore/`, `/jobs` render as plain
  text, and `useEmbeddedLinkInterceptor` + `_federated-link-guards.scss` block model registry, jobs, and
  `mlflow.org` links and turn same-origin `target="_blank"` links into in-place navigation. New links to
  pages the dashboard does not embed need the same treatment.
- **API calls.** Every request URL must go through `getAjaxUrl()`/`prefixApiUrl()` (prefixes `/mlflow`,
  which the dashboard proxies to the MLflow service). A raw `fetch('/ajax-api/...')` works standalone and
  404s in the dashboard. `src/shared/web-shared/**` has its own `FetchUtils`/`RoutingUtils` copies that are
  patched the same way.
- **Workspaces.** The dashboard project is the MLflow workspace. It arrives as `?workspace=` (page
  wrappers) or the `workspace` prop (MemoryRouter wrappers) and is sent as `X-MLFLOW-WORKSPACE` via
  `setActiveWorkspace()`. The host remounts wrappers with `key={workspace}`; do not cache data across
  workspaces at module scope.
- **Portals.** Modals, dropdowns, and popovers render into a body-level `div.pf-shell-root
  [data-mlflow-federated-portal-container]`. Use the Design System `getPopupContainer`; a custom
  `createPortal(…, document.body)` escapes the PF overrides and the dark-mode class.
- **Dark mode** follows the host: `DarkModeUtils.ts` listens for the `odh-theme-change` event and
  `useMLflowDarkTheme` toggles both the Du Bois `dark-mode` class and PF `pf-v6-theme-dark`.
- **Build-time flags.** `webpack.federated.js` hard-codes `DEPLOYMENT_MODE=federated`,
  `MLFLOW_API_BASE_URL=/mlflow`, `MLFLOW_ENABLE_ASSISTANT=false`, `MLFLOW_ENABLE_AI_GATEWAY=false`.
  `craco.config.js` defaults to `standalone`, no API prefix, and Assistant/Gateway **on**, but
  `Dockerfile.konflux` sets both to `false` for the product build. So a local `yarn start` shows
  Gateway/Assistant/Judges UI that the shipped product hides; test with the flags off, and do not surface
  entry points to those features without the gate.

## PatternFly override layer (`src/common/styles/patternfly/`)

Read `src/common/styles/patternfly/README.md` first. Summary:

```
@patternfly/react-tokens + mod-arch-kubeflow pf-tokens-SSOT.json
  → patternflyStyles/*.ts            (PF values per Du Bois token: colors, spacing, typography, borders, shadows…)
  → patternflyTokenTranslation.ts   (PATTERN_FLY_TOKEN_TRANSLATION, merged over the Du Bois Emotion theme)
  → pf-shell-overrides.scss         (@use list of partials in pf-shell-overrides/, restyles du-bois-* classes)
```

Both entry points apply it: `DesignSystemContainer.tsx` (standalone) and `MlflowWrapperBase.tsx`
(federated). So the PF look is visible in `yarn start` as well as in the dashboard.

- **Two levers.** If a component reads `theme.colors.*`/`theme.spacing.*`, fix the mapping in
  `patternflyStyles/`. If it is a Du Bois/antd class, add a rule in the matching partial:
  `_scope-and-base-controls` (resets, buttons, alerts, inputs, segmented controls),
  `_layout-navigation-and-tables`, `_modals-and-popovers`, `_dropdowns-selects-and-comboboxes`,
  `_trees-checkboxes-code-and-dark-mode`, `_spinners`, `_federated-link-guards`; shared mixins live in
  `_icons` (PF mask icons) and `_action-groups`.
- Scope every rule under `.pf-shell-root` (portals carry that class too). Target both
  `du-bois-light-*` and `du-bois-dark-*` variants. Use PF CSS variables (`var(--pf-t--global--…)`); never
  hard-code colors, sizes, or spacing.
- Keep the `@use` order in `pf-shell-overrides.scss`; later partials rely on source order.
- An override applies to every matching element on every page in both modes. Check other pages that
  render the same component before calling it done.
- Prefer the override over an inline change. Edit the upstream component only when the fix needs props,
  state, or theme context, or the element has no stable selector (e.g. layout on an unstyled `div`), and
  say why in the PR.
- When an override causes a side effect, constrain it with a companion rule in the same partial instead of
  deleting the override.
- New UI should still use `@databricks/design-system` components and `theme.*` tokens as upstream does.
  No file under `src/` imports `@patternfly/react-core` today; get the PF look through the override layer,
  not by swapping in PF components.
- After changing selectors, run `yarn audit:css-overrides` (verifies every referenced class still exists in
  the installed design system). This audit is not wired into CI, so run it locally.

## Verifying a midstream change

In addition to the upstream checks (`yarn lint`, `yarn prettier:check`, `yarn i18n:check`, `yarn type-check`,
`yarn test <pattern>`):

- `yarn build:federated` when touching `config/`, `src/odh/`, `MlflowWrapperBase`, or anything only the
  federated bundle imports.
- Look at the change in **both** modes. Standalone: `uv run dev/run_dev_server.py` from the repo root.
  Federated in the real dashboard: follow `src/odh/README.md` (`yarn start:federated` on port 9300 plus
  odh-dashboard dev). If you cannot run the dashboard, say so rather than assuming the embedded view works.
- For a visual bug, first check whether it reproduces in upstream MLflow. If not, the cause is usually an
  override in `src/common/styles/patternfly/`.
- Playwright E2E lives in `e2e/` (`yarn test:e2e`, needs a running server; `MLFLOW_E2E_BASE_URL`). CI runs it
  against the Konflux PR image once a maintainer adds the `ok-to-test` label.
- Format Markdown/JS with the pinned Prettier v2 (`uv run pre-commit run prettier --files <file>`), not
  `npx prettier` (v3 formats differently).

## Reviewing a midstream PR

Check, in addition to normal review:

1. Is each change in the right layer (table above)? Flag upstream-file edits that could be an override, an
   `src/odh/` file, or a feature-flag gate.
2. Does standalone behavior stay unchanged when `useIsIntegrated()` is false?
3. Does a change to an exposed wrapper, its props, basenames, or `config/moduleFederation.js` need a
   matching odh-dashboard change?
4. Do new requests use `getAjaxUrl`/`prefixApiUrl` and keep the workspace header? Do new links use
   `RoutingUtils` and avoid un-embedded routes (`/models`, `/jobs`, `/explore/`, `mlflow.org`)?
5. Is a provider/CSS added to `app.tsx` also in `MlflowWrapperBase`? Is a new page added to
   `src/odh/*/…Routes.tsx` if it should be reachable in the dashboard?
6. SCSS: scoped to `.pf-shell-root`, PF tokens only, both light/dark class variants, no global bleed into the
   host, `yarn audit:css-overrides` clean.
7. Is a fix for an upstream bug carried here without an upstream issue link?

## Commit conventions

Commit subjects carry a prefix that tells the next rebase what to do with them:

- `keep:` permanent ODH change, carried forward on every rebase (most UI work).
- `drop:` temporary workaround or upstream cherry-pick; removed once the base includes it.
- `backport:` cherry-pick of an upstream commit not yet in the base.

Include the Jira key when there is one (e.g. `keep: RHOAIENG-81946: Hide empty spacer div in embedded mode`)
and sign off with `git commit -s`.
