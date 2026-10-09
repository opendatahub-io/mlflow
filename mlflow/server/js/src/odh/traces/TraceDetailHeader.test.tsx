import { jest, describe, test, expect } from '@jest/globals';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  ModelTrace,
  ModelTraceInfoV3,
  ModelTraceSpanV3,
} from '../../shared/web-shared/model-trace-explorer/ModelTrace.types';
import { copyToClipboard } from '../../common/utils/copyToClipboard';
import { renderWithDesignSystem } from '../../common/utils/TestUtils.react18';
import { TraceDetailHeader, formatTraceLatency, getTraceLatencyMicros } from './TraceDetailHeader';

jest.mock('../../common/utils/copyToClipboard', () => ({
  copyToClipboard: jest.fn(() => Promise.resolve(true)),
}));

const makeSpan = (spanId: string, parentSpanId: string, startNs: number, endNs: number): ModelTraceSpanV3 => ({
  trace_id: 'dHJhY2U=',
  span_id: spanId,
  trace_state: '',
  parent_span_id: parentSpanId,
  name: spanId,
  start_time_unix_nano: String(startNs),
  end_time_unix_nano: String(endNs),
  attributes: {},
  status: { message: '', code: 'STATUS_CODE_OK' },
});

const makeInfo = (overrides: Partial<ModelTraceInfoV3> = {}): ModelTraceInfoV3 => ({
  trace_id: 'tr-62884f884ed990295b410520ef32c57e',
  trace_location: { type: 'MLFLOW_EXPERIMENT', mlflow_experiment: { experiment_id: '4' } },
  request_time: '2026-01-01T00:00:00Z',
  execution_duration: '0s',
  state: 'OK',
  trace_metadata: {},
  tags: {},
  ...overrides,
});

const makeTrace = (spans: ModelTraceSpanV3[], info: Partial<ModelTraceInfoV3> = {}): ModelTrace => ({
  info: makeInfo(info),
  data: { spans },
});

// Root span starts at an arbitrary epoch offset so the test exercises the relative computation.
const T0 = 1_000_000_000;
const traceWithRootDurationNs = (durationNs: number, info?: Partial<ModelTraceInfoV3>) =>
  makeTrace([makeSpan('root', '', T0, T0 + durationNs)], info);

describe('getTraceLatencyMicros', () => {
  test('measures the root span rather than the millisecond-rounded trace duration', () => {
    const trace = makeTrace([makeSpan('root', '', T0, T0 + 270_000), makeSpan('child', 'root', T0, T0 + 100_000)]);
    expect(getTraceLatencyMicros(trace)).toBeCloseTo(270, 0);
  });

  test('falls back to the trace info duration when there is no single root span', () => {
    expect(getTraceLatencyMicros(makeTrace([], { execution_duration: '1.5s' }))).toBe(1_500_000);
    expect(getTraceLatencyMicros(makeTrace([], { execution_duration: undefined }))).toBeUndefined();
    expect(getTraceLatencyMicros(makeTrace([], { execution_duration: 'garbage' }))).toBeUndefined();
  });

  test('falls back to the trace info duration for an in-progress trace with several top-level spans', () => {
    const trace = makeTrace([makeSpan('a', '', T0, T0 + 270_000), makeSpan('b', '', T0, T0 + 500_000)], {
      execution_duration: '2s',
    });
    expect(getTraceLatencyMicros(trace)).toBe(2_000_000);
  });

  test('falls back to execution_time_ms for V2 trace info', () => {
    const trace = {
      info: { request_id: 'tr-v2', execution_time_ms: 42 },
      data: { spans: [] },
    } as unknown as ModelTrace;
    expect(getTraceLatencyMicros(trace)).toBe(42_000);
  });
});

describe('formatTraceLatency', () => {
  test.each([
    [270, '0.27ms'],
    [4, '0.00ms'],
    [52_000, '52.00ms'],
    [100_000, '0.10s'],
    [2_500_000, '2.50s'],
    [90_000_000, '1.50m'],
    [0, '0s'],
  ])('formats %d microseconds as %s', (micros, expected) => {
    expect(formatTraceLatency(micros)).toBe(expected);
  });

  test.each([undefined, Number.NaN, -1])('returns nothing for %s', (micros) => {
    expect(formatTraceLatency(micros)).toBeUndefined();
  });
});

describe('TraceDetailHeader', () => {
  test('shows status, trace ID and latency', () => {
    renderWithDesignSystem(<TraceDetailHeader trace={traceWithRootDurationNs(270_000)} />);

    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('tr-62884f884ed990295b410520ef32c57e')).toBeInTheDocument();
    expect(screen.getByText('Latency')).toBeInTheDocument();
    expect(screen.getByText('0.27ms')).toBeInTheDocument();
  });

  test('shows the error status and multi-second latency', () => {
    renderWithDesignSystem(
      <TraceDetailHeader trace={traceWithRootDurationNs(3_210_000_000, { state: 'ERROR', trace_id: 'tr-err' })} />,
    );

    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('tr-err')).toBeInTheDocument();
    expect(screen.getByText('3.21s')).toBeInTheDocument();
  });

  test('omits status and latency when the trace does not provide them', () => {
    renderWithDesignSystem(
      <TraceDetailHeader trace={makeTrace([], { state: 'STATE_UNSPECIFIED', execution_duration: undefined })} />,
    );

    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
    expect(screen.queryByText('Latency')).not.toBeInTheDocument();
  });

  test('copies the trace ID and confirms it', async () => {
    renderWithDesignSystem(<TraceDetailHeader trace={traceWithRootDurationNs(270_000)} />);

    await userEvent.click(screen.getByText('tr-62884f884ed990295b410520ef32c57e'));

    expect(jest.mocked(copyToClipboard)).toHaveBeenCalledWith('tr-62884f884ed990295b410520ef32c57e');
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument();
  });

  test('reports a failed copy', async () => {
    jest.mocked(copyToClipboard).mockResolvedValueOnce(false);
    renderWithDesignSystem(<TraceDetailHeader trace={traceWithRootDurationNs(270_000)} />);

    await userEvent.click(screen.getByText('tr-62884f884ed990295b410520ef32c57e'));

    expect(await screen.findByText('Failed to copy to clipboard')).toBeInTheDocument();
  });
});
