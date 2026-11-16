import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AgentPluginApi } from './api';
import { startAgentPluginDevStub } from './dev-stub';
import { agentPluginFixtures } from './test-utils';

describe('agent plugin dev stub', () => {
  const originalEnv = process.env;
  let stop: (() => void) | undefined;
  let fetchMock: jest.SpiedFunction<typeof window.fetch>;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'development',
      REACT_APP_AGENT_PLUGINS_STUB: 'true',
    };
    fetchMock = jest.spyOn(window, 'fetch').mockResolvedValue(new Response('{}'));
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it.each([
    { NODE_ENV: 'production', REACT_APP_AGENT_PLUGINS_STUB: 'true' },
    { NODE_ENV: 'test', REACT_APP_AGENT_PLUGINS_STUB: 'true' },
    { NODE_ENV: 'development', REACT_APP_AGENT_PLUGINS_STUB: 'false' },
  ])('requires opt-in development mode: %j', (environment) => {
    process.env = { ...process.env, ...environment };
    stop = startAgentPluginDevStub();
    expect(window.fetch).toBe(fetchMock);
  });

  it('serves catalog, details, versions, and aliases without a backend', async () => {
    stop = startAgentPluginDevStub();
    expect(await AgentPluginApi.searchPlugins({})).toEqual({
      agent_plugins: [agentPluginFixtures.plugin],
      next_page_token: null,
    });
    expect(await AgentPluginApi.getPlugin('pr-workflow', 'acme')).toEqual(agentPluginFixtures.plugin);
    expect(await AgentPluginApi.getPluginVersion('pr-workflow', '2.0.0', 'acme')).toEqual(
      agentPluginFixtures.assembled,
    );
    expect(await AgentPluginApi.resolvePluginAlias('pr-workflow', 'production', 'acme')).toEqual(
      agentPluginFixtures.assembled,
    );
    const result = await AgentPluginApi.searchPluginVersions('pr-workflow', {}, 'acme');
    expect(result.agent_plugin_versions).toContainEqual(agentPluginFixtures.zeroMember);
    expect(result.agent_plugin_versions).not.toContainEqual(agentPluginFixtures.withdrawn);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not intercept mutations, unrelated paths, or other origins', async () => {
    stop = startAgentPluginDevStub();
    await AgentPluginApi.createPlugin({ name: 'new-plugin' });
    await window.fetch('/ajax-api/3.0/mlflow/skills');
    await window.fetch('https://example.com/ajax-api/3.0/mlflow/agent-plugins');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
