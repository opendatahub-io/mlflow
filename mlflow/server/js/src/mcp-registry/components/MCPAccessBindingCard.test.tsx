import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@databricks/design-system';
import { testRoute, TestRouter } from '../../common/utils/RoutingTestUtils';
import { MCPAccessBindingCard } from './MCPAccessBindingCard';
import { createMockMCPAccessBinding } from '../test-utils';
import type { MCPAccessBinding } from '../types';

const renderCard = (binding: MCPAccessBinding) =>
  render(
    <IntlProvider locale="en">
      <TestRouter
        routes={[
          testRoute(
            <DesignSystemProvider>
              <MCPAccessBindingCard binding={binding} />
            </DesignSystemProvider>,
            '/',
          ),
          testRoute(<div />, '*'),
        ]}
      />
    </IntlProvider>,
  );

describe('MCPAccessBindingCard', () => {
  it('renders server_name as title when no resolved_version', () => {
    renderCard(createMockMCPAccessBinding({ resolved_version: undefined }));
    expect(screen.getByText('io.github.test/server')).toBeInTheDocument();
  });

  it('renders resolved_version.display_name when available', () => {
    renderCard(
      createMockMCPAccessBinding({
        resolved_version: {
          name: 'io.github.test/server',
          version: '1.0.0',
          server_json: { name: 'io.github.test/server', version: '1.0.0', title: 'JSON Title' },
          display_name: 'Custom Display Name',
          status: 'active',
          aliases: [],
          tags: {},
        },
      }),
    );
    expect(screen.getByText('Custom Display Name')).toBeInTheDocument();
  });

  it('falls back to server_json.title when no display_name', () => {
    renderCard(
      createMockMCPAccessBinding({
        resolved_version: {
          name: 'io.github.test/server',
          version: '1.0.0',
          server_json: { name: 'io.github.test/server', version: '1.0.0', title: 'Filesystem Server' },
          status: 'active',
          aliases: [],
          tags: {},
        },
      }),
    );
    expect(screen.getByText('Filesystem Server')).toBeInTheDocument();
  });

  it('renders version/alias target when set', () => {
    renderCard(createMockMCPAccessBinding({ server_alias: 'production' }));
    expect(screen.getByText('production')).toBeInTheDocument();
  });

  it('renders description from resolved version', () => {
    renderCard(
      createMockMCPAccessBinding({
        resolved_version: {
          name: 'io.github.test/server',
          version: '1.0.0',
          server_json: { name: 'io.github.test/server', version: '1.0.0', description: 'A helpful tool' },
          status: 'active',
          aliases: [],
          tags: {},
        },
      }),
    );
    expect(screen.getByText('A helpful tool')).toBeInTheDocument();
  });

  it('renders without description when resolved_version has none', () => {
    renderCard(createMockMCPAccessBinding({ resolved_version: undefined }));
    expect(screen.queryByText('A helpful tool')).not.toBeInTheDocument();
  });
});
