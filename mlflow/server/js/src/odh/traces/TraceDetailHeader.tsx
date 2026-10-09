import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClockIcon, Notification, useDesignSystemTheme } from '@databricks/design-system';
import { FormattedMessage } from 'react-intl';
import type { ModelTrace } from '../../shared/web-shared/model-trace-explorer/ModelTrace.types';
import {
  createTraceV4LongIdentifier,
  doesTraceSupportV4API,
  isV3ModelTraceInfo,
  parseModelTraceToTree,
} from '../../shared/web-shared/model-trace-explorer/ModelTraceExplorer.utils';
import { ModelTraceHeaderMetricSection } from '../../shared/web-shared/model-trace-explorer/ModelTraceExplorerMetricSection';
import { ModelTraceHeaderStatusTag } from '../../shared/web-shared/model-trace-explorer/ModelTraceHeaderStatusTag';
import { truncateToFirstLineWithMaxLength } from '../../shared/web-shared/model-trace-explorer/TagUtils';
import { spanTimeFormatter } from '../../shared/web-shared/model-trace-explorer/timeline-tree/TimelineTree.utils';

const NOTIFICATION_COMPONENT_ID = 'mlflow.odh.trace_detail_header.notification';
const NOTIFICATION_DURATION_MS = 2000;

const getTruncatedLabel = (label: string) => truncateToFirstLineWithMaxLength(label, 40);

// `execution_duration` is a protobuf Duration serialized as seconds, e.g. "0.27s" or "5s".
const parseDurationToMicros = (duration: string | undefined): number | undefined => {
  const match = duration?.match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Number(match[1]) * 1e6 : undefined;
};

/**
 * Trace latency in microseconds. Mirrors the legacy explorer header, which measures the root span
 * (microsecond precision) instead of the trace info duration (millisecond precision, so fast traces
 * read as 0). Falls back to the trace info when the trace has no single root span yet.
 */
export const getTraceLatencyMicros = (trace: ModelTrace): number | undefined => {
  const rootNode = parseModelTraceToTree(trace);
  if (rootNode) {
    return rootNode.end - rootNode.start;
  }
  const { info } = trace;
  if (isV3ModelTraceInfo(info)) {
    return parseDurationToMicros(info.execution_duration);
  }
  return typeof info.execution_time_ms === 'number' ? info.execution_time_ms * 1e3 : undefined;
};

export const formatTraceLatency = (latencyMicros: number | undefined): string | undefined =>
  latencyMicros !== undefined && Number.isFinite(latencyMicros) && latencyMicros >= 0
    ? spanTimeFormatter(latencyMicros)
    : undefined;

/**
 * Trace-level summary (status, ID, latency) shown above the v2 explorer in the federated trace
 * detail panel. Upstream's `ModelTraceHeaderDetails` needs the explorer's view-state context, so this
 * composes the same presentational pieces from the loaded trace instead.
 */
export const TraceDetailHeader = ({ trace }: { trace: ModelTrace }) => {
  const { theme } = useDesignSystemTheme();
  const [copyResult, setCopyResult] = useState<'success' | 'error' | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const { info } = trace;

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const [traceId, traceIdToDisplay] = useMemo(() => {
    if (isV3ModelTraceInfo(info)) {
      return doesTraceSupportV4API(info) ? [createTraceV4LongIdentifier(info), info.trace_id] : [info.trace_id];
    }
    return [info.request_id ?? ''];
  }, [info]);

  const latency = useMemo(() => formatTraceLatency(getTraceLatencyMicros(trace)), [trace]);
  const statusState = isV3ModelTraceInfo(info) ? info.state : undefined;

  const handleCopy = useCallback((success: boolean) => {
    clearTimeout(timeoutRef.current);
    setCopyResult(success ? 'success' : 'error');
    timeoutRef.current = setTimeout(() => setCopyResult(null), NOTIFICATION_DURATION_MS);
  }, []);

  return (
    <div
      data-testid="odh-trace-detail-header"
      css={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: theme.spacing.md,
        rowGap: theme.spacing.sm,
        padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
        borderBottom: `1px solid ${theme.colors.border}`,
      }}
    >
      {statusState && <ModelTraceHeaderStatusTag statusState={statusState} getTruncatedLabel={getTruncatedLabel} />}
      {traceId && (
        <ModelTraceHeaderMetricSection
          label={<FormattedMessage defaultMessage="ID" description="Label for the ID section" />}
          value={traceId}
          displayValue={traceIdToDisplay}
          color="purple"
          getTruncatedLabel={getTruncatedLabel}
          onCopy={handleCopy}
        />
      )}
      {latency && (
        <ModelTraceHeaderMetricSection
          label={<FormattedMessage defaultMessage="Latency" description="Label for the latency section" />}
          icon={<ClockIcon css={{ fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />}
          value={latency}
          getTruncatedLabel={getTruncatedLabel}
          onCopy={handleCopy}
        />
      )}
      {copyResult && (
        <Notification.Provider>
          <Notification.Root
            severity={copyResult === 'success' ? 'success' : 'error'}
            componentId={NOTIFICATION_COMPONENT_ID}
          >
            <Notification.Title>
              {copyResult === 'success' ? (
                <FormattedMessage
                  defaultMessage="Copied to clipboard"
                  description="Success message for the notification"
                />
              ) : (
                <FormattedMessage
                  defaultMessage="Failed to copy to clipboard"
                  description="Error message when clipboard copy fails"
                />
              )}
            </Notification.Title>
          </Notification.Root>
          <Notification.Viewport />
        </Notification.Provider>
      )}
    </div>
  );
};
