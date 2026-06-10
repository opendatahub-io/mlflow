import { useQuery } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { MCPRegistryApi } from '../api';
import type { MCPServer, SearchMCPServerVersionsResponse, SearchMCPAccessBindingsResponse } from '../types';
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
    queryFn: () => MCPRegistryApi.searchMCPServerVersions(name),
    retry: false,
    enabled: Boolean(name),
  });

  return {
    ...queryResult,
    data: queryResult.data?.mcp_server_versions,
  };
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
