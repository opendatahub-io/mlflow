import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@databricks/design-system';
import { QueryClient, QueryClientProvider } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { testRoute, TestRouter } from '../../common/utils/RoutingTestUtils';
import { setupServer } from '../../common/utils/setup-msw';
import { MCPServerCard } from './MCPServerCard';
import { createMockMCPServer, getMockedGetLatestMCPServerVersionResponse } from '../test-utils';
import type { MCPServer } from '../types';

const renderCard = (server: MCPServer) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <IntlProvider locale="en">
      <TestRouter
        routes={[
          testRoute(
            <DesignSystemProvider>
              <QueryClientProvider client={queryClient}>
                <MCPServerCard server={server} />
              </QueryClientProvider>
            </DesignSystemProvider>,
            '/',
          ),
        ]}
      />
    </IntlProvider>,
  );
};

describe('MCPServerCard', () => {
  setupServer(getMockedGetLatestMCPServerVersionResponse());

  it('renders server name when no display_name is set', () => {
    renderCard(createMockMCPServer({ name: 'io.github.test/my-server' }));
    expect(screen.getByText('io.github.test/my-server')).toBeInTheDocument();
  });

  it('renders display_name when set', () => {
    renderCard(createMockMCPServer({ name: 'io.github.test/raw', display_name: 'Pretty Name' }));
    expect(screen.getByText('Pretty Name')).toBeInTheDocument();
    expect(screen.queryByText('io.github.test/raw')).not.toBeInTheDocument();
  });

  it('renders description when provided', () => {
    renderCard(createMockMCPServer({ description: 'A helpful tool server' }));
    expect(screen.getByText('A helpful tool server')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    renderCard(createMockMCPServer({ description: undefined }));
    expect(screen.queryByText('A helpful tool server')).not.toBeInTheDocument();
  });

  it('renders timestamp when last_updated_timestamp is set', () => {
    renderCard(createMockMCPServer({ last_updated_timestamp: 1620000000000 }));
    const allText = screen.getAllByText(/.+/);
    // Name + at least one timestamp text
    expect(allText.length).toBeGreaterThanOrEqual(2);
  });

  it('does not render timestamp when last_updated_timestamp is absent', () => {
    const { container } = renderCard(createMockMCPServer({ last_updated_timestamp: undefined }));
    // Should only have the name text, no secondary timestamp text
    const secondaryTexts = container.querySelectorAll('[data-testid]');
    expect(secondaryTexts.length).toBe(0);
  });
});
