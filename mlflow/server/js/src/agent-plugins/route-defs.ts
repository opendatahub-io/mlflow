import { createLazyRouteElement, type DocumentTitleHandle } from '../common/utils/RoutingUtils';
import { AgentPluginRegistryPageId, AgentPluginRegistryRoutePaths } from './routes';
import { formatAgentPluginIdentity, parseAgentPluginRouteParams } from './utils';

type PageLoader = Parameters<typeof createLazyRouteElement>[0];

const detailTitle: DocumentTitleHandle['getPageTitle'] = (params) => {
  const { name, organization } = parseAgentPluginRouteParams(params);
  return `Agent Plugin: ${formatAgentPluginIdentity(name, organization)}`;
};

export const getAgentPluginRegistryRouteDefs = (loaders: { catalog: PageLoader; detail: PageLoader }) => [
  {
    path: AgentPluginRegistryRoutePaths.catalog,
    element: createLazyRouteElement(loaders.catalog),
    pageId: AgentPluginRegistryPageId.catalog,
    handle: { getPageTitle: () => 'Agent Plugins' } satisfies DocumentTitleHandle,
  },
  ...[AgentPluginRegistryRoutePaths.detailWithOrganization, AgentPluginRegistryRoutePaths.detail].map((path) => ({
    path,
    element: createLazyRouteElement(loaders.detail),
    pageId: AgentPluginRegistryPageId.detail,
    handle: { getPageTitle: detailTitle } satisfies DocumentTitleHandle,
  })),
];
