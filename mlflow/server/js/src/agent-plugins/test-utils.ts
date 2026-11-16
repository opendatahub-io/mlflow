import { rest } from 'msw';
import { SkillStatus, type SkillVersion } from '../skill-registry/types';
import type { AgentPlugin, AgentPluginVersion } from './types';

// creates mocks for dev stubs and tests

const auditFields = {
  created_by: 'alice@example.com',
  last_updated_by: 'alice@example.com',
  creation_timestamp: 1,
  last_updated_timestamp: 1,
};

export const createMockAgentPlugin = (overrides: Partial<AgentPlugin> = {}): AgentPlugin => ({
  ...auditFields,
  name: 'pr-workflow',
  organization: 'acme',
  description: 'Pull request tools',
  icons: null,
  status: SkillStatus.ACTIVE,
  latest_version: '2.0.0',
  aliases: [{ alias: 'production', version: '2.0.0' }],
  tags: {},
  ...overrides,
});

export const createMockAgentPluginVersion = (overrides: Partial<AgentPluginVersion> = {}): AgentPluginVersion => {
  const name = overrides.name ?? 'pr-workflow';
  const version = overrides.version ?? '1.0.0';
  return {
    ...auditFields,
    name,
    organization: 'acme',
    version,
    plugin_json: {
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      name,
      version,
    },
    source_type: 'assembled',
    source: null,
    ref: null,
    subpath: null,
    status: SkillStatus.ACTIVE,
    status_reason: null,
    skills: [],
    mcp_servers: {},
    aliases: [],
    tags: {},
    ...overrides,
  };
};

export const mcpEndpointFixtures = {
  associated: {
    endpoint_id: `ae-${'1'.repeat(32)}`,
    server_name: 'com.acme/search',
    client_config: { type: 'streamable-http', url: 'https://example.com/search/mcp' },
  },
  unassociated: {
    endpoint_id: `ae-${'2'.repeat(32)}`,
    server_name: null,
    client_config: { type: 'streamable-http', url: 'https://example.com/custom/mcp' },
  },
};

export const agentPluginFixtures = {
  plugin: createMockAgentPlugin(),
  packaged: createMockAgentPluginVersion({
    source_type: 'git',
    source: 'https://github.com/acme/plugins.git',
    ref: 'main',
    subpath: 'plugins/pr-workflow',
    skills: ['skills:/@acme/code-review/1'],
  }),
  assembled: createMockAgentPluginVersion({
    version: '2.0.0',
    skills: ['skills:/@acme/code-review/2'],
    aliases: ['production'],
    mcp_servers: {
      search: { endpoint_id: mcpEndpointFixtures.associated.endpoint_id },
      custom: { endpoint_id: mcpEndpointFixtures.unassociated.endpoint_id },
    },
  }),
  zeroMember: createMockAgentPluginVersion({ version: '3.0.0', status: SkillStatus.DRAFT }),
  withdrawn: createMockAgentPluginVersion({
    version: '0.9.0',
    skills: ['skills:/@acme/revoked-skill/1'],
  }),
  deletedMember: {
    ...auditFields,
    name: 'revoked-skill',
    organization: 'acme',
    version: 1,
    source_type: 'git',
    source: 'https://github.com/acme/skills.git',
    ref: 'main',
    subpath: 'revoked-skill',
    digest: null,
    status: SkillStatus.DELETED,
    aliases: [],
    tags: {},
  } satisfies SkillVersion,
};

type FixtureResponse = {
  status: number;
  body: AgentPlugin | AgentPluginVersion | Record<string, unknown>;
};

export const getAgentPluginFixtureResponse = (
  url: URL,
  plugin: AgentPlugin = agentPluginFixtures.plugin,
  versions: AgentPluginVersion[] = [
    agentPluginFixtures.assembled,
    agentPluginFixtures.packaged,
    agentPluginFixtures.zeroMember,
  ],
): FixtureResponse | undefined => {
  const match = /\/ajax-api\/3\.0\/mlflow\/agent-plugins(?:\/(.*))?$/.exec(url.pathname);
  if (!match) return undefined;
  if (!match[1]) {
    return { status: 200, body: { agent_plugins: [plugin], next_page_token: null } };
  }
  let parts: string[];
  try {
    parts = match[1].split('/').map(decodeURIComponent);
  } catch {
    return {
      status: 400,
      body: { error_code: 'INVALID_PARAMETER_VALUE', message: 'Invalid URL encoding' },
    };
  }
  const organization = parts[0].startsWith('@') ? parts.shift()?.slice(1) : '';
  const name = parts.shift();
  const notFound: FixtureResponse = {
    status: 404,
    body: { error_code: 'RESOURCE_DOES_NOT_EXIST', message: 'Agent plugin not found' },
  };
  if (name !== plugin.name || organization !== plugin.organization) return notFound;
  if (!parts.length) return { status: 200, body: plugin };
  if (parts[0] === 'versions' && parts.length === 1) {
    return { status: 200, body: { agent_plugin_versions: versions, next_page_token: null } };
  }
  const version =
    parts[0] === 'versions' && parts.length === 2
      ? versions.find((entry) => entry.version === parts[1])
      : parts[0] === 'aliases' && parts.length === 2
        ? versions.find((entry) => entry.aliases.includes(parts[1]))
        : undefined;
  return version ? { status: 200, body: version } : notFound;
};

export const getMockedAgentPluginHandlers = (plugin: AgentPlugin, versions: AgentPluginVersion[]) => [
  rest.get(/\/ajax-api\/3\.0\/mlflow\/agent-plugins(?:\/.*)?$/, (req, res, ctx) => {
    const response = getAgentPluginFixtureResponse(req.url, plugin, versions);
    return response ? res(ctx.status(response.status), ctx.json(response.body)) : req.passthrough();
  }),
];
