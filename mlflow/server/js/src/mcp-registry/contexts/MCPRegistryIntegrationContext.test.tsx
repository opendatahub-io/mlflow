import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { MCPRegistryIntegrationProvider, useMCPRegistryIntegration } from './MCPRegistryIntegrationContext';
import type { MCPServer, MCPServerVersion } from '../types';

const mockServer = { name: 'dev.mainline/mcp' } as MCPServer;

const Consumer = () => {
  const { renderDetailActions } = useMCPRegistryIntegration();
  return <>{renderDetailActions?.(mockServer, undefined)}</>;
};

describe('MCPRegistryIntegrationContext', () => {
  it('returns a safe default (no renderDetailActions) when no provider is present', () => {
    render(<Consumer />);
    expect(screen.queryByText('Deploy')).not.toBeInTheDocument();
  });

  it('exposes renderDetailActions supplied by the provider', () => {
    const renderDetailActions = jest.fn((server: MCPServer, _version?: MCPServerVersion) => (
      <button>{`Deploy ${server.name}`}</button>
    ));
    render(
      <MCPRegistryIntegrationProvider renderDetailActions={renderDetailActions}>
        <Consumer />
      </MCPRegistryIntegrationProvider>,
    );
    expect(screen.getByText('Deploy dev.mainline/mcp')).toBeInTheDocument();
    expect(renderDetailActions).toHaveBeenCalledWith(mockServer, undefined);
  });
});
