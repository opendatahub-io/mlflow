import { useEffect, useRef } from 'react';
import { useLocation, matchPath } from '../../common/utils/RoutingUtils';
import type { BreadcrumbSegment } from '../const';

interface PromptBreadcrumbReporterProps {
  onBreadcrumbChange?: (segments: BreadcrumbSegment[]) => void;
}

const PROMPTS_CRUMB: BreadcrumbSegment = { label: 'Prompts', path: '/prompts' };

const buildSegments = (pathname: string): BreadcrumbSegment[] => {
  if (pathname === '/' || pathname === '/prompts' || pathname === '') {
    return [];
  }

  const promptDetailMatch = matchPath('/prompts/:promptName', pathname);
  if (promptDetailMatch) {
    const { promptName } = promptDetailMatch.params as { promptName: string };
    return [PROMPTS_CRUMB, { label: decodeURIComponent(promptName), path: `/prompts/${promptName}` }];
  }
  return [];
};

export const PromptBreadcrumbReporter: React.FC<PromptBreadcrumbReporterProps> = ({ onBreadcrumbChange }) => {
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
