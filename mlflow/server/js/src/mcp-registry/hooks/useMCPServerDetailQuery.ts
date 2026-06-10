import { useQuery } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { MCPRegistryApi } from '../api';
import type {
  MCPAccessBinding,
  MCPServer,
  MCPServerVersion,
  SearchMCPServerVersionsResponse,
  SearchMCPAccessBindingsResponse,
} from '../types';
import { MCP_QUERY_KEYS } from '../utils';


export const useMCPServerQuery = (name: string) => {
  return useQuery<MCPServer, Error>([MCP_QUERY_KEYS.SERVER, name], {
    queryFn: () => MCPRegistryApi.getMCPServer(name),
    retry: false,
    enabled: Boolean(name),
  });
};

export const useMCPServerVersionsQuery = (name: string) => {
  const queryResult = useQuery<SearchMCPServerVersionsResponse, Error>([MCP_QUERY_KEYS.SERVER_VERSIONS, name], {
    queryFn: () => MCPRegistryApi.searchMCPServerVersions(name, { order_by: ['created_at DESC'] }),
    retry: false,
    enabled: Boolean(name),
  });

  return {
    ...queryResult,
    data: queryResult.data?.mcp_server_versions,
  };
};

export const useLatestMCPServerVersionQuery = (name: string) => {
  return useQuery<MCPServerVersion | undefined, Error>(['mcp_server_latest_version', name], {
    queryFn: async () => {
      try {
        return await MCPRegistryApi.getLatestMCPServerVersion(name);
      } catch {
        return undefined;
      }
    },
    retry: false,
    enabled: Boolean(name),
  });
};

export const useMCPAccessBindingQuery = (serverName: string, bindingId: string) => {
  return useQuery<MCPAccessBinding, Error>([MCP_QUERY_KEYS.BINDING_DETAIL, serverName, bindingId], {
    queryFn: () => MCPRegistryApi.getMCPAccessBinding(serverName, Number(bindingId)),
    retry: false,
    enabled: Boolean(serverName && bindingId),
  });
};

export const useMCPAccessBindingsQuery = (name: string) => {
  const queryResult = useQuery<SearchMCPAccessBindingsResponse, Error>([MCP_QUERY_KEYS.SERVER_BINDINGS, name], {
    queryFn: () => MCPRegistryApi.searchMCPAccessBindings(name),
    retry: false,
    enabled: Boolean(name),
  });

  return {
    ...queryResult,
    data: queryResult.data?.mcp_access_bindings,
  };
};
