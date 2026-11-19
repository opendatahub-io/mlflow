import { fetchAPI, fetchJSON, getAjaxUrl, HTTPMethods } from '../common/utils/FetchUtils';
import { buildSearchParams } from '../common/utils/SearchUtils';
import type {
  AgentPlugin,
  AgentPluginMutationResponse,
  AgentPluginVersion,
  CreateAgentPluginRequest,
  CreateAgentPluginVersionRequest,
  DeleteAgentPluginParams,
  DeleteAgentPluginVersionParams,
  ImportRegisterRequest,
  ImportRegisterResponse,
  RegisterAgentPluginRequest,
  SearchAgentPluginsParams,
  SearchAgentPluginsResponse,
  SearchAgentPluginVersionsParams,
  SearchAgentPluginVersionsResponse,
  SetAgentPluginAliasRequest,
  SetAgentPluginTagRequest,
  UpdateAgentPluginRequest,
  UpdateAgentPluginVersionRequest,
} from './types';

const BASE_URL = 'ajax-api/3.0/mlflow/agent-plugins';

const buildAgentPluginSearchParams = (params: SearchAgentPluginsParams = {}): string => {
  return buildSearchParams({
    filter_string: params.filter_string,
    max_results: params.max_results,
    order_by: params.order_by,
    page_token: params.page_token,
  });
};

const agentPluginUrl = (name: string, organization = '') =>
  organization
    ? `${BASE_URL}/@${encodeURIComponent(organization)}/${encodeURIComponent(name)}`
    : `${BASE_URL}/${encodeURIComponent(name)}`;

function createPluginVersion(
  name: string,
  request: CreateAgentPluginVersionRequest,
  organization = '',
): Promise<AgentPluginVersion> {
  return fetchAPI(getAjaxUrl(`${agentPluginUrl(name, organization)}/versions`), {
    method: HTTPMethods.POST,
    body: request,
  }) as Promise<AgentPluginVersion>;
}

function registerPlugin(request: RegisterAgentPluginRequest): Promise<AgentPluginVersion> {
  const url = getAjaxUrl(`${BASE_URL}/register`);
  return fetchJSON<AgentPluginVersion>(url, {
    method: HTTPMethods.POST,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
}

export const AgentPluginApi = {
  createPlugin: (request: CreateAgentPluginRequest): Promise<AgentPlugin> => {
    return fetchJSON<AgentPlugin>(getAjaxUrl(BASE_URL), {
      method: HTTPMethods.POST,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  },
  searchPlugins: (params: SearchAgentPluginsParams): Promise<SearchAgentPluginsResponse> => {
    return fetchAPI(getAjaxUrl(`${BASE_URL}${buildAgentPluginSearchParams(params)}`));
  },
  registerPlugin,
  importPlugin: (request: ImportRegisterRequest): Promise<ImportRegisterResponse> => {
    return fetchJSON<ImportRegisterResponse>(getAjaxUrl(`${BASE_URL}/import`), {
      method: HTTPMethods.POST,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  },

  getPlugin: (name: string, organization = ''): Promise<AgentPlugin> => {
    return fetchAPI(getAjaxUrl(agentPluginUrl(name, organization)));
  },
  updatePlugin: (name: string, organization = '', request: UpdateAgentPluginRequest): Promise<AgentPlugin> => {
    return fetchAPI(getAjaxUrl(agentPluginUrl(name, organization)), {
      method: HTTPMethods.PATCH,
      body: request,
    });
  },
  deletePlugin: (
    name: string,
    organization = '',
    params: DeleteAgentPluginParams = {},
  ): Promise<AgentPluginMutationResponse> => {
    const query = buildSearchParams({
      cascade: params.cascade ? String(params.cascade) : undefined,
    });
    return fetchAPI(getAjaxUrl(`${agentPluginUrl(name, organization)}${query}`), {
      method: HTTPMethods.DELETE,
    });
  },

  createPluginVersion,

  searchPluginVersions: (
    name: string,
    params: SearchAgentPluginVersionsParams = {},
    organization = '',
  ): Promise<SearchAgentPluginVersionsResponse> => {
    return fetchAPI(
      getAjaxUrl(`${agentPluginUrl(name, organization)}/versions${buildAgentPluginSearchParams(params)}`),
    );
  },
  getPluginVersion: (name: string, version: string, organization = ''): Promise<AgentPluginVersion> => {
    return fetchAPI(getAjaxUrl(`${agentPluginUrl(name, organization)}/versions/${encodeURIComponent(version)}`));
  },
  updatePluginVersion: (
    name: string,
    version: string,
    organization = '',
    request: UpdateAgentPluginVersionRequest,
  ): Promise<AgentPluginVersion> => {
    return fetchAPI(getAjaxUrl(`${agentPluginUrl(name, organization)}/versions/${encodeURIComponent(version)}`), {
      method: HTTPMethods.PATCH,
      body: request,
    });
  },
  deletePluginVersion: (
    name: string,
    version: string,
    organization = '',
    params: DeleteAgentPluginVersionParams = {},
  ): Promise<AgentPluginMutationResponse> => {
    const query = buildSearchParams(params);
    return fetchAPI(
      getAjaxUrl(`${agentPluginUrl(name, organization)}/versions/${encodeURIComponent(version)}${query}`),
      {
        method: HTTPMethods.DELETE,
      },
    );
  },

  setPluginTag: (
    name: string,
    request: SetAgentPluginTagRequest,
    organization = '',
  ): Promise<AgentPluginMutationResponse> => {
    return fetchAPI(getAjaxUrl(`${agentPluginUrl(name, organization)}/tags`), {
      method: HTTPMethods.POST,
      body: request,
    });
  },
  deletePluginTag: (name: string, key: string, organization = ''): Promise<AgentPluginMutationResponse> => {
    return fetchAPI(getAjaxUrl(`${agentPluginUrl(name, organization)}/tags/${encodeURIComponent(key)}`), {
      method: HTTPMethods.DELETE,
    });
  },
  setPluginVersionTag: (
    name: string,
    version: string,
    request: SetAgentPluginTagRequest,
    organization = '',
  ): Promise<AgentPluginMutationResponse> => {
    return fetchAPI(getAjaxUrl(`${agentPluginUrl(name, organization)}/versions/${encodeURIComponent(version)}/tags`), {
      method: HTTPMethods.POST,
      body: request,
    });
  },
  deletePluginVersionTag: (
    name: string,
    version: string,
    key: string,
    organization = '',
  ): Promise<AgentPluginMutationResponse> => {
    return fetchAPI(
      getAjaxUrl(
        `${agentPluginUrl(name, organization)}/versions/${encodeURIComponent(version)}/tags/${encodeURIComponent(key)}`,
      ),
      {
        method: HTTPMethods.DELETE,
      },
    );
  },

  setPluginAlias: (
    name: string,
    request: SetAgentPluginAliasRequest,
    organization = '',
  ): Promise<AgentPluginMutationResponse> => {
    return fetchAPI(getAjaxUrl(`${agentPluginUrl(name, organization)}/aliases`), {
      method: HTTPMethods.POST,
      body: request,
    });
  },
  resolvePluginAlias: (name: string, alias: string, organization = ''): Promise<AgentPluginVersion> => {
    return fetchAPI(getAjaxUrl(`${agentPluginUrl(name, organization)}/aliases/${encodeURIComponent(alias)}`));
  },
  deletePluginAlias: (name: string, alias: string, organization = ''): Promise<AgentPluginMutationResponse> => {
    return fetchAPI(getAjaxUrl(`${agentPluginUrl(name, organization)}/aliases/${encodeURIComponent(alias)}`), {
      method: HTTPMethods.DELETE,
    });
  },
};
