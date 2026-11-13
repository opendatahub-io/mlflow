import type { MCPAccessEndpoint, MCPAccessEndpointPayload } from '../mcp-registry/types';
import type { RegistryIcon, SkillStatus, SkillVersion } from '../skill-registry/types';

export enum AgentPluginStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
  DELETED = 'deleted',
}

export enum AgentPluginSourceType {
  Git = 'git',
  OCI = 'oci',
  Zip = 'zip',
}
export type CreateAgentPluginVersionStatus = AgentPluginStatus.ACTIVE | AgentPluginStatus.DRAFT;

export type AgentPluginAuditFields = {
  created_by: string | null;
  last_updated_by: string | null;
  creation_timestamp: number | null;
  last_updated_timestamp: number | null;
};

export type AgentPlugin = AgentPluginAuditFields & {
  name: string;
  organization: string;
  description?: string | null;
  icons: [RegistryIcon] | null;
  workspace: string | null;
  status: SkillStatus | null;
  tags: Record<string, string>;
  aliases: Record<string, string>;
  latest_version: string | null;
};

export type AgentPluginVersion = AgentPluginAuditFields & {
  name: string;
  organization: string;
  plugin_json: Record<string, any>;
  source: GitSource | OCISource | ZIPSource | MLflowSource | null;
  source_type: AgentPluginSourceType | null;

  status: SkillStatus;
  status_reason: string | null;
  tags: Record<string, string>;
  skills: string[];
  mcp_servers: Record<string, MCPAccessEndpoint>;
  aliases: string[];
  workspace: string | null;
};

export type SearchAgentPluginsParams = {
  filter_string?: string;
  max_results?: number;
  order_by?: string[];
  page_token?: string;
};

export type SearchAgentPluginVersionsParams = SearchAgentPluginsParams;

export type DeleteAgentPluginParams = {
  cascade?: boolean; // Defaults to false
};

export type DeleteAgentPluginVersionParams = {
  status_reason?: string;
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

export type UpdateAgentPluginVersionRequest = {
  status?: AgentPluginStatus | null;
  status_reason?: string | null;
};

export type CreateAgentPluginVersionRequest = {
  version?: string | null;
  plugin_json?: PluginJSONPayload | null;
  skills?: string[] | null;
  mcp_servers?: Record<string, MCPAccessEndpointPayload>;
  source_type?: AgentPluginSourceType | null;
  source?: string | null;
  ref?: string | null;
  subpath?: string | null;
  status?: SkillStatus; // Defaults to active; lifecycle validation applies
  status_reason?: string | null;
};

export type RegisterAgentPluginRequest = CreateAgentPluginVersionRequest & {
  name?: string | null;
  organization?: string | null;
};

export type UploadedAgentPluginVersionRequest = {
  source?: null;
  source_type?: never;
  ref?: never;

  subpath?: string | null;
  digest?: string | null;
  status?: AgentPluginStatus;
};

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
  source_type?: AgentPluginSourceType | null;
  source?: string | null;
  ref?: string | null;
  subpath?: string | null;
  status?: SkillStatus;
  status_reason?: string | null;
};

export type ImportRegisterResponse = {
  plugin_version: AgentPluginVersion;
  member_skill_versions: SkillVersion[];
};

type PluginJSONPayload = {
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

export type SearchAgentPluginsResponse = {
  agent_plugins: AgentPlugin[];
  next_page_token: string | null;
};

export type SearchAgentPluginVersionsResponse = {
  agent_plugin_versions: AgentPluginVersion[];
  next_page_token: string | null;
};

type AgentPluginRequestBase = {
  subpath?: string | null;
  digest?: string | null;
  status?: CreateAgentPluginVersionStatus;
};

// agent plugin version register requests

// type RegisterAgentPluginIdentity = {
//   name: string;
//   organization?: string;
// };
//
// type ExternalAgentPluginVersionRequestBase = AgentPluginRequestBase & {
//   source: string;
// };
//
// type InferredAgentPluginVersionRequest = ExternalAgentPluginVersionRequestBase & {
//   source_type?: null;
//   ref?: string | null;
// };
//
// type GitAgentPluginVersionRequest = ExternalAgentPluginVersionRequestBase & {
//   source_type: AgentPluginSourceType.Git;
//   ref?: string | null;
// };
//
// type OCIOrZipAgentPluginVersionRequest = ExternalAgentPluginVersionRequestBase & {
//   source_type: AgentPluginSourceType.OCI | AgentPluginSourceType.Zip;
//   ref?: never;
// };
//
// export type ExternalAgentPluginVersionRequest =
//   | InferredAgentPluginVersionRequest
//   | GitAgentPluginVersionRequest
//   | OCIOrZipAgentPluginVersionRequest;
//
// export type RegisterExternalAgentPluginRequest = ExternalAgentPluginVersionRequest & RegisterAgentPluginIdentity;
// export type RegisterUploadedAgentPluginRequest = UploadedAgentPluginVersionRequest & RegisterAgentPluginIdentity;
// export type RegisterAgentPluginRequest = RegisterExternalAgentPluginRequest | RegisterUploadedAgentPluginRequest;
//
// sources

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

export type SetAgentPluginTagRequest = {
  key: string;
  value: string;
};

export type SetAgentPluginAliasRequest = {
  alias: string;
  version: string;
};

export type AgentPluginMutationResponse = Record<string, never>;
