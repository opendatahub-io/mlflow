import { useMutation, useQueryClient } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { MCPRegistryApi } from '../api';
import type { CreateMCPAccessBindingRequest, MCPAccessBinding, UpdateMCPAccessBindingRequest } from '../types';
import { MCP_QUERY_KEYS } from '../utils';

export const useCreateAccessBindingMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<MCPAccessBinding, Error, { serverName: string; request: CreateMCPAccessBindingRequest }>({
    mutationFn: ({ serverName, request }) => MCPRegistryApi.createMCPAccessBinding(serverName, request),
    onSuccess: (_data, { serverName }) => {
      queryClient.invalidateQueries([MCP_QUERY_KEYS.BINDINGS_LIST]);
      queryClient.invalidateQueries([MCP_QUERY_KEYS.SERVER_BINDINGS, serverName]);
      queryClient.invalidateQueries([MCP_QUERY_KEYS.SERVER, serverName]);
    },
  });
};

export const useUpdateAccessBindingMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<
    MCPAccessBinding,
    Error,
    { serverName: string; bindingId: number; request: UpdateMCPAccessBindingRequest }
  >({
    mutationFn: ({ serverName, bindingId, request }) =>
      MCPRegistryApi.updateMCPAccessBinding(serverName, bindingId, request),
    onSuccess: (_data, { serverName }) => {
      queryClient.invalidateQueries([MCP_QUERY_KEYS.BINDINGS_LIST]);
      queryClient.invalidateQueries([MCP_QUERY_KEYS.SERVER_BINDINGS, serverName]);
      queryClient.invalidateQueries([MCP_QUERY_KEYS.SERVER, serverName]);
    },
  });
};
