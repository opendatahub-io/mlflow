import React, { useCallback, useEffect, useMemo } from 'react';
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

  const isRestrictedCompareRunsLink = useCallback((link: HTMLAnchorElement) => {
    const href = link.getAttribute('href') ?? '';
    if (!href || href.startsWith('#')) return false;
    try {
      const url = new URL(href, window.location.origin);
      return !(url.origin === window.location.origin && url.pathname.includes('/compare-runs'));
    } catch {
      return true;
    }
  }, []);

  useEmbeddedLinkInterceptor({
    enabled: runUuids.length > 0,
    isRestrictedLink: isRestrictedCompareRunsLink,
    shouldNavigateInPlace: disableNavigationInPlace,
  });

  useEffect(() => {
    if (runUuids.length === 0) return;

    experimentIds.forEach((experimentId) => {
      (dispatch as any)(getExperimentApi(experimentId)).catch(() => {});
    });
    runUuids.forEach((runUuid) => {
      (dispatch as any)(getRunApi(runUuid)).catch(() => {});
    });
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
