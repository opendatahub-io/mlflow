import { describe, expect, it } from '@jest/globals';
import { AgentPluginStatus } from './types';
import {
  buildAgentPluginCatalogFilterString,
  compareAgentPluginVersionStrings,
  formatAgentPluginIdentity,
  formatAgentPluginUri,
  orderAgentPluginVersions,
  parseAgentPluginIdentityKey,
  parseAgentPluginRouteParams,
  parseAgentPluginUri,
  type AgentPluginCatalogFilters,
} from './utils';
import { createMockAgentPluginVersion } from './test-utils';

describe('agent plugin identities and URIs', () => {
  it.each(['pr-workflow', '@acme/pr-workflow', '@acme.io/1.0.0'])('round-trips identity %s', (identity) => {
    const { name, organization } = parseAgentPluginIdentityKey(identity);
    expect(formatAgentPluginIdentity(name, organization)).toBe(identity);
  });

  it.each([
    'agent-plugins:/pr-workflow',
    'agent-plugins:/@acme/pr-workflow',
    'agent-plugins:/pr-workflow/1.0.0-beta.11',
    'agent-plugins:/@acme/pr-workflow/1.0.0+build.1',
    'agent-plugins:/pr-workflow@production',
    'agent-plugins:/@acme/pr-workflow@production',
  ])('round-trips URI %s', (uri) => {
    const { name, organization, ...selector } = parseAgentPluginUri(uri);
    expect(formatAgentPluginUri(name, organization, selector)).toBe(uri);
  });

  it.each([
    'agent-plugins:/@bad',
    'agent-plugins:/@acme/@bad',
    'agent-plugins:/../1.0.0',
    'agent-plugins:/name/',
    'agent-plugins:/name/1.0',
    'agent-plugins:/name/1.0.0-01',
    'agent-plugins:/name/1.0.0@production',
    'agent-plugins:/name/1.0.0?query',
    'agent-plugins:/name/1.0.0\n',
    'agent-plugins:/name\n',
    'agent-plugins:/name@',
    'skills:/name/1',
  ])('rejects invalid URI %s', (uri) => {
    expect(() => parseAgentPluginUri(uri)).toThrow();
  });

  it('rejects names beginning with @', () => {
    expect(() => formatAgentPluginIdentity('@bad')).toThrow();
  });

  it('rejects simultaneous version and alias selectors', () => {
    expect(() => formatAgentPluginUri('name', '', { version: '1.0.0', alias: 'production' })).toThrow();
  });
});

describe('parseAgentPluginRouteParams', () => {
  it.each<[Parameters<typeof parseAgentPluginRouteParams>[0], string, string]>([
    [{}, '', ''],
    [{ agentPluginName: 'pr-workflow' }, 'pr-workflow', ''],
    [{ organization: 'acme', agentPluginName: 'pr-workflow' }, 'pr-workflow', 'acme'],
    [{ organization: '%40acme', agentPluginName: 'pr%2Dworkflow' }, 'pr-workflow', 'acme'],
    [{ organization: '@acme' }, '', 'acme'],
    [{ agentPluginKey: '@acme' }, '', 'acme'],
    [{ agentPluginKey: 'bad%' }, 'bad%', ''],
    [{ organization: 'bad%', agentPluginName: 'bad%' }, 'bad%', 'bad%'],
  ])('parses %j correctly', (params, name, organization) => {
    expect(parseAgentPluginRouteParams(params)).toEqual({ name, organization });
  });
});

describe('agent plugin version ordering', () => {
  const ascending = [
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta',
    '1.0.0-beta.2',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0',
    '1.2.0',
    '1.10.0',
    '2.0.0',
  ];

  it('follows SemVer precedence', () => {
    expect([...ascending].reverse().sort(compareAgentPluginVersionStrings)).toEqual(ascending);
  });

  it('ignores build metadata', () => {
    expect(compareAgentPluginVersionStrings('1.0.0+build.1', '1.0.0+build.2')).toBe(0);
  });

  it('uses case-sensitive ASCII prerelease ordering', () => {
    expect(compareAgentPluginVersionStrings('1.0.0-Alpha', '1.0.0-alpha')).toBeLessThan(0);
  });

  it('breaks equal-precedence ties by creation time without mutation', () => {
    const older = createMockAgentPluginVersion({ version: '1.0.0+old', creation_timestamp: 1 });
    const newer = createMockAgentPluginVersion({ version: '1.0.0+new', creation_timestamp: 2 });
    const versions = [older, newer];
    expect(orderAgentPluginVersions(versions)).toEqual([newer, older]);
    expect(versions).toEqual([older, newer]);
  });
});

describe('agent plugin filter strings', () => {
  const cases: Array<[AgentPluginCatalogFilters, string]> = [
    [{ searchText: 'review' }, "search_text ILIKE '%review%'"],
    [{ organization: 'acme' }, "organization = 'acme'"],
    [{ organization: '' }, "organization = ''"],
    [{ tagKey: 'team', tagValue: 'platform' }, "tags.team = 'platform'"],
    [{ tagKey: 'owner/team', tagValue: "O'Reilly" }, "tags.`owner/team` = 'O''Reilly'"],
    [{ tagKey: 'empty', tagValue: '' }, "tags.empty = ''"],
    [{ sourceType: 'assembled' }, "source_type = 'assembled'"],
    [{ memberName: 'code-review' }, "member_name = 'code-review'"],
    [{ mcpMemberName: 'search' }, "mcp_member_name = 'search'"],
    [{ mcpServerName: 'com.acme/search' }, "mcp_server_name = 'com.acme/search'"],
  ];

  it.each(cases)('builds %j', (filters, expected) => {
    expect(buildAgentPluginCatalogFilterString(filters)).toBe(expected);
  });

  it.each(Object.values(AgentPluginStatus))('supports status %s', (status) => {
    expect(buildAgentPluginCatalogFilterString({ status })).toBe(`status = '${status}'`);
  });

  it('combines all filters with AND', () => {
    expect(
      buildAgentPluginCatalogFilterString({
        searchText: 'review',
        status: AgentPluginStatus.ACTIVE,
        organization: 'acme',
        tagKey: 'team',
        tagValue: 'platform',
        sourceType: 'assembled',
        memberName: 'code-review',
        mcpMemberName: 'search',
        mcpServerName: 'com.acme/search',
      }),
    ).toBe(
      [
        "search_text ILIKE '%review%'",
        "status = 'active'",
        "organization = 'acme'",
        "tags.team = 'platform'",
        "source_type = 'assembled'",
        "member_name = 'code-review'",
        "mcp_member_name = 'search'",
        "mcp_server_name = 'com.acme/search'",
      ].join(' AND '),
    );
  });

  it('escapes free-text quotes and wildcard characters', () => {
    expect(buildAgentPluginCatalogFilterString({ searchText: "O'Reilly_100%" })).toBe(
      "search_text ILIKE '%O''Reilly\\_100\\%%'",
    );
  });

  it('returns undefined without filters', () => {
    expect(buildAgentPluginCatalogFilterString()).toBeUndefined();
  });

  it('rejects incomplete tag filters and unsupported tag quoting', () => {
    expect(() => buildAgentPluginCatalogFilterString({ tagKey: 'team' })).toThrow();
    expect(() => buildAgentPluginCatalogFilterString({ tagValue: 'platform' })).toThrow();
    expect(() => buildAgentPluginCatalogFilterString({ tagKey: 'bad`key', tagValue: 'value' })).toThrow();
  });
});
