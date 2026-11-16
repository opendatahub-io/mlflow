import { describe, expect, it } from '@jest/globals';
import { matchPath } from '../common/utils/RoutingUtils';
import AgentPluginRegistryRoutes, { AgentPluginRegistryRoutePaths } from './routes';
import { getAgentPluginRegistryRouteDefs } from './route-defs';
import { parseAgentPluginRouteParams } from './utils';

describe('agent plugin routes', () => {
  it('builds catalog and detail routes', () => {
    expect(AgentPluginRegistryRoutes.catalogRoute).toBe('/agent-plugins');
    expect(AgentPluginRegistryRoutes.getDetailRoute('pr-workflow')).toBe('/agent-plugins/pr-workflow');
    expect(AgentPluginRegistryRoutes.getDetailRoute('pr-workflow', 'acme')).toBe('/agent-plugins/@acme/pr-workflow');
  });

  it('encodes SemVer build metadata in query parameters', () => {
    expect(AgentPluginRegistryRoutes.getDetailRoute('pr-workflow', 'acme', '1.0.0+build.1')).toBe(
      '/agent-plugins/@acme/pr-workflow?version=1.0.0%2Bbuild.1',
    );
  });

  it.each([
    {
      pattern: AgentPluginRegistryRoutePaths.detail,
      path: '/agent-plugins/pr-workflow',
      organization: '',
    },
    {
      pattern: AgentPluginRegistryRoutePaths.detail,
      path: '/agent-plugins/%40acme%2Fpr-workflow',
      organization: 'acme',
    },
    {
      pattern: AgentPluginRegistryRoutePaths.detailWithOrganization,
      path: '/agent-plugins/@acme/pr-workflow',
      organization: 'acme',
    },
  ])('parses $path', ({ pattern, path, organization }) => {
    const match = matchPath(pattern, path);
    expect(match).not.toBeNull();
    expect(parseAgentPluginRouteParams(match?.params ?? {})).toEqual({
      name: 'pr-workflow',
      organization,
    });
  });

  it('defines page titles without requiring page implementations', () => {
    const loader = async () => ({ default: () => null });
    const routes = getAgentPluginRegistryRouteDefs({ catalog: loader, detail: loader });
    expect(routes.map((route) => route.path)).toEqual([
      AgentPluginRegistryRoutePaths.catalog,
      AgentPluginRegistryRoutePaths.detailWithOrganization,
      AgentPluginRegistryRoutePaths.detail,
    ]);
    expect(routes[0].handle.getPageTitle({})).toBe('Agent Plugins');
    expect(routes[1].handle.getPageTitle({ organization: '@acme', agentPluginName: 'pr-workflow' })).toBe(
      'Agent Plugin: @acme/pr-workflow',
    );
  });
});
