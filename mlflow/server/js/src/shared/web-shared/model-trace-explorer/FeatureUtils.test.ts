import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { getFeatureEnabledSync } from '@mlflow/mlflow/src/experiment-tracking/hooks/useServerInfo';
import { isEvaluatingTracesInDetailsViewEnabled } from './FeatureUtils';

jest.mock('@mlflow/mlflow/src/experiment-tracking/hooks/useServerInfo', () => ({
  ...jest.requireActual<typeof import('@mlflow/mlflow/src/experiment-tracking/hooks/useServerInfo')>(
    '@mlflow/mlflow/src/experiment-tracking/hooks/useServerInfo',
  ),
  getFeatureEnabledSync: jest.fn(),
}));

const { getFeatureEnabledSync: actualGetFeatureEnabledSync } = jest.requireActual<
  typeof import('@mlflow/mlflow/src/experiment-tracking/hooks/useServerInfo')
>('@mlflow/mlflow/src/experiment-tracking/hooks/useServerInfo');

describe('isEvaluatingTracesInDetailsViewEnabled', () => {
  afterEach(() => {
    jest.mocked(getFeatureEnabledSync).mockReset();
  });

  it('is enabled when server-info enables the AI Gateway', () => {
    jest.mocked(getFeatureEnabledSync).mockReturnValue(true);
    expect(isEvaluatingTracesInDetailsViewEnabled()).toBe(true);
    expect(getFeatureEnabledSync).toHaveBeenCalledWith('gateway');
  });

  it('is disabled when server-info disables the AI Gateway', () => {
    jest.mocked(getFeatureEnabledSync).mockReturnValue(false);
    expect(isEvaluatingTracesInDetailsViewEnabled()).toBe(false);
  });

  it('is disabled while server-info has not loaded', () => {
    jest.mocked(getFeatureEnabledSync).mockImplementation(actualGetFeatureEnabledSync);
    expect(isEvaluatingTracesInDetailsViewEnabled()).toBe(false);
  });
});
