import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@databricks/design-system';
import { MCPServerVersionCompare } from './MCPServerVersionCompare';
import { createMockMCPServerVersion } from '../test-utils';

const v1 = createMockMCPServerVersion({
  version: '1',
  status: 'active',
  server_json: { name: 'test', version: '1.0', title: 'Version 1', description: 'First version' },
  tags: { env: 'prod' },
});
const v2 = createMockMCPServerVersion({
  version: '2',
  status: 'draft',
  server_json: { name: 'test', version: '2.0', title: 'Version 2', description: 'Second version' },
  tags: {},
});

const renderCompare = (props: Partial<React.ComponentProps<typeof MCPServerVersionCompare>> = {}) =>
  render(
    <IntlProvider locale="en">
      <DesignSystemProvider>
        <MCPServerVersionCompare
          baselineVersion={v1}
          comparedVersion={v2}
          serverName="test"
          aliasesByVersion={{}}
          onSwitchSides={jest.fn()}
          {...props}
        />
      </DesignSystemProvider>
    </IntlProvider>,
  );

describe('MCPServerVersionCompare', () => {
  it('renders comparing heading with version numbers', () => {
    renderCompare();
    expect(screen.getByText(/Comparing version 1 with version 2/)).toBeInTheDocument();
  });

  it('renders status tags for both versions', () => {
    renderCompare();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
  });

  it('renders JSON content for both versions', () => {
    renderCompare();
    expect(screen.getByText(/"version": "1.0"/)).toBeInTheDocument();
  });

  it('calls onSwitchSides when switch button is clicked', async () => {
    const onSwitchSides = jest.fn();
    renderCompare({ onSwitchSides });
    await userEvent.click(screen.getByRole('button', { name: /Switch sides/ }));
    expect(onSwitchSides).toHaveBeenCalledTimes(1);
  });

  it('renders Empty fallback when baseline has no server_json', () => {
    const emptyVersion = createMockMCPServerVersion({
      version: '0',
      server_json: undefined as any,
    });
    renderCompare({ baselineVersion: emptyVersion });
    expect(screen.getByText('Empty')).toBeInTheDocument();
  });

  it('renders metadata tags when present', () => {
    renderCompare();
    expect(screen.getByText('env')).toBeInTheDocument();
  });
});
