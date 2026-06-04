import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@databricks/design-system';
import { MCPServerListTable } from './MCPServerListTable';
import { createMockMCPServer } from '../test-utils';

const noop = () => {};

const renderTable = (props: Partial<React.ComponentProps<typeof MCPServerListTable>> = {}) =>
  render(
    <IntlProvider locale="en">
      <DesignSystemProvider>
        <MCPServerListTable
          hasNextPage={false}
          hasPreviousPage={false}
          onNextPage={noop}
          onPreviousPage={noop}
          {...props}
        />
      </DesignSystemProvider>
    </IntlProvider>,
  );

describe('MCPServerListTable', () => {
  it('renders column headers', () => {
    renderTable();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Last modified')).toBeInTheDocument();
  });

  it('renders server rows with display name and description', () => {
    const servers = [
      createMockMCPServer({
        name: 'io.github.test/server-a',
        display_name: 'Server A',
        description: 'A test server',
        last_updated_timestamp: 1620000000000,
      }),
      createMockMCPServer({
        name: 'io.github.test/server-b',
        display_name: 'Server B',
        description: 'Another test server',
      }),
    ];
    renderTable({ servers });
    expect(screen.getByText('Server A')).toBeInTheDocument();
    expect(screen.getByText('A test server')).toBeInTheDocument();
    expect(screen.getByText('Server B')).toBeInTheDocument();
    expect(screen.getByText('Another test server')).toBeInTheDocument();
  });

  it('falls back to name when display_name is absent', () => {
    const servers = [createMockMCPServer({ name: 'io.github.test/raw-name', display_name: undefined })];
    renderTable({ servers });
    expect(screen.getByText('io.github.test/raw-name')).toBeInTheDocument();
  });

  it('does not render data rows when loading', () => {
    renderTable({ isLoading: true, servers: [] });
    expect(screen.queryByText('Server A')).not.toBeInTheDocument();
  });

  it('renders empty state when no servers and not filtered', () => {
    renderTable({ servers: [] });
    expect(screen.getByText('Create and manage MCP servers using MLflow.')).toBeInTheDocument();
  });

  it('renders no-results state when filtered and empty', () => {
    renderTable({ servers: [], isFiltered: true });
    expect(screen.getByText('No servers found')).toBeInTheDocument();
  });

  it('renders server name in the table row', () => {
    const servers = [createMockMCPServer({ name: 'test', display_name: 'My Server' })];
    renderTable({ servers });
    expect(screen.getByText('My Server')).toBeInTheDocument();
  });

  it('renders pagination controls', () => {
    const servers = [createMockMCPServer()];
    renderTable({ servers, hasNextPage: true });
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.getByText('Previous')).toBeInTheDocument();
  });
});
