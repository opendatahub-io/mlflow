import { MCPRegistryApi } from '../api';
import { MCP_QUERY_KEYS, buildSearchFilterClause } from '../utils';
import { useCursorPaginatedQuery } from './useCursorPaginatedQuery';

export const useMCPServersListQuery = ({
  searchFilter,
  enabled,
}: { searchFilter?: string; enabled?: boolean } = {}) => {
  return useCursorPaginatedQuery({
    queryKeyPrefix: MCP_QUERY_KEYS.SERVERS_LIST,
    searchFilter,
    storageKey: 'mcp_registry.page_size',
    queryFn: ({ searchFilter: filter, pageToken, pageSize }) =>
      MCPRegistryApi.searchMCPServers({
        filter_string: buildSearchFilterClause(filter, 'display_name'),
        page_token: pageToken,
        max_results: pageSize,
      }),
    extractData: (response) => response.mcp_servers,
    enabled,
  });
};
