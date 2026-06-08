import type { TagProps } from '@databricks/design-system';
import type { MCPStatus } from './types';

export const STATUS_TAG_COLOR: Record<MCPStatus, TagProps['color']> = {
  draft: 'charcoal',
  active: 'lime',
  deprecated: 'lemon',
  deleted: 'coral',
};

export const STATUS_TRANSITIONS: Record<MCPStatus, MCPStatus[]> = {
  draft: ['active', 'deleted'],
  active: ['draft', 'deprecated'],
  deprecated: ['active', 'deleted'],
  deleted: [],
};

export const resolveDisplayName = (server: { display_name?: string; name: string }): string => {
  return server.display_name || server.name;
};
