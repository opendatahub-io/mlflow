import {
  RegistryStatus as SkillStatus,
  RegistryAction as SkillAction,
  type RegistryAuditFields,
  type RegistryIcon,
  type RegistrySearchParams,
} from '../common/registryTypes';

export { SkillStatus, SkillAction };
export type { RegistryIcon };

export type SkillRequestSourceType = 'git' | 'oci' | 'zip';
export type SkillSourceType = SkillRequestSourceType | 'mlflow';
export type CreateSkillVersionStatus = SkillStatus.ACTIVE | SkillStatus.DRAFT;

export interface SkillAlias {
  alias: string;
  version: number;
}

export type SkillTags = Record<string, string>;

export type SkillAuditFields = RegistryAuditFields;

export interface Skill extends SkillAuditFields {
  name: string;
  organization: string;
  description: string | null;
  icons: RegistryIcon[] | null;
  status: SkillStatus | null;
  latest_version: number | null;
  source_type?: SkillSourceType | null;
  aliases: SkillAlias[];
  tags: SkillTags;
  allowed_actions?: SkillAction[];
}

export interface SkillVersion extends SkillAuditFields {
  name: string;
  version: number;
  organization: string;
  source_type: SkillSourceType | null;
  source: string | null;
  ref: string | null;
  subpath: string | null;
  digest: string | null;
  status: SkillStatus;
  aliases: string[];
  tags: SkillTags;
}

interface SkillVersionRequestBase {
  subpath?: string | null;
  digest?: string | null;
  status?: CreateSkillVersionStatus;
}

interface ExternalSkillVersionRequestBase extends SkillVersionRequestBase {
  source: string;
}

export interface InferredSkillVersionRequest extends ExternalSkillVersionRequestBase {
  source_type?: null;
  ref?: string | null;
}

export interface GitSkillVersionRequest extends ExternalSkillVersionRequestBase {
  source_type: 'git';
  ref?: string | null;
}

export interface OCIOrZipSkillVersionRequest extends ExternalSkillVersionRequestBase {
  source_type: 'oci' | 'zip';
  ref?: never;
}

export type ExternalSkillVersionRequest =
  | InferredSkillVersionRequest
  | GitSkillVersionRequest
  | OCIOrZipSkillVersionRequest;

export interface UploadedSkillVersionRequest extends SkillVersionRequestBase {
  source?: null;
  source_type?: never;
  ref?: never;
}

export type CreateSkillVersionRequest = ExternalSkillVersionRequest | UploadedSkillVersionRequest;

interface RegisterSkillIdentity {
  name: string;
  organization?: string;
}

export type RegisterExternalSkillRequest = ExternalSkillVersionRequest & RegisterSkillIdentity;
export type RegisterUploadedSkillRequest = UploadedSkillVersionRequest & RegisterSkillIdentity;
export type RegisterSkillRequest = RegisterExternalSkillRequest | RegisterUploadedSkillRequest;

export interface CreateSkillRequest {
  name: string;
  organization?: string;
  description?: string;
  icons?: RegistryIcon[];
}

export interface UpdateSkillRequest {
  description?: string | null;
  icons?: RegistryIcon[] | null;
}

export interface UpdateSkillVersionStatusRequest {
  status?: SkillStatus | null;
}

export interface SetSkillTagRequest {
  key: string;
  value: string;
}

export interface SetSkillAliasRequest {
  alias: string;
  version: number;
}

export type SearchSkillsParams = RegistrySearchParams;

export type SearchSkillVersionsParams = SearchSkillsParams;

export interface SearchSkillsResponse {
  skills: Skill[];
  next_page_token: string | null;
}

export interface SearchSkillVersionsResponse {
  skill_versions: SkillVersion[];
  next_page_token: string | null;
}

export type GetSkillResponse = Skill;
export type GetSkillVersionResponse = SkillVersion;
export type RegisterSkillResponse = SkillVersion;
export type ResolveSkillAliasResponse = SkillVersion;
export type UpdateSkillResponse = Skill;
export type UpdateSkillVersionStatusResponse = SkillVersion;
export type SkillMutationResponse = Record<string, never>;
