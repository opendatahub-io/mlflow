import { afterEach, describe, expect, test } from '@jest/globals';
import { setActiveWorkspace } from '@mlflow/mlflow/src/workspaces/utils/WorkspaceUtils';
import {
  buildV4ViewQuery,
  captureV4ViewState,
  getTraceV4SavedViewShareUrl,
  TRACE_V4_SHARE_URL_PARAM_KEY,
} from './tracesV4SavedViewState';

// ODH: share links and applied views keep the workspace and use the router's href format, so they work
// with the federated basename and the standalone hash router.
const params = (query: string) => new URLSearchParams(query);

describe('getTraceV4SavedViewShareUrl (ODH)', () => {
  test('uses the router-aware href builder when given one (federated basename / hash router)', () => {
    const state = captureV4ViewState(params('q=refund'), ['start_time']);
    const url = getTraceV4SavedViewShareUrl('exp-42', state, 'view-9', (path) => `https://host/base${path}`);
    expect(url).toBe(`https://host/base/experiments/exp-42/traces?q=refund&${TRACE_V4_SHARE_URL_PARAM_KEY}=view-9`);
  });
});

describe('buildV4ViewQuery workspace (ODH)', () => {
  afterEach(() => {
    setActiveWorkspace(null);
  });

  test('keeps the active workspace so applying or sharing a view stays in it', () => {
    setActiveWorkspace('team-a');
    const state = captureV4ViewState(params('q=refund&workspace=team-a'), ['start_time']);
    const out = params(buildV4ViewQuery(state, 'view-1'));
    expect(out.get('workspace')).toBe('team-a');
    expect(out.get('q')).toBe('refund');
    // The workspace is URL context, not view state.
    expect(state.single).not.toHaveProperty('workspace');
  });
});
