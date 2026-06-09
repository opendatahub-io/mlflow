import type { TagProps } from '@databricks/design-system';
import type { MCPStatus, ServerJSONPayload } from './types';

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

export interface ServerJsonValidationResult {
  valid: boolean;
  error?: string;
  parsed?: ServerJSONPayload;
}

export const validateServerJson = (value: string): ServerJsonValidationResult => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return { valid: false, error: 'Server definition is required' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { valid: false, error: 'Invalid JSON format in server configuration' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { valid: false, error: 'Server configuration must be a JSON object' };
  }

  const obj = parsed as Record<string, unknown>;

  if (!obj['name'] || typeof obj['name'] !== 'string') {
    return { valid: false, error: 'Server configuration must include a "name" field' };
  }

  if (!obj['version'] || typeof obj['version'] !== 'string') {
    return { valid: false, error: 'Server configuration must include a "version" field' };
  }

  return { valid: true, parsed: obj as ServerJSONPayload };
};

export const validateToolsJson = (value: string): { valid: boolean; error?: string; parsed?: unknown[] } => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return { valid: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { valid: false, error: 'Invalid JSON format in tools configuration' };
  }

  if (!Array.isArray(parsed)) {
    return { valid: false, error: 'Tools must be a JSON array' };
  }

  for (let i = 0; i < parsed.length; i++) {
    const tool = parsed[i];
    if (typeof tool !== 'object' || tool === null || Array.isArray(tool)) {
      return { valid: false, error: `Tool at index ${i} must be a JSON object` };
    }
    if (!(tool as Record<string, unknown>)['name'] || typeof (tool as Record<string, unknown>)['name'] !== 'string') {
      return { valid: false, error: `Tool at index ${i} must have a "name" field` };
    }
  }

  return { valid: true, parsed: parsed as unknown[] };
};
