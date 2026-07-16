import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@databricks/design-system';
import { testRoute, TestRouter } from '../../common/utils/RoutingTestUtils';
import { MCPAccessBindingListTable } from './MCPAccessBindingListTable';
import { createMockMCPAccessBinding } from '../test-utils';

const noop = () => {};

const renderTable = (props: Partial<React.ComponentProps<typeof MCPAccessBindingListTable>> = {}) =>
  render(
    <IntlProvider locale="en">
      <TestRouter
        routes={[
          testRoute(
            <DesignSystemProvider>
              <MCPAccessBindingListTable
                hasNextPage={false}
                hasPreviousPage={false}
                onNextPage={noop}
                onPreviousPage={noop}
                {...props}
              />
            </DesignSystemProvider>,
            '/',
          ),
        ]}
      />
    </IntlProvider>,
  );

describe('MCPAccessBindingListTable', () => {
  it('renders column headers', () => {
    renderTable();
    expect(screen.getByText('Endpoint')).toBeInTheDocument();
    expect(screen.getByText('MCP Server')).toBeInTheDocument();
    expect(screen.getByText('Version/Alias')).toBeInTheDocument();
    expect(screen.getByText('Transport')).toBeInTheDocument();
    expect(screen.getByText('Last updated')).toBeInTheDocument();
  });

  it('renders binding rows with data', () => {
    const bindings = [
      createMockMCPAccessBinding({
        id: 'ep-001',
        url: 'https://mcp.example.com/fs',
        server_name: 'io.test/server',
        server_version: '1.0.0',
        transport_type: 'streamable-http',
      }),
    ];
    renderTable({ bindings });
    expect(screen.getByText('https://mcp.example.com/fs')).toBeInTheDocument();
    expect(screen.getByText('1.0.0')).toBeInTheDocument();
    expect(screen.getByText('Streamable HTTP')).toBeInTheDocument();
  });

  it('renders resolved display name for MCP Server column', () => {
    const bindings = [
      createMockMCPAccessBinding({
        id: 'ep-001',
        server_name: 'io.test/raw-name',
        resolved_version: {
          name: 'io.test/raw-name',
          version: '1.0.0',
          server_json: { name: 'io.test/raw-name', version: '1.0.0', title: 'Pretty Server' },
          status: 'active',
          aliases: [],
          tags: {},
        },
      }),
    ];
    renderTable({ bindings });
    expect(screen.getByText('Pretty Server')).toBeInTheDocument();
    expect(screen.queryByText('io.test/raw-name')).not.toBeInTheDocument();
  });

  it('formats transport type', () => {
    const bindings = [createMockMCPAccessBinding({ id: 'ep-001', transport_type: 'sse' })];
    renderTable({ bindings });
    expect(screen.getByText('SSE')).toBeInTheDocument();
  });

  it('shows alias in version/alias column', () => {
    const bindings = [
      createMockMCPAccessBinding({ id: 'ep-001', server_alias: 'production', server_version: undefined }),
    ];
    renderTable({ bindings });
    expect(screen.getByText('production')).toBeInTheDocument();
  });

  it('renders empty state when no bindings and not filtered', () => {
    renderTable({ bindings: [] });
    expect(screen.getByText('Create and manage direct access endpoints for your MCP servers.')).toBeInTheDocument();
  });

  it('renders no-results state when filtered and empty', () => {
    renderTable({ bindings: [], isFiltered: true });
    expect(screen.getByText('No access bindings found')).toBeInTheDocument();
  });

  it('renders emptyStateOverride when provided', () => {
    renderTable({ bindings: [], emptyStateOverride: <div>Custom empty</div> });
    expect(screen.getByText('Custom empty')).toBeInTheDocument();
  });

  it('includes version in server detail link when binding has server_version', () => {
    const bindings = [
      createMockMCPAccessBinding({
        id: 'ep-001',
        server_name: 'io.test/server',
        server_version: '2.0.0',
      }),
    ];
    renderTable({ bindings });
    const link = screen.getByText('io.test/server').closest('a');
    expect(link?.getAttribute('href')).toContain('version=2.0.0');
  });

  it('includes resolved version in server detail link for alias bindings', () => {
    const bindings = [
      createMockMCPAccessBinding({
        id: 'ep-001',
        server_name: 'io.test/server',
        server_alias: 'production',
        server_version: undefined,
        resolved_version: {
          name: 'io.test/server',
          version: '3.0.0',
          server_json: { name: 'io.test/server', version: '3.0.0', title: 'Resolved Server' },
          status: 'active',
          aliases: [],
          tags: {},
        },
      }),
    ];
    renderTable({ bindings });
    const link = screen.getByText('Resolved Server').closest('a');
    expect(link?.getAttribute('href')).toContain('version=3.0.0');
  });

  it('server detail link has no version param when binding has neither version nor resolved_version', () => {
    const bindings = [
      createMockMCPAccessBinding({
        id: 'ep-001',
        server_name: 'io.test/server',
        server_version: undefined,
        server_alias: undefined,
      }),
    ];
    renderTable({ bindings });
    const link = screen.getByText('io.test/server').closest('a');
    expect(link?.getAttribute('href')).not.toContain('version=');
  });

  it('renders pagination controls', () => {
    const bindings = [createMockMCPAccessBinding()];
    renderTable({ bindings, hasNextPage: true });
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.getByText('Previous')).toBeInTheDocument();
  });
});
