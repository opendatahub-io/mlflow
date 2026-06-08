import { useMutation, useQueryClient } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { MCPRegistryApi } from '../api';
import type { MCPStatus } from '../types';

export const useUpdateMCPServerVersionStatus = (serverName: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ version, status }: { version: string; status: MCPStatus }) =>
      MCPRegistryApi.updateMCPServerVersion(serverName, version, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries(['mcp_server', serverName]);
      queryClient.invalidateQueries(['mcp_server_versions', serverName]);
      queryClient.invalidateQueries(['mcp_servers_list']);
    },
  });
};

export const useDeleteMCPServerVersion = (serverName: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (version: string) => MCPRegistryApi.deleteMCPServerVersion(serverName, version),
    onSuccess: () => {
      queryClient.invalidateQueries(['mcp_server', serverName]);
      queryClient.invalidateQueries(['mcp_server_versions', serverName]);
      queryClient.invalidateQueries(['mcp_servers_list']);
    },
  });
};

export const useDeleteMCPServer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => MCPRegistryApi.deleteMCPServer(name),
    onSuccess: () => {
      queryClient.invalidateQueries(['mcp_servers_list']);
    },
  });
};
