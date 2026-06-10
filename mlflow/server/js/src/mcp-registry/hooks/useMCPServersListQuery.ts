import { MCPRegistryApi } from '../api';
import { buildSearchFilterClause } from '../utils';
import { useCursorPaginatedQuery } from './useCursorPaginatedQuery';

export const useMCPServersListQuery = ({ searchFilter }: { searchFilter?: string } = {}) => {
  return useCursorPaginatedQuery({
    queryKeyPrefix: 'mcp_servers_list',
    searchFilter,
    storageKey: 'mcp_registry.page_size',
    queryFn: ({ searchFilter: filter, pageToken, pageSize }) =>
      MCPRegistryApi.searchMCPServers({
        filter_string: buildSearchFilterClause(filter, 'name'),
        page_token: pageToken,
        max_results: pageSize,
      }),
    extractData: (response) => response.mcp_servers,
  });
};
