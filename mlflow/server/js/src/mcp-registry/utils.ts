import type { TagProps } from '@databricks/design-system';
import type { MCPRemoteTransportType, MCPStatus } from './types';

export const STATUS_TAG_COLOR: Record<MCPStatus, TagProps['color']> = {
  draft: 'charcoal',
  active: 'lime',
  deprecated: 'lemon',
  deleted: 'coral',
};

export const STATUS_TRANSITIONS: Record<MCPStatus, MCPStatus[]> = {
  draft: ['active', 'deleted'],
  active: ['draft', 'deprecated'],
  deprecated: ['active', 'deleted'],
  deleted: [],
};

export const emptyCenterStyles = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  minHeight: 400,
  width: '100%',
  '& > div': {
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    alignItems: 'center',
  },
};

export const MCP_QUERY_KEYS = {
  SERVERS_LIST: 'mcp_servers_list',
  SERVER: 'mcp_server',
  SERVER_VERSIONS: 'mcp_server_versions',
  SERVER_BINDINGS: 'mcp_server_bindings',
  BINDINGS_LIST: 'mcp_bindings_list',
  BINDING_DETAIL: 'mcp_binding_detail',
} as const;

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export const resolveDisplayName = (server: { display_name?: string; name: string }): string => {
  return server.display_name || server.name;
};

export const resolveVersionDisplayName = (
  version: { display_name?: string; server_json?: { title?: string } } | null | undefined,
  fallback: string,
): string => {
  return version?.display_name || version?.server_json?.title || fallback;
};

export const resolveBindingDisplayName = (binding: {
  server_name: string;
  resolved_version?: { display_name?: string; server_json?: { title?: string } } | null;
}): string => {
  return resolveVersionDisplayName(binding.resolved_version, binding.server_name);
};

const TRANSPORT_LABELS: Record<MCPRemoteTransportType, string> = {
  'streamable-http': 'Streamable HTTP',
  sse: 'SSE',
};

export const buildSearchFilterClause = (searchFilter: string | undefined, field: string): string | undefined => {
  if (!searchFilter) {
    return undefined;
  }
  const sqlKeywordPattern = /(\s+(ILIKE|LIKE|IN|IS)\s+)|=|!=|<=|>=|<|>/i;
  if (sqlKeywordPattern.test(searchFilter)) {
    return searchFilter;
  }
  return `${field} ILIKE '%${searchFilter.replace(/'/g, "''")}%'`;
};

export const isValidEndpointUrl = (url: string): boolean => {
  const trimmed = url.trim();
  if (!/^https?:\/\//.test(trimmed)) return false;
  try {
    return Boolean(new URL(trimmed).hostname);
  } catch {
    return false;
  }
};

export const formatTransportType = (transport: MCPRemoteTransportType): string => {
  return TRANSPORT_LABELS[transport] || transport;
};
