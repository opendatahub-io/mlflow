import { rest } from 'msw';
import { getAjaxUrl } from '@mlflow/mlflow/src/common/utils/FetchUtils';
import type { MCPServer, MCPServerVersion, MCPAccessBinding } from './types';

const BASE_URL = 'ajax-api/3.0/mlflow/mcp-servers';

export const createMockMCPServer = (overrides: Partial<MCPServer> = {}): MCPServer => ({
  name: 'io.github.test/server',
  access_bindings: [],
  aliases: [],
  tags: {},
  ...overrides,
});

export const createMockMCPServerVersion = (overrides: Partial<MCPServerVersion> = {}): MCPServerVersion => ({
  name: 'io.github.test/server',
  version: '1',
  server_json: {
    name: 'io.github.test/server',
    version: '1.0.0',
    title: 'Test Server',
    description: 'A test MCP server',
  },
  status: 'active',
  aliases: [],
  tags: {},
  creation_timestamp: 1717520552000,
  ...overrides,
});

export const createMockMCPAccessBinding = (overrides: Partial<MCPAccessBinding> = {}): MCPAccessBinding => ({
  binding_id: 1,
  server_name: 'io.github.test/server',
  endpoint_url: 'https://example.com/mcp',
  transport_type: 'streamable-http',
  ...overrides,
});

export const getMockedSearchMCPServersResponse = (servers: MCPServer[] = []) =>
  rest.get(getAjaxUrl(BASE_URL), (_req, res, ctx) =>
    res(ctx.json({ mcp_servers: servers, next_page_token: undefined })),
  );

export const getMockedSearchMCPServersErrorResponse = (status = 500, message = 'Internal error') =>
  rest.get(getAjaxUrl(BASE_URL), (_req, res, ctx) => res(ctx.status(status), ctx.json({ message })));

export const getMockedGetMCPServerResponse = (server: MCPServer) =>
  rest.get(getAjaxUrl(`${BASE_URL}/:name`), (_req, res, ctx) => res(ctx.json(server)));

export const getMockedGetMCPServerErrorResponse = (status = 404, message = 'Not found') =>
  rest.get(getAjaxUrl(`${BASE_URL}/:name`), (_req, res, ctx) => res(ctx.status(status), ctx.json({ message })));

export const getMockedSearchMCPServerVersionsResponse = (versions: MCPServerVersion[] = []) =>
  rest.get(getAjaxUrl(`${BASE_URL}/:name/versions`), (_req, res, ctx) =>
    res(ctx.json({ mcp_server_versions: versions, next_page_token: undefined })),
  );

export const getMockedSearchMCPAccessBindingsResponse = (bindings: MCPAccessBinding[] = []) =>
  rest.get(getAjaxUrl(`${BASE_URL}/:name/bindings`), (_req, res, ctx) =>
    res(ctx.json({ mcp_access_bindings: bindings, next_page_token: undefined })),
  );

export const getMockedUpdateMCPServerVersionResponse = (version: MCPServerVersion) =>
  rest.patch(getAjaxUrl(`${BASE_URL}/:name/versions/:version`), (_req, res, ctx) => res(ctx.json(version)));

export const getMockedDeleteMCPServerVersionResponse = () =>
  rest.delete(getAjaxUrl(`${BASE_URL}/:name/versions/:version`), (_req, res, ctx) => res(ctx.json({})));

export const getMockedDeleteMCPServerResponse = () =>
  rest.delete(getAjaxUrl(`${BASE_URL}/:name`), (_req, res, ctx) => res(ctx.json({})));
