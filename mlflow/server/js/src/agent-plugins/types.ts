import {
  RegistryStatus as AgentPluginStatus,
  RegistryAction as AgentPluginAction,
  type RegistryAuditFields,
  type RegistryIcon,
  type RegistrySearchParams,
} from '../common/registryTypes';
import type { MCPAccessEndpointPayload } from '../mcp-registry/types';
import type { SkillVersion } from '../skill-registry/types';

export { AgentPluginStatus, AgentPluginAction };

export enum AgentPluginSourceType {
  Git = 'git',
  OCI = 'oci',
  Zip = 'zip',
  MLflow = 'mlflow',
  Assembled = 'assembled',
}
export type AgentPluginStoredSourceType = `${AgentPluginSourceType}`;
export type AgentPluginRequestSourceType = Exclude<AgentPluginStoredSourceType, 'mlflow' | 'assembled'>;
export type CreateAgentPluginVersionStatus = AgentPluginStatus.ACTIVE | AgentPluginStatus.DRAFT;

// Plugin
export type AgentPluginAuditFields = RegistryAuditFields;

export type AgentPlugin = AgentPluginAuditFields & {
  name: string;
  organization: string;
  description: string | null;
  icons: RegistryIcon[] | null;
  workspace?: string | null;
  status: AgentPluginStatus | null;
  tags: Record<string, string>;
  aliases: AgentPluginAlias[];
  latest_version: string | null;
  allowed_actions?: AgentPluginAction[];
};

export type CreateAgentPluginRequest = {
  name: string;
  organization?: string; // Defaults to ''
  description?: string | null;
  icons?: RegistryIcon[] | null;
};

export type UpdateAgentPluginRequest = {
  description?: string | null;
  icons?: RegistryIcon[] | null;
};

export type SearchAgentPluginsParams = RegistrySearchParams;

export type DeleteAgentPluginParams = {
  cascade?: boolean; // Defaults to false
};

export type SearchAgentPluginsResponse = {
  agent_plugins: AgentPlugin[];
  next_page_token: string | null;
};

// Plugin Version
export type AgentPluginVersion = AgentPluginAuditFields & {
  name: string;
  organization: string;
  version: string;
  plugin_json: PluginJSONPayload & { version: string };
  source: string | null;
  source_type: AgentPluginStoredSourceType | null;
  ref: string | null;
  subpath: string | null;

  status: AgentPluginStatus;
  status_reason: string | null;
  tags: Record<string, string>;
  skills: string[];
  mcp_servers: Record<string, AgentPluginMCPReference>;
  aliases: string[];
  workspace?: string | null;
};

export type SearchAgentPluginVersionsParams = SearchAgentPluginsParams;

export type DeleteAgentPluginVersionParams = {
  status_reason?: string;
};

export type UpdateAgentPluginVersionRequest = {
  status?: AgentPluginStatus | null;
  status_reason?: string | null;
};

export type CreateAgentPluginVersionRequest = {
  version?: string | null;
  plugin_json?: PluginJSONPayload | null;
  skills?: string[] | null;
  mcp_servers?: Record<string, MCPAccessEndpointPayload>;
  source_type?: AgentPluginRequestSourceType | null;
  source?: string | null;
  ref?: string | null;
  subpath?: string | null;
  status?: AgentPluginStatus; // Defaults to active; lifecycle validation applies
  status_reason?: string | null;
};

export type UploadedAgentPluginVersionRequest = {
  source?: null;
  source_type?: never;
  ref?: never;

  subpath?: string | null;
  digest?: string | null;
  status?: AgentPluginStatus;
};

export type RegisterAgentPluginRequest = CreateAgentPluginVersionRequest & {
  name?: string | null;
  organization?: string;
};

export type SearchAgentPluginVersionsResponse = {
  agent_plugin_versions: AgentPluginVersion[];
  next_page_token: string | null;
};

// Aliases
export type AgentPluginAlias = {
  alias: string;
  version: string;
};

export type SetAgentPluginTagRequest = {
  key: string;
  value: string;
};

export type SetAgentPluginAliasRequest = {
  alias: string;
  version: string;
};

// Sources
export type GitSource = {
  url: string;
  ref?: string | null;
  subpath?: string | null;
};

export type OCISource = {
  image: string;
  subpath?: string | null;
};

export type ZIPSource = {
  url: string;
  subpath?: string | null;
};

export type MLflowSource = {
  artifact_path: string;
  subpath?: string | null;
};

// Misc.
type MemberSkillDefinition = {
  name: string;
  subpath: string;
  description?: string | null;
  digest?: string | null;
};

export type ImportRegisterRequest = {
  plugin_json: PluginJSONPayload;
  version?: string | null;
  organization?: string;
  member_skills?: MemberSkillDefinition[];
  mcp_servers?: Record<string, MCPAccessEndpointPayload>;
  source_type?: AgentPluginRequestSourceType | null;
  source?: string | null;
  ref?: string | null;
  subpath?: string | null;
  status?: AgentPluginStatus;
  status_reason?: string | null;
};

export type ImportRegisterResponse = {
  plugin_version: AgentPluginVersion;
  member_skill_versions: SkillVersion[];
};

export type PluginJSONPayload = {
  $schema: string;
  name: string;
  version?: string | null;
  description?: string | null;
  author?: Record<string, string> | null;
  homepage?: string | null;
  repository?: string | null;
  license?: string | null;
  keywords?: string[] | null;
  extensions?: unknown;
  [key: string]: unknown;
};

export type AgentPluginMutationResponse = Record<string, never>;

export type AgentPluginMCPReference = {
  endpoint_id: string;
};
