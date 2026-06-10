import { MCPRegistryApi } from '../api';
import { buildSearchFilterClause } from '../utils';
import { useCursorPaginatedQuery } from './useCursorPaginatedQuery';

export const useMCPAccessBindingsListQuery = ({ searchFilter }: { searchFilter?: string } = {}) => {
  return useCursorPaginatedQuery({
    queryKeyPrefix: 'mcp_bindings_list',
    searchFilter,
    storageKey: 'mcp_registry.bindings_page_size',
    queryFn: ({ searchFilter: filter, pageToken, pageSize }) =>
      MCPRegistryApi.searchMCPAccessBindingsAll({
        filter_string: buildSearchFilterClause(filter, 'server_name'),
        page_token: pageToken,
        max_results: pageSize,
      }),
    extractData: (response) => response.mcp_access_bindings,
  });
};
