import { useEffect, useRef } from 'react';
import { useLocation, matchPath } from '../../common/utils/RoutingUtils';
import { useMCPServerQuery } from '../../mcp-registry/hooks/useMCPServerDetailQuery';
import { resolveDisplayName } from '../../mcp-registry/utils';
import type { BreadcrumbSegment } from '../const';

interface McpRegistryBreadcrumbReporterProps {
  onBreadcrumbChange?: (segments: BreadcrumbSegment[]) => void;
}

const MCP_REGISTRY_CRUMB: BreadcrumbSegment = { label: 'MCP Registry', path: '/' };

/**
 * Build breadcrumb segments from the current pathname.
 *
 * Structure:
 *   Server list   -> [] (empty)
 *   Server detail -> [MCP Registry (link), display-name (active)]
 *
 * The basename-relative `pathname` (as reported by `useLocation`) is used
 * verbatim for the `path` field so encoded characters -- e.g. a server name
 * containing a literal `/` encoded as `%2F` -- survive intact. Rebuilding
 * the path from `rawServerName` (whose value is already decoded by
 * `matchPath`) would collapse `%2F` back into `/` and produce a path that no
 * longer matches the single-segment `:serverName` route. `displayName` (when
 * resolved) is used for the label instead of the raw server key.
 */
const buildSegments = (
  pathname: string,
  rawServerName: string | undefined,
  displayName: string | undefined,
): BreadcrumbSegment[] => {
  if (pathname === '/' || pathname === '' || !rawServerName) {
    return [];
  }
  return [MCP_REGISTRY_CRUMB, { label: displayName ?? decodeURIComponent(rawServerName), path: pathname }];
};

export const McpRegistryBreadcrumbReporter: React.FC<McpRegistryBreadcrumbReporterProps> = ({ onBreadcrumbChange }) => {
  const { pathname } = useLocation();
  const serverDetailMatch = matchPath('/:serverName', pathname);
  const rawServerName = (serverDetailMatch?.params as { serverName?: string } | undefined)?.serverName;
  const decodedServerName = rawServerName ? decodeURIComponent(rawServerName) : undefined;

  // Reuses the same query (and cache entry) the detail page itself fetches,
  // so this doesn't trigger an extra network request in practice.
  const { data: server } = useMCPServerQuery(decodedServerName ?? '');
  const displayName = server ? resolveDisplayName(server) : undefined;

  const prevJsonRef = useRef<string>('');

  // Report on every pathname change immediately (using the raw server key as
  // a fallback label) rather than waiting for the display name to resolve.
  // This callback also drives the host's route sync (see useHostRouteSync in
  // the host package) -- delaying it here would delay the host's entire
  // full-screen breakout transition until the network round-trip completes,
  // producing a much longer flash of stale chrome than the brief label
  // flicker this would otherwise avoid. The label itself updates in a
  // follow-up call once the display name resolves.
  useEffect(() => {
    if (!onBreadcrumbChange) return;

    const segments = buildSegments(pathname, rawServerName, displayName);
    const json = JSON.stringify(segments);
    if (json !== prevJsonRef.current) {
      prevJsonRef.current = json;
      onBreadcrumbChange(segments);
    }
  }, [pathname, rawServerName, displayName, onBreadcrumbChange]);

  return null;
};
