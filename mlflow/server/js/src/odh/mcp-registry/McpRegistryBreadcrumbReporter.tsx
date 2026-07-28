import { useEffect, useRef } from 'react';
import { useLocation, matchPath } from '../../common/utils/RoutingUtils';
import type { BreadcrumbSegment } from '../const';

interface McpRegistryBreadcrumbReporterProps {
  onBreadcrumbChange?: (segments: BreadcrumbSegment[]) => void;
}

const buildSegments = (pathname: string): BreadcrumbSegment[] => {
  if (pathname === '/' || pathname === '') {
    return [];
  }

  const serverDetailMatch = matchPath('/:serverName', pathname);
  if (serverDetailMatch) {
    const { serverName } = serverDetailMatch.params as { serverName: string };
    return [{ label: decodeURIComponent(serverName), path: `/${serverName}` }];
  }

  return [];
};

export const McpRegistryBreadcrumbReporter: React.FC<McpRegistryBreadcrumbReporterProps> = ({ onBreadcrumbChange }) => {
  const { pathname } = useLocation();
  const prevJsonRef = useRef<string>('');

  useEffect(() => {
    if (!onBreadcrumbChange) return;
    const segments = buildSegments(pathname);
    const json = JSON.stringify(segments);
    if (json !== prevJsonRef.current) {
      prevJsonRef.current = json;
      onBreadcrumbChange(segments);
    }
  }, [pathname, onBreadcrumbChange]);

  return null;
};
