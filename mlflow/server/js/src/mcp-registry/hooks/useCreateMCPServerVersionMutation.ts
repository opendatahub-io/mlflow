import { useMutation, useQueryClient } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { MCPRegistryApi } from '../api';
import type { MCPServerVersion, MCPStatus, MCPTool, ServerJSONPayload } from '../types';

type CreateMCPServerVersionPayload = {
  serverJson: ServerJSONPayload;
  displayName?: string;
  isNewServer?: boolean;
  status?: MCPStatus;
  source?: string;
  tools?: MCPTool[];
  tags?: Record<string, string>;
};

export const useCreateMCPServerVersionMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<MCPServerVersion, Error, CreateMCPServerVersionPayload>({
    mutationFn: async ({ serverJson, displayName, isNewServer, status, source, tools, tags }) => {
      const name = serverJson.name;
      const version = await MCPRegistryApi.createMCPServerVersion(name, {
        server_json: serverJson,
        status,
        source,
        tools,
      });

      if (isNewServer) {
        const serverDisplayName = displayName || serverJson.title;
        if (serverDisplayName || serverJson.description) {
          await MCPRegistryApi.updateMCPServer(name, {
            display_name: serverDisplayName || undefined,
            description: serverJson.description || undefined,
          });
        }
      }

      if (tags) {
        await Promise.all(
          Object.entries(tags).map(([key, value]) => MCPRegistryApi.setMCPServerTag(name, { key, value })),
        );
      }

      return version;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['mcp_servers_list']);
    },
  });
};
