/* eslint-disable no-undef */
// ODH: `useFeatureEnabled` / `getFeatureEnabledSync` default to `false` so gateway UI stays hidden until
// server-info reports it. Upstream tests render gateway UI without server-info and expect upstream's
// `true` default, so restore it here for every test.
//
// This mock hides the production default, so ODH-owned tests `jest.unmock` it and drive server-info over
// msw instead. Each covers server-info pending, `gateway: false`, no `features_enabled` or a failed
// request, and `gateway: true`:
// - src/odh/gateway/gatewayDefaults.test.tsx: `useFeatureEnabled`, `getFeatureEnabledSync`, the run-judge
//   gate (`isEvaluatingTracesInDetailsViewEnabled`), and the `EvalRunsEmptyStateCard` CTA
// - src/odh/gateway/GatewayFeatureRoute.test.tsx: the Playground route guard
// - src/experiment-tracking/pages/experiment-scorers/ExperimentScorersPage.test.tsx: the Judges page
// - src/odh/wrappers/MlflowWrapperBase.test.tsx: the federated wrapper's wait for server-info
// Add a case there when gating another surface on the server gateway flag.
jest.mock('../experiment-tracking/hooks/useServerInfo', () => {
  const actual = jest.requireActual('../experiment-tracking/hooks/useServerInfo');
  return {
    ...actual,
    useFeatureEnabled: (key, defaultValue = true) => actual.useFeatureEnabled(key, defaultValue),
    getFeatureEnabledSync: (key, defaultValue = true) => actual.getFeatureEnabledSync(key, defaultValue),
  };
});
