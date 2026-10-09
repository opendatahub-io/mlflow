import { jest, describe, test, expect, afterEach } from '@jest/globals';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { rest } from 'msw';
import { onlineManager, useQuery } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import MlflowWrapperBase from './MlflowWrapperBase';
import { useBodyPopupContainer } from '../utils/portalContainer';
import { setupServer } from '../../common/utils/setup-msw';
import { isEvaluatingTracesInDetailsViewEnabled } from '../../shared/web-shared/model-trace-explorer/FeatureUtils';

jest.mock('./federatedGlobalStyles', () => ({}));

// The real provider lists namespaces from the dashboard BFF on mount.
jest.mock('mod-arch-core', () => ({
  ...jest.requireActual<typeof import('mod-arch-core')>('mod-arch-core'),
  ModularArchContextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../i18n/I18nUtils', () => ({
  useI18nInit: () =>
    jest.requireActual<typeof import('react-intl')>('react-intl').createIntl({ locale: 'en', messages: {} }),
}));

// Use the real ODH default (gateway off until server-info reports it) instead of the jest setup's upstream default.
jest.unmock('../../experiment-tracking/hooks/useServerInfo');

const QueryProbe = () => {
  const { data } = useQuery({ queryKey: ['federated-offline-probe'], queryFn: async () => 'query resolved' });
  return <span>{data ?? 'query pending'}</span>;
};

const SERVER_INFO_URL = '/ajax-api/3.0/mlflow/server-info';
const SERVER_INFO = {
  store_type: 'SqlStore',
  workspaces_enabled: true,
  trace_archival_enabled: false,
  multipart_uploads_enabled: false,
  multipart_downloads_enabled: false,
  features_enabled: { gateway: true },
};
const SKELETON_SELECTOR = '[class$="-skeleton"]';

// Reads the gateway flag synchronously during render, like the run-judge entry points do.
const RunJudgeGateProbe = () => <span>run judge enabled: {String(isEvaluatingTracesInDetailsViewEnabled())}</span>;

const PORTAL_CONTAINER_SELECTOR = 'body > [data-mlflow-federated-portal-container="true"]';

const PopupContainerProbe = ({ onResolve }: { onResolve: (getContainer: () => HTMLElement) => void }) => {
  onResolve(useBodyPopupContainer());
  return <span>popup container probe</span>;
};

describe('MlflowWrapperBase', () => {
  const server = setupServer(rest.get(SERVER_INFO_URL, (_req, res, ctx) => res(ctx.json(SERVER_INFO))));

  afterEach(() => {
    onlineManager.setOnline(undefined);
  });

  test('runs queries while the browser reports being offline', async () => {
    onlineManager.setOnline(false);

    render(
      <MlflowWrapperBase memoryRouterEntries={['/']}>
        <QueryProbe />
      </MlflowWrapperBase>,
    );

    expect(await screen.findByText('query resolved')).toBeInTheDocument();
  });

  test('provides its own body-level portal container to useBodyPopupContainer', async () => {
    let getContainer: (() => HTMLElement) | undefined;

    const { unmount } = render(
      <MlflowWrapperBase memoryRouterEntries={['/']}>
        <PopupContainerProbe onResolve={(fn) => (getContainer = fn)} />
      </MlflowWrapperBase>,
    );
    await screen.findByText('popup container probe');

    const portalContainers = document.querySelectorAll(PORTAL_CONTAINER_SELECTOR);
    expect(portalContainers).toHaveLength(1);
    expect(getContainer?.()).toBe(portalContainers[0]);

    unmount();
    expect(document.querySelectorAll(PORTAL_CONTAINER_SELECTOR)).toHaveLength(0);
  });

  test('gives each concurrently mounted wrapper its own portal container', async () => {
    let getFirstContainer: (() => HTMLElement) | undefined;
    let getSecondContainer: (() => HTMLElement) | undefined;

    const first = render(
      <MlflowWrapperBase memoryRouterEntries={['/']}>
        <PopupContainerProbe onResolve={(fn) => (getFirstContainer = fn)} />
      </MlflowWrapperBase>,
    );
    const second = render(
      <MlflowWrapperBase memoryRouterEntries={['/']}>
        <PopupContainerProbe onResolve={(fn) => (getSecondContainer = fn)} />
      </MlflowWrapperBase>,
    );
    await waitFor(() => expect(screen.getAllByText('popup container probe')).toHaveLength(2));

    const [firstContainer, secondContainer] = Array.from(document.querySelectorAll(PORTAL_CONTAINER_SELECTOR));
    expect(getFirstContainer?.()).toBe(firstContainer);
    expect(getSecondContainer?.()).toBe(secondContainer);
    expect(firstContainer).not.toBe(secondContainer);

    first.unmount();
    expect(firstContainer.isConnected).toBe(false);
    expect(getSecondContainer?.()).toBe(secondContainer);
    expect(secondContainer.isConnected).toBe(true);

    second.unmount();
  });
  describe.each([
    ['MemoryRouter', { memoryRouterEntries: ['/'] }],
    ['BrowserRouter', { basename: '/' }],
  ])('server-info wait (%s)', (_name, routerProps) => {
    test('shows a skeleton while server-info is pending, then renders children that read it synchronously', async () => {
      server.use(rest.get(SERVER_INFO_URL, (_req, res, ctx) => res(ctx.delay(100), ctx.json(SERVER_INFO))));

      const { container } = render(
        <MlflowWrapperBase {...routerProps}>
          <RunJudgeGateProbe />
        </MlflowWrapperBase>,
      );

      expect(container.querySelector(SKELETON_SELECTOR)).toBeInTheDocument();
      expect(screen.queryByText(/run judge enabled/)).not.toBeInTheDocument();

      expect(await screen.findByText('run judge enabled: true')).toBeInTheDocument();
      expect(container.querySelector(SKELETON_SELECTOR)).not.toBeInTheDocument();
    });

    test('renders children with gateway UI off after server-info fails', async () => {
      server.use(rest.get(SERVER_INFO_URL, (_req, res) => res.networkError('server-info unreachable')));

      render(
        <MlflowWrapperBase {...routerProps}>
          <RunJudgeGateProbe />
        </MlflowWrapperBase>,
      );

      expect(await screen.findByText('run judge enabled: false')).toBeInTheDocument();
    });
  });
});
