import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AgentPluginApi } from './api';
import { createMockAgentPlugin, createMockAgentPluginVersion } from './test-utils';
import {
  AgentPluginSourceType,
  AgentPluginStatus,
  type CreateAgentPluginRequest,
  type CreateAgentPluginVersionRequest,
} from './types';

const BASE_URL = 'ajax-api/3.0/mlflow/agent-plugins';
const VERSION = '1.2.3-beta.1';
const pluginJson = {
  $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
  name: 'pr-workflow',
  version: VERSION,
  extensions: { custom: { enabled: true } },
  custom_field: 'preserved',
};
const source = 'https://github.com/acme/plugins.git';
const clientConfig = { type: 'streamable-http', url: 'https://example.com/mcp' };
const existingEndpointId = 'ae-5f8c2a1b9d3e4f6a8b0c1d2e3f4a5b6c';
const createdEndpointId = 'ae-6f8c2a1b9d3e4f6a8b0c1d2e3f4a5b6c';
const versionRequest: CreateAgentPluginVersionRequest = {
  plugin_json: pluginJson,
  skills: ['skills:/@acme/code-review/3'],
  mcp_servers: {
    existing: { endpoint_id: existingEndpointId },
    remote: { client_config: clientConfig },
  },
};
const pluginVersion = createMockAgentPluginVersion({
  version: VERSION,
  plugin_json: pluginJson,
  skills: versionRequest.skills ?? [],
  mcp_servers: {
    existing: { endpoint_id: existingEndpointId },
    remote: { endpoint_id: createdEndpointId },
  },
});
const searchParams = {
  filter_string: "status = 'active'",
  max_results: 25,
  order_by: ['name ASC', 'last_updated_timestamp DESC'],
  page_token: 'page/+ token',
};

type RequestExpectation = {
  path: string;
  method: string;
  body?: unknown;
  query?: Record<string, string | number | string[]>;
};

type EndpointCase = RequestExpectation & {
  name: string;
  invoke: () => unknown;
  response?: unknown;
};

const jsonResponse = (body: unknown = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }));

describe('Agent Plugin API', () => {
  let fetchMock: jest.SpiedFunction<typeof global.fetch>;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(() => jsonResponse());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const expectRequest = ({ path, method, body, query }: RequestExpectation) => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    const requestUrl = new URL(String(url), 'http://localhost/');
    expect(requestUrl.pathname).toBe(`/${BASE_URL}${path}`);
    expect(options?.method ?? 'GET').toBe(method);
    if (query !== undefined) {
      expect([...new Set(requestUrl.searchParams.keys())].sort()).toEqual(Object.keys(query).sort());
      for (const [key, value] of Object.entries(query)) {
        expect(requestUrl.searchParams.getAll(key)).toEqual(Array.isArray(value) ? value : [String(value)]);
      }
    }
    if (body !== undefined) {
      expect(typeof options?.body).toBe('string');
      expect(JSON.parse(options?.body as string)).toEqual(body);
      expect(new Headers(options?.headers).get('Content-Type')?.split(';')[0]).toBe('application/json');
    }
  };

  describe.each([undefined, 'acme'])('organization: %s', (organization) => {
    const path = organization ? '/@acme/pr-workflow' : '/pr-workflow';
    const versionPath = `${path}/versions/${VERSION}`;
    const plugin = createMockAgentPlugin({
      organization: organization ?? '',
      description: 'PR tools',
      latest_version: VERSION,
      aliases: [{ alias: 'production', version: VERSION }],
    });
    const versionResponse = { ...pluginVersion, organization: organization ?? '' };
    const createRequest: CreateAgentPluginRequest = { name: 'pr-workflow', organization, description: 'PR tools' };
    const updateRequest = { description: null, icons: null };
    const statusRequest = { status: AgentPluginStatus.DEPRECATED, status_reason: 'Use the replacement' };
    const tag = { key: 'owner/team', value: 'platform' };
    const alias = { alias: 'production', version: VERSION };
    const registerRequest = { ...versionRequest, organization };

    const endpoints: EndpointCase[] = [
      {
        name: 'create a plugin',
        invoke: () => AgentPluginApi.createPlugin(createRequest),
        path: '',
        method: 'POST',
        body: createRequest,
        response: { ...plugin, status: null, latest_version: null, aliases: [] },
      },
      {
        name: 'search plugins',
        invoke: () => AgentPluginApi.searchPlugins(searchParams),
        path: '',
        method: 'GET',
        query: searchParams,
        response: { agent_plugins: [plugin], next_page_token: 'next-page' },
      },
      {
        name: 'register a plugin using manifest identity and inline endpoint definitions',
        invoke: () => AgentPluginApi.registerPlugin(registerRequest),
        path: '/register',
        method: 'POST',
        body: registerRequest,
        response: versionResponse,
      },
      {
        name: 'get a plugin',
        invoke: () => AgentPluginApi.getPlugin('pr-workflow', organization),
        path,
        method: 'GET',
        response: plugin,
      },
      {
        name: 'update a plugin, preserving explicit nulls',
        invoke: () => AgentPluginApi.updatePlugin('pr-workflow', organization, updateRequest),
        path,
        method: 'PATCH',
        body: updateRequest,
        response: { ...plugin, ...updateRequest },
      },
      {
        name: 'request plugin deletion',
        invoke: () => AgentPluginApi.deletePlugin('pr-workflow', organization),
        path,
        method: 'DELETE',
      },
      {
        name: 'create a version with pinned skills and MCP endpoint references',
        invoke: () => AgentPluginApi.createPluginVersion('pr-workflow', versionRequest, organization),
        path: `${path}/versions`,
        method: 'POST',
        body: versionRequest,
        response: versionResponse,
      },
      {
        name: 'search plugin versions',
        invoke: () => AgentPluginApi.searchPluginVersions('pr-workflow', searchParams, organization),
        path: `${path}/versions`,
        method: 'GET',
        query: searchParams,
        response: { agent_plugin_versions: [versionResponse], next_page_token: 'next-page' },
      },
      {
        name: 'get a SemVer version',
        invoke: () => AgentPluginApi.getPluginVersion('pr-workflow', VERSION, organization),
        path: versionPath,
        method: 'GET',
        response: versionResponse,
      },
      {
        name: 'update version status and reason',
        invoke: () => AgentPluginApi.updatePluginVersion('pr-workflow', VERSION, organization, statusRequest),
        path: versionPath,
        method: 'PATCH',
        body: statusRequest,
        response: { ...versionResponse, ...statusRequest },
      },
      {
        name: 'request version deletion',
        invoke: () => AgentPluginApi.deletePluginVersion('pr-workflow', VERSION, organization),
        path: versionPath,
        method: 'DELETE',
      },
      {
        name: 'set a plugin tag',
        invoke: () => AgentPluginApi.setPluginTag('pr-workflow', tag, organization),
        path: `${path}/tags`,
        method: 'POST',
        body: tag,
      },
      {
        name: 'delete a plugin tag',
        invoke: () => AgentPluginApi.deletePluginTag('pr-workflow', tag.key, organization),
        path: `${path}/tags/owner%2Fteam`,
        method: 'DELETE',
      },
      {
        name: 'set a version tag',
        invoke: () => AgentPluginApi.setPluginVersionTag('pr-workflow', VERSION, tag, organization),
        path: `${versionPath}/tags`,
        method: 'POST',
        body: tag,
      },
      {
        name: 'delete a version tag',
        invoke: () => AgentPluginApi.deletePluginVersionTag('pr-workflow', VERSION, tag.key, organization),
        path: `${versionPath}/tags/owner%2Fteam`,
        method: 'DELETE',
      },
      {
        name: 'set an alias to a SemVer version',
        invoke: () => AgentPluginApi.setPluginAlias('pr-workflow', alias, organization),
        path: `${path}/aliases`,
        method: 'POST',
        body: alias,
      },
      {
        name: 'resolve an alias to a plugin version',
        invoke: () => AgentPluginApi.resolvePluginAlias('pr-workflow', alias.alias, organization),
        path: `${path}/aliases/production`,
        method: 'GET',
        response: { ...versionResponse, aliases: ['production'] },
      },
      {
        name: 'delete an alias',
        invoke: () => AgentPluginApi.deletePluginAlias('pr-workflow', alias.alias, organization),
        path: `${path}/aliases/production`,
        method: 'DELETE',
      },
    ];

    it.each(endpoints)('$name', async ({ invoke, response, ...request }) => {
      fetchMock.mockImplementationOnce(() => jsonResponse(response));

      const result = await invoke();
      expectRequest(request);
      if (response !== undefined) expect(result).toEqual(response);
    });
  });

  it.each([
    { invoke: () => AgentPluginApi.searchPlugins({}), path: '' },
    { invoke: () => AgentPluginApi.searchPluginVersions('pr-workflow'), path: '/pr-workflow/versions' },
  ])('omits unspecified search parameters for $path', async ({ invoke, path }) => {
    await invoke();

    expectRequest({ path, method: 'GET', query: {} });
  });

  it.each([
    { name: 'omitted', fields: {} },
    { name: 'null', fields: { source: null } },
  ])('submits assembled version metadata with $name source for server-side manifest synthesis', async ({ fields }) => {
    const request = { version: VERSION, skills: versionRequest.skills, ...fields };
    const response = {
      ...pluginVersion,
      plugin_json: { $schema: pluginJson.$schema, name: 'pr-workflow', version: VERSION },
      mcp_servers: {},
    };
    fetchMock.mockImplementationOnce(() => jsonResponse(response));

    expect(await AgentPluginApi.createPluginVersion('pr-workflow', request, 'acme')).toEqual(response);

    expectRequest({ path: '/@acme/pr-workflow/versions', method: 'POST', body: request });
  });

  it.each([
    {
      name: 'Git',
      fields: { source_type: AgentPluginSourceType.Git, source, ref: 'main', subpath: 'plugins/pr-workflow' },
      storedSource: { source_type: 'git', source, ref: 'main', subpath: 'plugins/pr-workflow' },
    },
    {
      name: 'OCI',
      fields: { source_type: AgentPluginSourceType.OCI, source: 'oci://ghcr.io/acme/pr-workflow:1.0.0' },
      storedSource: { source_type: 'oci', source: 'ghcr.io/acme/pr-workflow:1.0.0', ref: null, subpath: null },
    },
    {
      name: 'ZIP',
      fields: { source_type: AgentPluginSourceType.Zip, source: 'https://example.com/plugin.zip' },
      storedSource: { source_type: 'zip', source: 'https://example.com/plugin.zip', ref: null, subpath: null },
    },
    {
      name: 'server-inferred Git',
      fields: { source },
      storedSource: { source_type: 'git', source, ref: null, subpath: null },
    },
  ] as const)(
    'forwards a $name package pointer as JSON without fetching its content',
    async ({ fields, storedSource }) => {
      const request = { plugin_json: pluginJson, ...fields };
      const response = { ...pluginVersion, ...storedSource, skills: [], mcp_servers: {} };
      fetchMock.mockImplementationOnce(() => jsonResponse(response));

      expect(await AgentPluginApi.createPluginVersion('pr-workflow', request, 'acme')).toEqual(response);

      expectRequest({ path: '/@acme/pr-workflow/versions', method: 'POST', body: request });
    },
  );

  it.each([
    { name: 'omitted name', request: versionRequest, manifest: pluginJson },
    { name: 'null name', request: { ...versionRequest, name: null }, manifest: pluginJson },
    {
      name: 'explicit name and version without a manifest',
      request: { name: 'pr-workflow', version: VERSION, skills: versionRequest.skills },
      manifest: { $schema: pluginJson.$schema, name: 'pr-workflow', version: VERSION },
    },
    {
      name: 'request-level version when manifest version is null',
      request: { plugin_json: { ...pluginJson, version: null }, version: VERSION, skills: versionRequest.skills },
      manifest: pluginJson,
    },
  ])('registers with $name, leaving identity and manifest resolution to the server', async ({ request, manifest }) => {
    const body = { ...request, organization: 'acme' };
    const response = {
      ...pluginVersion,
      plugin_json: manifest,
      mcp_servers: 'mcp_servers' in request ? pluginVersion.mcp_servers : {},
    };
    fetchMock.mockImplementationOnce(() => jsonResponse(response));

    expect(await AgentPluginApi.registerPlugin(body)).toEqual(response);

    expectRequest({ path: '/register', method: 'POST', body });
  });

  it('preserves an explicit null status reason without adding a status transition', async () => {
    const request = { status_reason: null };

    await AgentPluginApi.updatePluginVersion('pr-workflow', VERSION, 'acme', request);

    expectRequest({ path: `/@acme/pr-workflow/versions/${VERSION}`, method: 'PATCH', body: request });
  });

  // Unlike cascade's transport, version DELETE's status_reason query parameter is explicit in RFC-0008.
  it('passes an optional version deletion reason as a query parameter', async () => {
    const params = { status_reason: 'Security issue / revoked' };

    await AgentPluginApi.deletePluginVersion('pr-workflow', VERSION, 'acme', params);

    expectRequest({ path: `/@acme/pr-workflow/versions/${VERSION}`, method: 'DELETE', query: params });
  });

  it('rejects when the server refuses a name that conflicts with the manifest', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error_code: 'INVALID_PARAMETER_VALUE', message: 'Plugin name does not match manifest' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    await expect(AgentPluginApi.registerPlugin({ ...versionRequest, name: 'different-name' })).rejects.toThrow();
  });
});
