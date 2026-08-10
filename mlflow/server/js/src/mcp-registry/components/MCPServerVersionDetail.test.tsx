import { beforeEach, describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@databricks/design-system';
import { QueryClient, QueryClientProvider } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';

import { MCPServerVersionDetail } from './MCPServerVersionDetail';
import { createMockMCPServer, createMockMCPServerVersion } from '../test-utils';
import { MCPStatus, type TransportType } from '../types';
import { isIntegrated } from '../../common/utils/embedUtils';
import { MCPRegistryIntegrationProvider } from '../contexts/MCPRegistryIntegrationContext';
import type { MCPRegistryIntegrationContextValue } from '../contexts/MCPRegistryIntegrationContext';

jest.mock('../hooks/useServerState', () => ({
  useServerState: jest.fn(),
}));

// Defaults to standalone mode (false); individual tests opt into federated/integrated mode.
jest.mock('../../common/utils/embedUtils', () => ({
  ...jest.requireActual<Record<string, unknown>>('../../common/utils/embedUtils'),
  isIntegrated: jest.fn(() => false),
}));
const mockedIsIntegrated = jest.mocked(isIntegrated);

jest.mock('../hooks/useAddAccessEndpointModal', () => ({
  useAddAccessEndpointModal: () => ({ AddAccessEndpointModal: null, openAddEndpoint: jest.fn() }),
}));

jest.mock('../hooks/useEditAccessEndpointModal', () => ({
  useEditAccessEndpointModal: () => ({ EditAccessEndpointModal: null, openEditEndpoint: jest.fn() }),
}));

jest.mock('../hooks/useDeleteAccessEndpointModal', () => ({
  useDeleteAccessEndpointModal: () => ({ DeleteAccessEndpointModal: null, openDeleteEndpoint: jest.fn() }),
}));

jest.mock('../hooks/useDeleteVersionModal', () => ({
  useDeleteVersionModal: () => ({ DeleteVersionModal: null, openDeleteVersionModal: jest.fn() }),
}));

jest.mock('../hooks/useMCPServerVersionMutations', () => ({
  useUpdateMCPServerVersion: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useServerState } = require('../hooks/useServerState') as {
  useServerState: jest.Mock;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useUpdateMCPServerVersion } = require('../hooks/useMCPServerVersionMutations') as {
  useUpdateMCPServerVersion: jest.Mock;
};

const mockPermissions = ({ canUpdate = false, canDelete = false } = {}) => {
  useServerState.mockReturnValue({
    canUpdate,
    canDelete,
    canManage: false,
    isDimmed: false,
    showVisibilityControls: false,
    isAuthAvailable: true,
  });
};

const mockUpdateVersionMutation = (overrides = {}) => {
  const mutation = {
    mutate: jest.fn(),
    reset: jest.fn(),
    isLoading: false,
    error: null,
    ...overrides,
  };
  useUpdateMCPServerVersion.mockReturnValue(mutation);
  return mutation;
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <IntlProvider locale="en">
      <DesignSystemProvider>{children}</DesignSystemProvider>
    </IntlProvider>
  </QueryClientProvider>
);

const serverWithRemotes = createMockMCPServer({ name: 'io.github.test/server' });
const versionWithRemotes = createMockMCPServerVersion({
  server_json: {
    name: 'io.github.test/server',
    version: '1.0.0',
    remotes: [{ type: 'streamable-http' as TransportType, url: 'https://mcp.example.com' }],
  },
});

const versionWithoutRemotes = createMockMCPServerVersion({
  server_json: {
    name: 'io.github.test/server',
    version: '1.0.0',
  },
});

const versionTwo = createMockMCPServerVersion({
  version: '2',
  server_json: {
    name: 'io.github.test/server',
    version: '2.0.0',
  },
});

const renderDetail = (props: Partial<React.ComponentProps<typeof MCPServerVersionDetail>> = {}) =>
  render(
    <Wrapper>
      <MCPServerVersionDetail
        server={serverWithRemotes}
        version={versionWithRemotes}
        aliasesByVersion={{}}
        {...props}
      />
    </Wrapper>,
  );

const renderDetailWithIntegration = (
  props: Partial<React.ComponentProps<typeof MCPServerVersionDetail>> = {},
  renderDetailActions?: MCPRegistryIntegrationContextValue['renderDetailActions'],
) =>
  render(
    <Wrapper>
      <MCPRegistryIntegrationProvider renderDetailActions={renderDetailActions}>
        <MCPServerVersionDetail
          server={serverWithRemotes}
          version={versionWithRemotes}
          aliasesByVersion={{}}
          {...props}
        />
      </MCPRegistryIntegrationProvider>
    </Wrapper>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateVersionMutation();
  mockedIsIntegrated.mockReturnValue(false);
});

describe('Auto-discover tools button', () => {
  const clickToolsTab = async () => {
    await userEvent.click(screen.getByRole('tab', { name: /tools/i }));
  };

  it('visible when remotes exist and no auth (canUpdate defaults true)', async () => {
    mockPermissions({ canUpdate: true });
    renderDetail();
    await clickToolsTab();
    expect(screen.getByText('Auto-discover tools')).toBeInTheDocument();
  });

  it('visible when remotes exist and user has UPDATE permission', async () => {
    mockPermissions({ canUpdate: true });
    renderDetail();
    await clickToolsTab();
    expect(screen.getByText('Auto-discover tools')).toBeInTheDocument();
  });

  it('hidden when remotes exist but user lacks UPDATE permission', async () => {
    mockPermissions({ canUpdate: false });
    renderDetail();
    await clickToolsTab();
    expect(screen.queryByText('Auto-discover tools')).toBeNull();
  });

  it('hidden when no remotes', async () => {
    mockPermissions({ canUpdate: true });
    renderDetail({ version: versionWithoutRemotes });
    await clickToolsTab();
    expect(screen.queryByText('Auto-discover tools')).toBeNull();
  });
});

describe('Status editor', () => {
  it('keeps optimistic status until the selected version status refetches', async () => {
    mockPermissions({ canUpdate: true });
    const mutate = jest.fn((_payload, options: { onSuccess?: () => void; onError?: () => void }) => {
      options.onSuccess?.();
    });
    mockUpdateVersionMutation({ mutate });
    const activeVersion = createMockMCPServerVersion({ status: MCPStatus.ACTIVE });
    const deprecatedVersion = createMockMCPServerVersion({ status: MCPStatus.DEPRECATED });
    const { rerender } = renderDetail({ version: activeVersion });

    await userEvent.click(screen.getByLabelText('Edit version status'));
    await userEvent.click(await screen.findByRole('option', { name: 'Deprecated' }));

    expect(mutate).toHaveBeenCalledWith(
      { version: activeVersion.version, status: MCPStatus.DEPRECATED },
      { onError: expect.any(Function) },
    );
    expect(screen.getByText(MCPStatus.DEPRECATED)).toBeInTheDocument();

    rerender(
      <Wrapper>
        <MCPServerVersionDetail server={serverWithRemotes} version={activeVersion} aliasesByVersion={{}} />
      </Wrapper>,
    );
    expect(screen.getByText(MCPStatus.DEPRECATED)).toBeInTheDocument();

    rerender(
      <Wrapper>
        <MCPServerVersionDetail server={serverWithRemotes} version={deprecatedVersion} aliasesByVersion={{}} />
      </Wrapper>,
    );
    expect(screen.getByText(MCPStatus.DEPRECATED)).toBeInTheDocument();
  });

  it('closes when the selected version changes', async () => {
    mockPermissions({ canUpdate: true });
    const { rerender } = renderDetail();

    await userEvent.click(screen.getByLabelText('Edit version status'));
    expect(screen.getByRole('combobox', { name: 'Version status' })).toBeInTheDocument();

    rerender(
      <Wrapper>
        <MCPServerVersionDetail server={serverWithRemotes} version={versionTwo} aliasesByVersion={{}} />
      </Wrapper>,
    );

    expect(screen.queryByRole('combobox', { name: 'Version status' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Edit version status')).toBeInTheDocument();
  });
});

describe('host-provided detail actions (renderDetailActions)', () => {
  it('renders host-provided actions next to the version heading when integrated', async () => {
    mockPermissions();
    mockedIsIntegrated.mockReturnValue(true);
    renderDetailWithIntegration({}, (server, version) => (
      <button>{`Deploy ${server.name}@${version?.version ?? 'latest'}`}</button>
    ));
    expect(
      await screen.findByText(`Deploy ${serverWithRemotes.name}@${versionWithRemotes.version}`),
    ).toBeInTheDocument();
  });

  it('does not invoke renderDetailActions when standalone (not integrated)', () => {
    mockPermissions();
    mockedIsIntegrated.mockReturnValue(false);
    const renderDetailActions = jest.fn(() => <button>Deploy</button>);
    renderDetailWithIntegration({}, renderDetailActions);
    expect(screen.queryByText('Deploy')).not.toBeInTheDocument();
    expect(renderDetailActions).not.toHaveBeenCalled();
  });

  it('does not invoke renderDetailActions when no version is selected, even when integrated', () => {
    mockPermissions();
    mockedIsIntegrated.mockReturnValue(true);
    const renderDetailActions = jest.fn(() => <button>Deploy</button>);
    renderDetailWithIntegration({ version: undefined }, renderDetailActions);
    expect(screen.getByText('Select a version to view details.')).toBeInTheDocument();
    expect(screen.queryByText('Deploy')).not.toBeInTheDocument();
    expect(renderDetailActions).not.toHaveBeenCalled();
  });

  it('isolates a throwing renderDetailActions instead of crashing the version detail view', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockPermissions();
    mockedIsIntegrated.mockReturnValue(true);
    renderDetailWithIntegration({}, () => {
      throw new Error('boom from host-provided renderDetailActions');
    });
    expect(await screen.findByText(`Viewing version ${versionWithRemotes.version}`)).toBeInTheDocument();
    expect(screen.queryByText('boom from host-provided renderDetailActions')).not.toBeInTheDocument();
    consoleErrorSpy.mockRestore();
  });
});
