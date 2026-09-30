import type { QueryFunctionContext } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { useQuery } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RegisteredPrompt, RegisteredPromptsListResponse } from '../types';
import { RegisteredPromptsApi } from '../api';

const FETCH_ALL_PAGE_SIZE = 1000;

const queryFn = async ({ queryKey }: QueryFunctionContext<PromptsListQueryKey>) => {
  const [, { searchFilter, pageToken, experimentId, modelFilter, fetchAllPages }] = queryKey;

  if (!fetchAllPages) {
    return RegisteredPromptsApi.listRegisteredPrompts(searchFilter, pageToken, experimentId, modelFilter);
  }
  const registered_models: RegisteredPrompt[] = [];
  let nextPageToken: string | undefined = undefined;

  do {
    const response: RegisteredPromptsListResponse = await RegisteredPromptsApi.listRegisteredPrompts(
      searchFilter,
      nextPageToken,
      experimentId,
      modelFilter,
      FETCH_ALL_PAGE_SIZE,
    );
    registered_models.push(...(response.registered_models ?? []));
    nextPageToken = response.next_page_token;
  } while (nextPageToken);

  return { registered_models };
};

type PromptsListQueryKey = [
  'prompts_list',
  {
    searchFilter?: string;
    pageToken?: string;
    experimentId?: string;
    modelFilter?: string;
    fetchAllPages?: boolean;
  },
];

export const usePromptsListQuery = ({
  searchFilter,
  experimentId,
  modelFilter,
  fetchAllPages = false,
}: {
  searchFilter?: string;
  experimentId?: string;
  modelFilter?: string;
  fetchAllPages?: boolean;
} = {}) => {
  const previousPageTokens = useRef<(string | undefined)[]>([]);

  const [currentPageToken, setCurrentPageToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    previousPageTokens.current = [];
    setCurrentPageToken(undefined);
  }, [searchFilter, experimentId, modelFilter]);

  const queryResult = useQuery<
    RegisteredPromptsListResponse,
    Error,
    RegisteredPromptsListResponse,
    PromptsListQueryKey
  >(['prompts_list', { searchFilter, pageToken: currentPageToken, experimentId, modelFilter, fetchAllPages }], {
    queryFn,
    retry: false,
  });

  const onNextPage = useCallback(() => {
    previousPageTokens.current.push(currentPageToken);
    setCurrentPageToken(queryResult.data?.next_page_token);
  }, [queryResult.data?.next_page_token, currentPageToken]);

  const onPreviousPage = useCallback(() => {
    const previousPageToken = previousPageTokens.current.pop();
    setCurrentPageToken(previousPageToken);
  }, []);

  return {
    data: queryResult.data?.registered_models,
    error: queryResult.error ?? undefined,
    isLoading: queryResult.isLoading,
    hasNextPage: queryResult.data?.next_page_token !== undefined,
    hasPreviousPage: Boolean(currentPageToken),
    onNextPage,
    onPreviousPage,
    refetch: queryResult.refetch,
  };
};
