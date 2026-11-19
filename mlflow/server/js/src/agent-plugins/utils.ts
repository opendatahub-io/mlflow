import { buildSearchFilterClause } from '../common/utils/SearchUtils';
import type { AgentPluginStatus, AgentPluginStoredSourceType, AgentPluginVersion } from './types';

type AgentPluginIdentity = {
  name: string;
  organization: string;
};

type AgentPluginReference = AgentPluginIdentity & {
  version?: string;
  alias?: string;
};

const validateIdentitySegment = (value: string): string => {
  if (
    value.length > 64 ||
    value !== value.trim() ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value) ||
    value.includes('--') ||
    value.includes('..')
  ) {
    throw new Error(`Invalid agent plugin identity segment: ${value}`);
  }
  return value;
};

export const formatAgentPluginIdentity = (name: string, organization = ''): string => {
  validateIdentitySegment(name);
  if (organization) validateIdentitySegment(organization);
  return organization ? `@${organization}/${name}` : name;
};

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const parseAgentPluginIdentityKey = (identity: string): AgentPluginIdentity => {
  const decoded = safeDecode(identity);
  if (!decoded.startsWith('@')) {
    return { name: decoded, organization: '' };
  }
  const slash = decoded.indexOf('/');
  if (slash === -1) {
    return { name: '', organization: decoded.slice(1) };
  }
  return { name: decoded.slice(slash + 1), organization: decoded.slice(1, slash) };
};

export const parseAgentPluginRouteParams = (params: {
  agentPluginKey?: string;
  organization?: string;
  agentPluginName?: string;
}): AgentPluginIdentity => {
  if (params.agentPluginKey) {
    return parseAgentPluginIdentityKey(params.agentPluginKey);
  }
  return {
    name: safeDecode(params.agentPluginName ?? ''),
    organization: safeDecode(params.organization ?? '').replace(/^@/, ''),
  };
};

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const parseSemVer = (version: string) => {
  const match = SEMVER.exec(version);
  const prerelease = match?.[4]?.split('.') ?? [];
  if (version.length > 128 || !match || match[0] !== version || prerelease.some((part) => /^0\d+$/.test(part))) {
    throw new Error(`Invalid agent plugin version: ${version}`);
  }
  return { core: [match[1], match[2], match[3]], prerelease };
};

const compareText = (left: string, right: string): number => (left === right ? 0 : left < right ? -1 : 1);

const compareNumericIdentifiers = (left: string, right: string): number =>
  left.length - right.length || compareText(left, right);

export const compareAgentPluginVersionStrings = (left: string, right: string): number => {
  const a = parseSemVer(left);
  const b = parseSemVer(right);
  for (let index = 0; index < 3; index++) {
    const result = compareNumericIdentifiers(a.core[index], b.core[index]);
    if (result !== 0) return result;
  }
  if (!a.prerelease.length || !b.prerelease.length) {
    return Number(!a.prerelease.length) - Number(!b.prerelease.length);
  }
  for (let index = 0; index < Math.min(a.prerelease.length, b.prerelease.length); index++) {
    const first = a.prerelease[index];
    const second = b.prerelease[index];
    const firstNumeric = /^\d+$/.test(first);
    const secondNumeric = /^\d+$/.test(second);
    const result =
      firstNumeric && secondNumeric
        ? compareNumericIdentifiers(first, second)
        : firstNumeric !== secondNumeric
          ? firstNumeric
            ? -1
            : 1
          : compareText(first, second);
    if (result !== 0) return result;
  }
  return a.prerelease.length - b.prerelease.length;
};

export const orderAgentPluginVersions = (versions: readonly AgentPluginVersion[]): AgentPluginVersion[] =>
  [...versions].sort(
    (left, right) =>
      compareAgentPluginVersionStrings(right.version, left.version) ||
      (right.creation_timestamp ?? 0) - (left.creation_timestamp ?? 0),
  );

const validateAlias = (alias: string): string => {
  if (!alias || alias.length > 256 || /[/\\@#?\s%]/.test(alias)) {
    throw new Error(`Invalid agent plugin URI alias: ${alias}`);
  }
  return alias;
};

export const formatAgentPluginUri = (
  name: string,
  organization = '',
  selector: { version?: string; alias?: string } = {},
): string => {
  if (selector.version !== undefined && selector.alias !== undefined) {
    throw new Error('Specify a version or alias, not both');
  }
  const identity = formatAgentPluginIdentity(name, organization);
  if (selector.version !== undefined) {
    parseSemVer(selector.version);
    return `agent-plugins:/${identity}/${selector.version}`;
  }
  return selector.alias === undefined
    ? `agent-plugins:/${identity}`
    : `agent-plugins:/${identity}@${validateAlias(selector.alias)}`;
};

export const parseAgentPluginUri = (uri: string): AgentPluginReference => {
  const match = /^agent-plugins:\/(?:@([^/]+)\/)?([^/@]+)(?:\/([^/@]+)|@([^/@]+))?$/.exec(uri);
  if (!match) throw new Error(`Invalid agent plugin URI: ${uri}`);
  const [, organization = '', name, version, alias] = match;
  formatAgentPluginIdentity(name, organization);
  if (version !== undefined) {
    parseSemVer(version);
    return { name, organization, version };
  }
  return alias === undefined ? { name, organization } : { name, organization, alias: validateAlias(alias) };
};

export type AgentPluginCatalogFilters = {
  searchText?: string;
  status?: AgentPluginStatus;
  organization?: string;
  tagKey?: string;
  tagValue?: string;
  sourceType?: AgentPluginStoredSourceType;
  memberName?: string;
  mcpMemberName?: string;
  mcpServerName?: string;
};

const equalsClause = (field: string, value: string | undefined): string | undefined =>
  value === undefined ? undefined : `${field} = '${value.replace(/'/g, "''")}'`;

const tagIdentifier = (key: string): string => {
  if (!key || key.includes('`') || [...key].some((character) => character.charCodeAt(0) < 32)) {
    throw new Error('Unsupported tag key in filter');
  }
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? `tags.${key}` : `tags.\`${key}\``;
};

export const buildAgentPluginCatalogFilterString = (filters: AgentPluginCatalogFilters = {}): string | undefined => {
  let tagClause: string | undefined;
  if (filters.tagKey !== undefined) {
    if (filters.tagValue === undefined) throw new Error('Tag filters require both key and value');
    tagClause = equalsClause(tagIdentifier(filters.tagKey), filters.tagValue);
  } else if (filters.tagValue !== undefined) {
    throw new Error('Tag filters require both key and value');
  }
  const clauses = [
    buildSearchFilterClause(filters.searchText?.trim(), 'search_text', { allowQuotedFirstSegment: true }),
    equalsClause('status', filters.status),
    equalsClause('organization', filters.organization),
    tagClause,
    equalsClause('source_type', filters.sourceType),
    equalsClause('member_name', filters.memberName),
    equalsClause('mcp_member_name', filters.mcpMemberName),
    equalsClause('mcp_server_name', filters.mcpServerName),
  ].filter((clause): clause is string => clause !== undefined);
  return clauses.length ? clauses.join(' AND ') : undefined;
};
