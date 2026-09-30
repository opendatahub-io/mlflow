import React, { useCallback, useEffect, useMemo } from 'react';
import { Route } from '../../common/utils/RoutingUtils';
import { useParams } from '../../common/utils/RoutingUtils';
import { useDesignSystemTheme, ParagraphSkeleton, TitleSkeleton } from '@databricks/design-system';
import { FormattedMessage } from 'react-intl';
import { RunViewModeSwitch } from '../../experiment-tracking/components/run-page/RunViewModeSwitch';
import { useRunViewActiveTab } from '../../experiment-tracking/components/run-page/useRunViewActiveTab';
import { useRunDetailsPageData } from '../../experiment-tracking/components/run-page/hooks/useRunDetailsPageData';
import { RunPageTabName } from '../../experiment-tracking/constants';
import { RunViewOverview } from '../../experiment-tracking/components/run-page/RunViewOverview';
import { RunViewMetricCharts } from '../../experiment-tracking/components/run-page/RunViewMetricCharts';
import { RunViewArtifactTab } from '../../experiment-tracking/components/run-page/RunViewArtifactTab';
import { RunViewEvaluationsTab } from '../../experiment-tracking/components/evaluations/RunViewEvaluationsTab';
import Utils from '../../common/utils/Utils';
import { isSystemMetricKey } from '../../experiment-tracking/utils/MetricsUtils';
import { PageContainer } from '../../common/components/PageContainer';
import { useEmbeddedLinkInterceptor } from '../../common/hooks/useEmbeddedLinkInterceptor';

const TabChangeListener: React.FC<{ onTabChange?: (tabName: string) => void }> = ({ onTabChange }) => {
  const activeTab = useRunViewActiveTab();
  useEffect(() => {
    onTabChange?.(activeTab);
  }, [activeTab, onTabChange]);
  return null;
};

const disableNavigationInPlace = () => false;

const EmbeddedRunView: React.FC<{ onTabChange?: (tabName: string) => void }> = ({ onTabChange }) => {
  const { runUuid, experimentId } = useParams<{ runUuid: string; experimentId: string }>();
  const { theme } = useDesignSystemTheme();
  const activeTab = useRunViewActiveTab();
  const runPathSegment = useMemo(() => `/${experimentId ?? ''}/runs/${runUuid ?? ''}`, [experimentId, runUuid]);
  const isRestrictedRunTabsLink = useCallback(
    (link: HTMLAnchorElement) => {
      const href = link.getAttribute('href') ?? '';
      return !href.startsWith('#') && !href.includes(runPathSegment);
    },
    [runPathSegment],
  );

  useEmbeddedLinkInterceptor({
    enabled: Boolean(experimentId && runUuid),
    isRestrictedLink: isRestrictedRunTabsLink,
    shouldNavigateInPlace: disableNavigationInPlace,
  });

  const safeRunUuid = runUuid as string;
  const safeExperimentId = experimentId as string;

  const { experiment, latestMetrics, loading, params, refetchRun, runInfo, tags, runInputs, runOutputs } =
    useRunDetailsPageData({ experimentId: safeExperimentId, runUuid: safeRunUuid });

  const [modelMetricKeys, systemMetricKeys] = useMemo<[string[], string[]]>(() => {
    if (!latestMetrics) return [[], []];
    return [
      Object.keys(latestMetrics).filter((k) => !isSystemMetricKey(k)),
      Object.keys(latestMetrics).filter((k) => isSystemMetricKey(k)),
    ];
  }, [latestMetrics]);

  const initialLoading = loading && (!runInfo || !experiment);

  if (initialLoading || !runInfo || !experiment) {
    return (
      <PageContainer>
        <TitleSkeleton
          loading
          label={<FormattedMessage defaultMessage="Run page loading" description="Run page > Loading state" />}
        />
        <ParagraphSkeleton seed="s-0" />
      </PageContainer>
    );
  }

  const renderActiveTab = () => {
    const renderEvaluationTab = () => (
      <RunViewEvaluationsTab
        runUuid={safeRunUuid}
        runTags={tags}
        experiment={experiment}
        experimentId={safeExperimentId}
        runDisplayName={Utils.getRunDisplayName(runInfo, safeRunUuid)}
      />
    );
    switch (activeTab) {
      case RunPageTabName.MODEL_METRIC_CHARTS:
        return (
          <RunViewMetricCharts
            key="model"
            mode="model"
            metricKeys={modelMetricKeys}
            runInfo={runInfo}
            latestMetrics={latestMetrics}
            tags={tags}
            params={params}
          />
        );
      case RunPageTabName.SYSTEM_METRIC_CHARTS:
        return (
          <RunViewMetricCharts
            key="system"
            mode="system"
            metricKeys={systemMetricKeys}
            runInfo={runInfo}
            latestMetrics={latestMetrics}
            tags={tags}
            params={params}
          />
        );
      case RunPageTabName.EVALUATIONS:
        return renderEvaluationTab();
      case RunPageTabName.ARTIFACTS:
        return (
          <RunViewArtifactTab
            runUuid={safeRunUuid}
            runTags={tags}
            runOutputs={runOutputs}
            experimentId={safeExperimentId}
            artifactUri={runInfo.artifactUri ?? undefined}
          />
        );
      case RunPageTabName.TRACES:
        return renderEvaluationTab();
      default:
        return (
          <RunViewOverview
            runInfo={runInfo}
            tags={tags}
            params={params}
            latestMetrics={latestMetrics}
            runUuid={safeRunUuid}
            onRunDataUpdated={refetchRun}
            runInputs={runInputs}
            runOutputs={runOutputs}
            datasets={[]}
            registeredModelVersionSummaries={[]}
            loggedModelsV3={[]}
            isLoadingLoggedModels={false}
          />
        );
    }
  };

  return (
    <div
      css={{
        // Prevent the browser's scroll anchoring from jumping to the top
        // when tab content re-renders and layout dimensions change.
        overflowAnchor: 'none',
      }}
    >
      <TabChangeListener onTabChange={onTabChange} />
      <RunViewModeSwitch runTags={tags} />
      <div css={{ flex: 1, overflow: 'auto', marginTop: theme.spacing.sm, display: 'flex' }}>{renderActiveTab()}</div>
    </div>
  );
};

export const getRunTabsRouteElements = (onTabChange?: (tabName: string) => void) => (
  <Route path=":experimentId/runs/:runUuid/*" element={<EmbeddedRunView onTabChange={onTabChange} />} />
);
