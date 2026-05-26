import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Route, useSearchParams } from '../../common/utils/RoutingUtils';
import { useDispatch, useSelector } from 'react-redux';
import { ParagraphSkeleton, TitleSkeleton } from '@databricks/design-system';
import { FormattedMessage } from 'react-intl';
import { getRunApi, getExperimentApi } from '../../experiment-tracking/actions';
import { getExperiment, getRunInfo } from '../../experiment-tracking/reducers/Reducers';
import CompareRunView from '../../experiment-tracking/components/CompareRunView';
import { PageContainer } from '../../common/components/PageContainer';
import { useEmbeddedLinkInterceptor } from '../../common/hooks/useEmbeddedLinkInterceptor';

const disableNavigationInPlace = () => false;

const parseStringArrayParam = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === 'string') ? parsed : [];
  } catch {
    return [];
  }
};

const EmbeddedCompareRunView: React.FC = () => {
  const [searchParams] = useSearchParams();

  const runUuids = useMemo(() => parseStringArrayParam(searchParams.get('runs')), [searchParams]);
  const experimentIds = useMemo(() => parseStringArrayParam(searchParams.get('experiments')), [searchParams]);

  const dispatch = useDispatch();
  const [fetchError, setFetchError] = useState(false);

  const isRestrictedCompareRunsLink = useCallback(
    (_link: HTMLAnchorElement, url: URL) =>
      !(url.origin === window.location.origin && url.pathname.includes('/compare-runs')),
    [],
  );

  useEmbeddedLinkInterceptor({
    enabled: runUuids.length > 0,
    isRestrictedLink: isRestrictedCompareRunsLink,
    shouldNavigateInPlace: disableNavigationInPlace,
  });

  useEffect(() => {
    if (runUuids.length === 0) {
      setFetchError(false);
      return;
    }

    let cancelled = false;
    setFetchError(false);

    const fetchPromises = [
      ...experimentIds.map((experimentId) => (dispatch as any)(getExperimentApi(experimentId))),
      ...runUuids.map((runUuid) => (dispatch as any)(getRunApi(runUuid))),
    ];

    Promise.allSettled(fetchPromises).then((results) => {
      if (cancelled) return;
      if (results.some((result) => result.status === 'rejected')) {
        setFetchError(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [dispatch, experimentIds, runUuids]);

  const allDataLoaded = useSelector(
    (state: any) =>
      runUuids.length > 0 &&
      experimentIds.every((id) => getExperiment(id, state)) &&
      runUuids.every((id) => getRunInfo(id, state)),
  );

  if (runUuids.length === 0) {
    return (
      <PageContainer>
        <FormattedMessage
          defaultMessage="No runs provided for comparison."
          description="Compare runs page > Empty input state"
        />
      </PageContainer>
    );
  }

  if (fetchError) {
    return (
      <PageContainer>
        <FormattedMessage
          defaultMessage="Failed to load runs for comparison."
          description="Compare runs page > Load error state"
        />
      </PageContainer>
    );
  }

  if (!allDataLoaded) {
    return (
      <PageContainer>
        <TitleSkeleton
          loading
          label={
            <FormattedMessage
              defaultMessage="Compare runs page loading"
              description="Compare runs page > Loading state"
            />
          }
        />
        <ParagraphSkeleton seed="s-0" />
      </PageContainer>
    );
  }

  return (
    <div css={{ overflowAnchor: 'none' }}>
      <PageContainer>
        <CompareRunView runUuids={runUuids} experimentIds={experimentIds} />
      </PageContainer>
    </div>
  );
};

export const getCompareRunsRouteElements = () => <Route path="compare-runs" element={<EmbeddedCompareRunView />} />;
