import { useQuery } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { MCPRegistryApi } from '../api';
import type { MCPServer, SearchMCPServerVersionsResponse, SearchMCPAccessBindingsResponse } from '../types';

export const useMCPServerQuery = (name: string) => {
  return useQuery<MCPServer, Error>(['mcp_server', name], {
    queryFn: () => MCPRegistryApi.getMCPServer(name),
    retry: false,
    enabled: Boolean(name),
  });
};

export const useMCPServerVersionsQuery = (name: string) => {
  const queryResult = useQuery<SearchMCPServerVersionsResponse, Error>(['mcp_server_versions', name], {
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
  const queryResult = useQuery<SearchMCPAccessBindingsResponse, Error>(['mcp_server_bindings', name], {
    queryFn: () => MCPRegistryApi.searchMCPAccessBindings(name),
    retry: false,
    enabled: Boolean(name),
  });

  return {
    ...queryResult,
    data: queryResult.data?.mcp_access_bindings,
  };
};
