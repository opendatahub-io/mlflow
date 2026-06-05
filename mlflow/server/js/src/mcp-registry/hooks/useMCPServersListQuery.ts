import type { QueryFunctionContext } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { useQuery } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { useCallback, useRef, useState } from 'react';
import { MCPRegistryApi } from '../api';
import type { SearchMCPServersResponse } from '../types';

type MCPServersListQueryKey = ['mcp_servers_list', { searchFilter?: string; pageToken?: string }];

const buildSearchFilterClause = (searchFilter?: string): string | undefined => {
  if (!searchFilter) {
    return undefined;
  }

  // Match existing MLflow list UIs: allow explicit filter syntax, otherwise treat
  // the input as a simple name search.
  const sqlKeywordPattern = /(\s+(ILIKE|LIKE|IN|IS)\s+)|=|!=|<=|>=|<|>/i;
  if (sqlKeywordPattern.test(searchFilter)) {
    return searchFilter;
  }

  return `name ILIKE '%${searchFilter.replace(/'/g, "''")}%'`;
};

const queryFn = ({ queryKey }: QueryFunctionContext<MCPServersListQueryKey>) => {
  const [, { searchFilter, pageToken }] = queryKey;
  return MCPRegistryApi.searchMCPServers({
    filter_string: buildSearchFilterClause(searchFilter),
    page_token: pageToken,
  });
};

export const useMCPServersListQuery = ({ searchFilter }: { searchFilter?: string } = {}) => {
  const previousPageTokens = useRef<(string | undefined)[]>([]);
  const [currentPageToken, setCurrentPageToken] = useState<string | undefined>(undefined);

  const queryResult = useQuery<SearchMCPServersResponse, Error, SearchMCPServersResponse, MCPServersListQueryKey>(
    ['mcp_servers_list', { searchFilter, pageToken: currentPageToken }],
    {
      queryFn,
      retry: false,
      keepPreviousData: true,
    },
  );

  const onNextPage = useCallback(() => {
    previousPageTokens.current.push(currentPageToken);
    setCurrentPageToken(queryResult.data?.next_page_token ?? undefined);
  }, [queryResult.data?.next_page_token, currentPageToken]);

  const onPreviousPage = useCallback(() => {
    const previousPageToken = previousPageTokens.current.pop();
    setCurrentPageToken(previousPageToken);
  }, []);

  return {
    data: queryResult.data?.mcp_servers,
    error: queryResult.error ?? undefined,
    isLoading: queryResult.isLoading,
    hasNextPage: queryResult.data?.next_page_token !== undefined,
    hasPreviousPage: Boolean(currentPageToken),
    onNextPage,
    onPreviousPage,
    refetch: queryResult.refetch,
  };
};
