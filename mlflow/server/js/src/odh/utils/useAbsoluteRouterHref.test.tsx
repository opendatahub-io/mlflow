import { afterEach, describe, expect, test } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, RouterProvider, createHashRouter, createMLflowRoutePath } from '../../common/utils/RoutingUtils';
import { setActiveWorkspace } from '../../workspaces/utils/WorkspaceUtils';
import { buildAbsoluteRouterHref, buildRouterHref, useAbsoluteRouterHref } from './useAbsoluteRouterHref';

const FEDERATED_BASENAME = '/observe-and-monitor/agent-observability';

const HrefProbe = ({ to }: { to: string }) => {
  const toAbsoluteHref = useAbsoluteRouterHref();
  return <span data-testid="href">{toAbsoluteHref(to)}</span>;
};

const hashNavigator = {
  createHref: (to: { pathname: string; search: string; hash: string }) => `#${to.pathname}${to.search}${to.hash}`,
};
const browserNavigator = {
  createHref: (to: { pathname: string; search: string; hash: string }) => `${to.pathname}${to.search}${to.hash}`,
};

describe('buildAbsoluteRouterHref', () => {
  afterEach(() => {
    setActiveWorkspace(null);
  });

  test('standalone: builds a hash URL on the current document and keeps the workspace', () => {
    setActiveWorkspace('team-a');
    expect(
      buildAbsoluteRouterHref('/experiments/4/traces?q=refund', '/', hashNavigator, 'https://mlflow.example/#/old'),
    ).toBe('https://mlflow.example/#/experiments/4/traces?q=refund&workspace=team-a');
  });

  test('standalone: keeps the path the app is served from', () => {
    expect(buildAbsoluteRouterHref('/experiments/4/traces', '/', hashNavigator, 'https://host/mlflow/#/x')).toBe(
      'https://host/mlflow/#/experiments/4/traces',
    );
  });

  test('federated: prefixes the router basename and drops the current page path', () => {
    setActiveWorkspace('team-a');
    expect(
      buildAbsoluteRouterHref(
        '/4/traces?traceViewShareKey=v1',
        FEDERATED_BASENAME,
        browserNavigator,
        `https://dashboard.example${FEDERATED_BASENAME}/4/traces?workspace=team-a`,
      ),
    ).toBe(`https://dashboard.example${FEDERATED_BASENAME}/4/traces?traceViewShareKey=v1&workspace=team-a`);
  });

  test('does not override an explicit workspace and maps the root path to the basename', () => {
    setActiveWorkspace('team-a');
    expect(
      buildAbsoluteRouterHref('/?workspace=team-b', `${FEDERATED_BASENAME}/`, browserNavigator, 'https://d/'),
    ).toBe(`https://d${FEDERATED_BASENAME}?workspace=team-b`);
  });

  test('falls back to the plain path without a router navigator', () => {
    expect(buildAbsoluteRouterHref('/experiments/4/traces#x', undefined, undefined, 'https://h/a')).toBe(
      'https://h/experiments/4/traces#x',
    );
  });
});

describe('useAbsoluteRouterHref', () => {
  afterEach(() => {
    setActiveWorkspace(null);
  });

  test('standalone HashRouter: link opens the hash route with the workspace', async () => {
    setActiveWorkspace('team-a');
    const router = createHashRouter([{ path: '*', element: <HrefProbe to="/experiments/4/traces?traceId=tr-1" /> }]);
    render(<RouterProvider router={router} />);
    expect((await screen.findByTestId('href')).textContent).toBe(
      'http://localhost/#/experiments/4/traces?traceId=tr-1&workspace=team-a',
    );
  });

  test('federated router with basename: link keeps the dashboard basename', () => {
    setActiveWorkspace('team-a');
    render(
      <MemoryRouter basename={FEDERATED_BASENAME} initialEntries={[`${FEDERATED_BASENAME}/4/traces?workspace=team-a`]}>
        <HrefProbe to="/4/traces?traceId=tr-1&workspace=team-a" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('href').textContent).toBe(
      `http://localhost${FEDERATED_BASENAME}/4/traces?traceId=tr-1&workspace=team-a`,
    );
  });

  test('federated: route helpers already strip /experiments, so the basename is not doubled', () => {
    const originalMode = process.env['DEPLOYMENT_MODE'];
    process.env['DEPLOYMENT_MODE'] = 'federated';
    try {
      render(
        <MemoryRouter
          basename="/develop-train/mlflow/experiments"
          initialEntries={['/develop-train/mlflow/experiments/3']}
        >
          <HrefProbe to={createMLflowRoutePath('/experiments/3/runs')} />
        </MemoryRouter>,
      );
      expect(screen.getByTestId('href').textContent).toBe('http://localhost/develop-train/mlflow/experiments/3/runs');
    } finally {
      if (originalMode === undefined) {
        delete process.env['DEPLOYMENT_MODE'];
      } else {
        process.env['DEPLOYMENT_MODE'] = originalMode;
      }
    }
  });

  test('outside a router: returns the plain path resolved on the current document', () => {
    render(<HrefProbe to="/experiments/4/traces" />);
    expect(screen.getByTestId('href').textContent).toBe('http://localhost/experiments/4/traces');
  });
});

describe('buildRouterHref', () => {
  afterEach(() => {
    setActiveWorkspace(null);
  });

  test('standalone: returns a hash href that window.open resolves against the current page', () => {
    setActiveWorkspace('team-a');
    expect(buildRouterHref('/experiments/4/traces?traceId=t1', '/', hashNavigator)).toBe(
      '#/experiments/4/traces?traceId=t1&workspace=team-a',
    );
  });

  test('federated: returns a root-relative href under the router basename', () => {
    expect(buildRouterHref('/4/traces?traceId=t1', FEDERATED_BASENAME, browserNavigator)).toBe(
      `${FEDERATED_BASENAME}/4/traces?traceId=t1`,
    );
  });

  test('outside a router: returns the plain path unchanged', () => {
    expect(buildRouterHref('/traces?traceId=only', undefined, undefined)).toBe('/traces?traceId=only');
  });
});
