import { createMLflowRoutePath, generatePath } from '../common/utils/RoutingUtils';
import { formatAgentPluginIdentity } from './utils';

export enum AgentPluginRegistryPageId {
  catalog = 'mlflow.agent-plugins',
  detail = 'mlflow.agent-plugins.detail',
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- TODO(FEINF-4274)
export class AgentPluginRegistryRoutePaths {
  static get catalog() {
    return createMLflowRoutePath('/agent-plugins');
  }

  static get detail() {
    return createMLflowRoutePath('/agent-plugins/:agentPluginKey');
  }

  static get detailWithOrganization() {
    return createMLflowRoutePath('/agent-plugins/:organization/:agentPluginName');
  }
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- TODO(FEINF-4274)
class AgentPluginRegistryRoutes {
  static get catalogRoute() {
    return AgentPluginRegistryRoutePaths.catalog;
  }

  static getDetailRoute(name: string, organization = '', version?: string) {
    formatAgentPluginIdentity(name, organization);
    const path = organization
      ? generatePath(AgentPluginRegistryRoutePaths.detailWithOrganization, {
          organization: `@${organization}`,
          agentPluginName: name,
        })
      : generatePath(AgentPluginRegistryRoutePaths.detail, { agentPluginKey: name });
    return version === undefined ? path : `${path}?${new URLSearchParams({ version })}`;
  }
}

export default AgentPluginRegistryRoutes;
