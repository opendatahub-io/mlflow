import { MCPRegistryApi } from '../api';
import { MCP_QUERY_KEYS, buildSearchFilterClause } from '../utils';
import { useCursorPaginatedQuery } from './useCursorPaginatedQuery';

export const useMCPAccessBindingsListQuery = ({
  searchFilter,
  enabled,
}: { searchFilter?: string; enabled?: boolean } = {}) => {
  return useCursorPaginatedQuery({
    queryKeyPrefix: MCP_QUERY_KEYS.BINDINGS_LIST,
    searchFilter,
    storageKey: 'mcp_registry.bindings_page_size',
    queryFn: ({ searchFilter: filter, pageToken, pageSize }) =>
      MCPRegistryApi.searchMCPAccessBindingsAll({
        filter_string: buildSearchFilterClause(filter, 'server_name'),
        page_token: pageToken,
        max_results: pageSize,
      }),
    extractData: (response) => response.mcp_access_endpoints,
    enabled,
  });
};
