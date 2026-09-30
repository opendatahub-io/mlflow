import { beforeEach, describe, expect, it } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import { rest } from 'msw';
import { QueryClient, QueryClientProvider } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { getAjaxUrl } from '@mlflow/mlflow/src/common/utils/FetchUtils';
import { setupServer } from '../../../../common/utils/setup-msw';
import { usePromptsListQuery } from './usePromptsListQuery';

const requests: URLSearchParams[] = [];

setupServer(
  rest.get(getAjaxUrl('ajax-api/2.0/mlflow/registered-models/search'), (req, res, ctx) => {
    requests.push(req.url.searchParams);
    return res(
      ctx.json({
        registered_models: [{ name: 'prompt1', latest_versions: [{ version: 1, tags: [] }] }],
        next_page_token: req.url.searchParams.get('page_token') ? undefined : 'PAGE_2',
      }),
    );
  }),
);

const renderHookWithClient = <TResult, TProps>(hook: (props: TProps) => TResult, initialProps: TProps) => {
  const queryClient = new QueryClient();
  return renderHook(hook, {
    initialProps,
    wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });
};

describe('usePromptsListQuery', () => {
  beforeEach(() => {
    requests.length = 0;
  });

  it('resets pagination when the model filter changes', async () => {
    const initialProps: { modelFilter?: string } = { modelFilter: undefined };
    const { result, rerender } = renderHookWithClient((props) => usePromptsListQuery(props), initialProps);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.hasPreviousPage).toBe(false);

    act(() => result.current.onNextPage());
    await waitFor(() => expect(result.current.hasPreviousPage).toBe(true));

    rerender({ modelFilter: 'gpt-4o' });
    await waitFor(() => expect(result.current.hasPreviousPage).toBe(false));
  });

  it('requests the first page with the escaped model filter clause', async () => {
    const initialProps: { modelFilter?: string } = { modelFilter: undefined };
    const { result, rerender } = renderHookWithClient((props) => usePromptsListQuery(props), initialProps);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.onNextPage());
    await waitFor(() => expect(result.current.hasPreviousPage).toBe(true));

    // An apostrophe in the model name must be doubled so the filter clause stays well-formed.
    rerender({ modelFilter: "gpt-4o's" });

    await waitFor(() =>
      expect(requests[requests.length - 1]?.get('filter')).toContain(`model_config.model_name = 'gpt-4o''s'`),
    );
    // The filtered query must start from the beginning, not reuse the previous result set's cursor.
    expect(requests[requests.length - 1].get('page_token')).toBeNull();
  });
});
