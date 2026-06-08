import type { QueryFunctionContext } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { useQuery } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalStorage } from '@databricks/web-shared/hooks';
import type { CursorPaginationProps } from '@databricks/design-system';
import { MCPRegistryApi } from '../api';
import type { SearchMCPServersResponse } from '../types';

const DEFAULT_PAGE_SIZE = 25;
const STORE_KEY = 'mcp_registry.page_size';

type MCPServersListQueryKey = ['mcp_servers_list', { searchFilter?: string; pageToken?: string; pageSize: number }];

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
  const [, { searchFilter, pageToken, pageSize }] = queryKey;
  return MCPRegistryApi.searchMCPServers({
    filter_string: buildSearchFilterClause(searchFilter),
    page_token: pageToken,
    max_results: pageSize,
  });
};

export const useMCPServersListQuery = ({ searchFilter }: { searchFilter?: string } = {}) => {
  const previousPageTokens = useRef<(string | undefined)[]>([]);
  const [currentPageToken, setCurrentPageToken] = useState<string | undefined>(undefined);

  const [pageSize, setPageSize] = useLocalStorage({
    key: STORE_KEY,
    version: 0,
    initialValue: DEFAULT_PAGE_SIZE,
  });

  useEffect(() => {
    setCurrentPageToken(undefined);
    previousPageTokens.current = [];
  }, [searchFilter]);

  const pageSizeSelect: CursorPaginationProps['pageSizeSelect'] = {
    options: [10, 25, 50, 100],
    default: pageSize,
    onChange(newPageSize) {
      setPageSize(newPageSize);
      setCurrentPageToken(undefined);
      previousPageTokens.current = [];
    },
  };

  const queryResult = useQuery<SearchMCPServersResponse, Error, SearchMCPServersResponse, MCPServersListQueryKey>(
    ['mcp_servers_list', { searchFilter, pageToken: currentPageToken, pageSize }],
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
    hasNextPage: Boolean(queryResult.data?.next_page_token),
    hasPreviousPage: Boolean(currentPageToken),
    onNextPage,
    onPreviousPage,
    pageSizeSelect,
    refetch: queryResult.refetch,
  };
};
