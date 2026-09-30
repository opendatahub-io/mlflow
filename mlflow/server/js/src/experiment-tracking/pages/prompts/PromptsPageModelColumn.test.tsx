import { jest, describe, it, expect } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { rest } from 'msw';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@databricks/design-system';
import { QueryClientProvider, QueryClient } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { getAjaxUrl } from '@mlflow/mlflow/src/common/utils/FetchUtils';
import { setupServer } from '../../../common/utils/setup-msw';
import { testRoute, TestRouter } from '../../../common/utils/RoutingTestUtils';
import PromptsPage from './PromptsPage';
import { PROMPT_MODEL_CONFIG_TAG_KEY } from './utils';

// eslint-disable-next-line no-restricted-syntax
jest.setTimeout(30000); // increase timeout due to heavier use of tables, modals and forms

const getMockedPromptsWithModelConfigResponse = () =>
  rest.get(getAjaxUrl('ajax-api/2.0/mlflow/registered-models/search'), (req, res, ctx) =>
    res(
      ctx.json({
        registered_models: [
          {
            name: 'prompt1',
            last_updated_timestamp: 1620000000000,
            tags: [{ key: 'some_tag', value: 'abc' }],
            latest_versions: [
              {
                version: 3,
                tags: [
                  {
                    key: PROMPT_MODEL_CONFIG_TAG_KEY,
                    value: JSON.stringify({ provider: 'openai', model_name: 'gpt-4' }),
                  },
                ],
              },
            ],
          },
          {
            name: 'prompt2',
            last_updated_timestamp: 1620000000000,
            tags: [{ key: 'another_tag', value: 'xyz' }],
            latest_versions: [{ version: 5 }],
          },
        ],
      }),
    ),
  );

describe('PromptsPage associated model column', () => {
  setupServer(getMockedPromptsWithModelConfigResponse());

  const renderTestComponent = () => {
    const queryClient = new QueryClient();
    render(<PromptsPage />, {
      wrapper: ({ children }) => (
        <IntlProvider locale="en">
          <TestRouter
            routes={[
              testRoute(
                <DesignSystemProvider>
                  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
                </DesignSystemProvider>,
                '/',
              ),
              testRoute(<div />, '*'),
            ]}
            initialEntries={['/']}
          />
        </IntlProvider>
      ),
    });
  };

  it('should render Model column with model name and placeholder', async () => {
    renderTestComponent();
    await waitFor(() => {
      expect(screen.getByText('Model')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('gpt-4')).toBeInTheDocument();
    });

    expect(screen.getByText('-')).toBeInTheDocument();
  });
});
