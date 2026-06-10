import { useMutation, useQueryClient } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { MCPRegistryApi } from '../api';
import type { MCPStatus } from '../types';
import { MCP_QUERY_KEYS } from '../utils';

const useInvalidateServerQueries = () => {
  const queryClient = useQueryClient();
  return (serverName: string) => {
    queryClient.invalidateQueries([MCP_QUERY_KEYS.SERVER, serverName]);
    queryClient.invalidateQueries([MCP_QUERY_KEYS.SERVER_VERSIONS, serverName]);
    queryClient.invalidateQueries([MCP_QUERY_KEYS.SERVER_BINDINGS, serverName]);
    queryClient.invalidateQueries([MCP_QUERY_KEYS.SERVERS_LIST]);
    queryClient.invalidateQueries([MCP_QUERY_KEYS.BINDINGS_LIST]);
  };
};

export const useUpdateMCPServerVersionStatus = (serverName: string) => {
  const invalidate = useInvalidateServerQueries();

  return useMutation<unknown, Error, { version: string; status: MCPStatus }>({
    mutationFn: ({ version, status }) => MCPRegistryApi.updateMCPServerVersion(serverName, version, { status }),
    onSuccess: () => invalidate(serverName),
  });
};

export const useDeleteMCPServerVersion = (serverName: string) => {
  const invalidate = useInvalidateServerQueries();

  return useMutation<unknown, Error, string>({
    mutationFn: (version) => MCPRegistryApi.deleteMCPServerVersion(serverName, version),
    onSuccess: () => invalidate(serverName),
  });
};

export const useDeleteMCPServer = () => {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, string>({
    mutationFn: (name) => MCPRegistryApi.deleteMCPServer(name),
    onSuccess: () => {
      queryClient.invalidateQueries([MCP_QUERY_KEYS.SERVERS_LIST]);
      queryClient.invalidateQueries([MCP_QUERY_KEYS.BINDINGS_LIST]);
    },
  });
};
