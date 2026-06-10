import { describe, it, expect } from '@jest/globals';
import {
  resolveDisplayName,
  resolveVersionDisplayName,
  resolveBindingDisplayName,
  buildSearchFilterClause,
  formatTransportType,
  isValidEndpointUrl,
  STATUS_TAG_COLOR,
  STATUS_TRANSITIONS,
} from './utils';

describe('resolveDisplayName', () => {
  it('returns display_name when set', () => {
    expect(resolveDisplayName({ display_name: 'My Server', name: 'io.test/server' })).toBe('My Server');
  });

  it('falls back to name when display_name is undefined', () => {
    expect(resolveDisplayName({ name: 'io.test/server' })).toBe('io.test/server');
  });

  it('falls back to name when display_name is empty string', () => {
    expect(resolveDisplayName({ display_name: '', name: 'io.test/server' })).toBe('io.test/server');
  });
});

describe('resolveVersionDisplayName', () => {
  it('returns version display_name first', () => {
    expect(
      resolveVersionDisplayName({ display_name: 'Custom Name', server_json: { title: 'Title' } }, 'fallback'),
    ).toBe('Custom Name');
  });

  it('falls back to server_json.title', () => {
    expect(resolveVersionDisplayName({ server_json: { title: 'JSON Title' } }, 'fallback')).toBe('JSON Title');
  });

  it('falls back to fallback when no display_name or title', () => {
    expect(resolveVersionDisplayName({ server_json: {} }, 'fallback')).toBe('fallback');
  });

  it('falls back to fallback when version is null', () => {
    expect(resolveVersionDisplayName(null, 'fallback')).toBe('fallback');
  });

  it('falls back to fallback when version is undefined', () => {
    expect(resolveVersionDisplayName(undefined, 'fallback')).toBe('fallback');
  });
});

describe('resolveBindingDisplayName', () => {
  it('uses resolved_version.display_name first', () => {
    expect(
      resolveBindingDisplayName({
        server_name: 'io.test/server',
        resolved_version: { display_name: 'Custom', server_json: { title: 'Title' } },
      }),
    ).toBe('Custom');
  });

  it('falls back to resolved_version.server_json.title', () => {
    expect(
      resolveBindingDisplayName({
        server_name: 'io.test/server',
        resolved_version: { server_json: { title: 'Title' } },
      }),
    ).toBe('Title');
  });

  it('falls back to server_name when no resolved_version', () => {
    expect(resolveBindingDisplayName({ server_name: 'io.test/server', resolved_version: null })).toBe('io.test/server');
  });
});

describe('buildSearchFilterClause', () => {
  it('returns undefined for empty filter', () => {
    expect(buildSearchFilterClause(undefined, 'name')).toBeUndefined();
    expect(buildSearchFilterClause('', 'name')).toBeUndefined();
  });

  it('wraps plain text in ILIKE clause', () => {
    expect(buildSearchFilterClause('test', 'name')).toBe("name ILIKE '%test%'");
  });

  it('uses the specified field name', () => {
    expect(buildSearchFilterClause('test', 'server_name')).toBe("server_name ILIKE '%test%'");
  });

  it('escapes single quotes in the search term', () => {
    expect(buildSearchFilterClause("it's", 'name')).toBe("name ILIKE '%it''s%'");
  });

  it('passes through explicit SQL filter syntax', () => {
    expect(buildSearchFilterClause("status = 'active'", 'name')).toBe("status = 'active'");
  });

  it('passes through ILIKE expressions', () => {
    expect(buildSearchFilterClause("name ILIKE '%foo%'", 'name')).toBe("name ILIKE '%foo%'");
  });

  it('passes through comparison operators', () => {
    expect(buildSearchFilterClause('version != 1.0', 'name')).toBe('version != 1.0');
  });
});

describe('formatTransportType', () => {
  it('formats streamable-http', () => {
    expect(formatTransportType('streamable-http')).toBe('Streamable HTTP');
  });

  it('formats sse', () => {
    expect(formatTransportType('sse')).toBe('SSE');
  });

  it('returns raw value for unknown types', () => {
    expect(formatTransportType('unknown' as any)).toBe('unknown');
  });
});

describe('STATUS_TAG_COLOR', () => {
  it('maps all statuses', () => {
    expect(STATUS_TAG_COLOR.draft).toBe('charcoal');
    expect(STATUS_TAG_COLOR.active).toBe('lime');
    expect(STATUS_TAG_COLOR.deprecated).toBe('lemon');
    expect(STATUS_TAG_COLOR.deleted).toBe('coral');
  });
});

describe('STATUS_TRANSITIONS', () => {
  it('draft can transition to active and deleted', () => {
    expect(STATUS_TRANSITIONS.draft).toEqual(['active', 'deleted']);
  });

  it('active can transition to draft and deprecated', () => {
    expect(STATUS_TRANSITIONS.active).toEqual(['draft', 'deprecated']);
  });

  it('deprecated can transition to active and deleted', () => {
    expect(STATUS_TRANSITIONS.deprecated).toEqual(['active', 'deleted']);
  });

  it('deleted has no transitions', () => {
    expect(STATUS_TRANSITIONS.deleted).toEqual([]);
  });
});

describe('isValidEndpointUrl', () => {
  it('accepts valid HTTPS URLs', () => {
    expect(isValidEndpointUrl('https://test.com')).toBe(true);
    expect(isValidEndpointUrl('https://mcp.example.com/server')).toBe(true);
    expect(isValidEndpointUrl('https://mcp.internal.example.com/filesystem')).toBe(true);
  });

  it('accepts valid HTTP URLs', () => {
    expect(isValidEndpointUrl('http://localhost:8080/path')).toBe(true);
    expect(isValidEndpointUrl('http://192.168.1.1:3000')).toBe(true);
  });

  it('rejects URLs without double slashes', () => {
    expect(isValidEndpointUrl('https:test.com')).toBe(false);
    expect(isValidEndpointUrl('http:localhost')).toBe(false);
  });

  it('rejects non-HTTP schemes', () => {
    expect(isValidEndpointUrl('ftp://test.com')).toBe(false);
    expect(isValidEndpointUrl('ws://test.com')).toBe(false);
    expect(isValidEndpointUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects non-URL strings', () => {
    expect(isValidEndpointUrl('not-a-url')).toBe(false);
    expect(isValidEndpointUrl('')).toBe(false);
    expect(isValidEndpointUrl('   ')).toBe(false);
    expect(isValidEndpointUrl('://missing-scheme.com')).toBe(false);
  });

  it('rejects URL with scheme only and no host', () => {
    expect(isValidEndpointUrl('https://')).toBe(false);
    expect(isValidEndpointUrl('http://')).toBe(false);
  });

  it('trims whitespace before validating', () => {
    expect(isValidEndpointUrl('  https://test.com  ')).toBe(true);
  });
});
