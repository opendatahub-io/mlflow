import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ModelTrace } from '../../shared/web-shared/model-trace-explorer/ModelTrace.types';
import { useGetTracesById } from '../../shared/web-shared/model-trace-explorer/hooks/useGetTracesById';
import { getActiveWorkspace } from '../../workspaces/utils/WorkspaceUtils';
import MlflowTraceDetailWrapper from './MlflowTraceDetailWrapper';

jest.mock('../wrappers/federatedGlobalStyles', () => ({}));

// The real provider lists namespaces from the dashboard BFF on mount.
jest.mock('mod-arch-core', () => ({
  ...jest.requireActual<typeof import('mod-arch-core')>('mod-arch-core'),
  ModularArchContextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../i18n/I18nUtils', () => ({
  useI18nInit: () =>
    jest.requireActual<typeof import('react-intl')>('react-intl').createIntl({ locale: 'en', messages: {} }),
}));

jest.mock('../../experiment-tracking/hooks/useServerInfo', () => ({
  ...jest.requireActual<typeof import('../../experiment-tracking/hooks/useServerInfo')>(
    '../../experiment-tracking/hooks/useServerInfo',
  ),
  ServerInfoProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../shared/web-shared/model-trace-explorer/hooks/useGetTracesById', () => ({
  useGetTracesById: jest.fn(),
}));

// Stand-in for the redesigned explorer; it also proves the wrapper supplies the v2 preferences provider,
// whose context default is a no-op setter.
jest.mock('../../shared/web-shared/model-trace-explorer/ModelTraceExplorerEntrypoint', () => ({
  ModelTraceExplorer: ({ modelTrace }: { modelTrace: ModelTrace }) => {
    const { useModelTraceExplorerPreferences } = jest.requireActual<
      typeof import('../../shared/web-shared/model-trace-explorer/v2/ModelTraceExplorerPreferencesContext')
    >('../../shared/web-shared/model-trace-explorer/v2/ModelTraceExplorerPreferencesContext');
    const { renderMode, setRenderMode } = useModelTraceExplorerPreferences();
    return (
      <div data-testid="trace-explorer-entrypoint">
        <span>{(modelTrace.info as { trace_id: string }).trace_id}</span>
        <span>{`render mode: ${renderMode}`}</span>
        <button onClick={() => setRenderMode('json')}>switch to json</button>
      </div>
    );
  },
}));

jest.mock('../../shared/web-shared/model-trace-explorer/ModelTraceExplorerSkeleton', () => ({
  ModelTraceExplorerSkeleton: () => <div data-testid="trace-explorer-skeleton" />,
}));

jest.mock('../../shared/web-shared/model-trace-explorer/ModelTraceExplorer', () => ({
  ModelTraceExplorer: () => <div data-testid="legacy-trace-explorer" />,
}));

const mockTrace = {
  info: {
    trace_id: 'tr-abc',
    trace_location: { type: 'MLFLOW_EXPERIMENT', mlflow_experiment: { experiment_id: '1' } },
    request_time: '2026-01-01T00:00:00Z',
    execution_duration: '0s',
    state: 'OK',
    tags: {},
  },
  data: {
    spans: [
      {
        trace_id: 'dHJhY2U=',
        span_id: 'root',
        trace_state: '',
        parent_span_id: '',
        name: 'predict',
        start_time_unix_nano: '1000000000',
        end_time_unix_nano: '1000270000',
        attributes: {},
        status: { message: '', code: 'STATUS_CODE_OK' },
      },
    ],
  },
} as unknown as ModelTrace;

const mockUseGetTracesById = jest.mocked(useGetTracesById);
const mockQueryResult = (result: Partial<ReturnType<typeof useGetTracesById>>) =>
  mockUseGetTracesById.mockReturnValue(result as ReturnType<typeof useGetTracesById>);

describe('MlflowTraceDetailWrapper', () => {
  beforeEach(() => {
    mockUseGetTracesById.mockReset();
  });

  test('renders the trace through the explorer entrypoint with working preferences', async () => {
    mockQueryResult({ data: [mockTrace], isLoading: false, isError: false, error: null });

    render(<MlflowTraceDetailWrapper traceId="abc" workspace="team-a" />);

    expect(await screen.findByTestId('trace-explorer-entrypoint')).toBeInTheDocument();
    expect(screen.queryByTestId('legacy-trace-explorer')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('trace-explorer-entrypoint')).getByText('tr-abc')).toBeInTheDocument();
    expect(mockUseGetTracesById).toHaveBeenCalledWith(['tr-abc']);
    expect(getActiveWorkspace()).toBe('team-a');

    const header = screen.getByTestId('odh-trace-detail-header');
    expect(within(header).getByText('Status')).toBeInTheDocument();
    expect(within(header).getByText('OK')).toBeInTheDocument();
    expect(within(header).getByText('ID')).toBeInTheDocument();
    expect(within(header).getByText('tr-abc')).toBeInTheDocument();
    expect(within(header).getByText('Latency')).toBeInTheDocument();
    // From the root span, not the millisecond-rounded execution_duration ("0s").
    expect(within(header).getByText('0.27ms')).toBeInTheDocument();

    // Header and explorer share one flex column so the 100%-height explorer only gets the space
    // left under the header instead of overflowing the host panel by the header's height.
    const layout = screen.getByTestId('odh-trace-detail-layout');
    expect(layout).toContainElement(header);
    expect(layout).toContainElement(screen.getByTestId('trace-explorer-entrypoint'));

    expect(screen.getByText('render mode: default')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'switch to json' }));
    expect(screen.getByText('render mode: json')).toBeInTheDocument();
  });

  test('keeps ids that already carry a trace prefix', async () => {
    mockQueryResult({ data: [mockTrace], isLoading: false, isError: false, error: null });

    render(<MlflowTraceDetailWrapper traceId="tr-abc" />);

    expect(await screen.findByTestId('trace-explorer-entrypoint')).toBeInTheDocument();
    expect(mockUseGetTracesById).toHaveBeenCalledWith(['tr-abc']);
  });

  test('shows an error state when the trace cannot be loaded', async () => {
    mockQueryResult({ data: [], isLoading: false, isError: true, error: new Error('not found') });

    render(<MlflowTraceDetailWrapper traceId="missing" />);

    expect(await screen.findByText(/not found/)).toBeInTheDocument();
    expect(screen.queryByTestId('trace-explorer-entrypoint')).not.toBeInTheDocument();
    expect(screen.queryByTestId('odh-trace-detail-header')).not.toBeInTheDocument();
  });

  test('shows the skeleton without a header while the trace loads', async () => {
    mockQueryResult({ data: [], isLoading: true, isError: false, error: null });

    render(<MlflowTraceDetailWrapper traceId="abc" />);

    expect(await screen.findByTestId('trace-explorer-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('odh-trace-detail-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trace-explorer-entrypoint')).not.toBeInTheDocument();
  });
});
