import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@databricks/design-system';
import { testRoute, TestRouter } from '../../common/utils/RoutingTestUtils';
import { MCPServerAccessBindings } from './MCPServerAccessBindings';
import { createMockMCPAccessBinding } from '../test-utils';

const noop = () => {};

const renderComponent = (props: Partial<React.ComponentProps<typeof MCPServerAccessBindings>> = {}) =>
  render(
    <IntlProvider locale="en">
      <TestRouter
        routes={[
          testRoute(
            <DesignSystemProvider>
              <MCPServerAccessBindings onAddBinding={noop} onEditBinding={noop} onDeleteBinding={noop} {...props} />
            </DesignSystemProvider>,
            '/',
          ),
        ]}
      />
    </IntlProvider>,
  );

describe('MCPServerAccessBindings', () => {
  it('renders binding cards when bindings provided', () => {
    const bindings = [
      createMockMCPAccessBinding({
        id: 'ep-001',
        url: 'https://mcp.example.com/alpha',
        transport_type: 'streamable-http',
      }),
      createMockMCPAccessBinding({
        id: 'ep-002',
        url: 'https://mcp.example.com/beta',
        transport_type: 'sse',
      }),
    ];
    renderComponent({ bindings });
    expect(screen.getByText('https://mcp.example.com/alpha')).toBeInTheDocument();
    expect(screen.getByText('https://mcp.example.com/beta')).toBeInTheDocument();
  });

  it('shows empty message when no bindings', () => {
    renderComponent({ bindings: [] });
    expect(screen.getByText('No access bindings configured for this server.')).toBeInTheDocument();
  });

  it('shows loading spinner when loading', () => {
    renderComponent({ isLoading: true });
    expect(screen.queryByText('No access bindings configured for this server.')).not.toBeInTheDocument();
    // The Databricks Spinner renders with this class
    expect(document.querySelector('.du-bois-light-spin')).toBeInTheDocument();
  });

  it('shows error alert when error provided', () => {
    renderComponent({ error: new Error('Something went wrong') });
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('edit callback fires on Edit link click', async () => {
    const onEditBinding = jest.fn();
    const binding = createMockMCPAccessBinding({
      id: 'ep-001',
      url: 'https://mcp.example.com/alpha',
    });
    renderComponent({ bindings: [binding], onEditBinding });

    await userEvent.click(screen.getByText('Edit'));
    expect(onEditBinding).toHaveBeenCalledWith(binding);
  });

  it('delete callback fires on delete icon click', async () => {
    const onDeleteBinding = jest.fn();
    const binding = createMockMCPAccessBinding({
      id: 'ep-001',
      url: 'https://mcp.example.com/alpha',
    });
    renderComponent({ bindings: [binding], onDeleteBinding });

    const deleteButton = screen.getByRole('button', { name: 'Delete access binding' });
    await userEvent.click(deleteButton);
    expect(onDeleteBinding).toHaveBeenCalledWith(binding);
  });
});
