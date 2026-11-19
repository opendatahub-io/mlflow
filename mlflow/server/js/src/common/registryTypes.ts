export enum RegistryStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
  DELETED = 'deleted',
}

export enum RegistryAction {
  USE = 'USE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  MANAGE = 'MANAGE',
}

export type RegistryIcon = {
  src: string;
  sizes?: string[];
  mimeType?: string;
  theme?: string;
};

export type RegistryAuditFields = {
  created_by: string | null;
  last_updated_by: string | null;
  creation_timestamp: number | null;
  last_updated_timestamp: number | null;
};

export type RegistrySearchParams = {
  filter_string?: string;
  max_results?: number;
  order_by?: string[];
  page_token?: string;
};
