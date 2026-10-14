import { useEffect, useRef } from 'react';
import { useLocation, matchPath } from '../../common/utils/RoutingUtils';
import { formatSkillIdentity, parseSkillRouteParams } from '../../skill-registry/utils';
import type { BreadcrumbSegment } from '../const';

interface SkillRegistryBreadcrumbReporterProps {
  onBreadcrumbChange?: (segments: BreadcrumbSegment[]) => void;
}

const SKILLS_CRUMB: BreadcrumbSegment = { label: 'Skills', path: '/' };

/**
 * Build breadcrumb segments from the current pathname.
 *
 *   Skill list   -> [] (empty)
 *   Skill detail -> [Skills (link), @organization/name (active)]
 *
 * The basename-relative `pathname` is reported verbatim as the detail `path` so the encoded identity
 * (`%40acme%2Fcode-review`) survives; rebuilding it from the decoded route params would split it into two
 * segments.
 */
const buildSegments = (pathname: string): BreadcrumbSegment[] => {
  if (pathname === '/' || pathname === '') {
    return [];
  }
  const match = matchPath('/:skillKey', pathname) ?? matchPath('/:organization/:skillName', pathname);
  if (!match) {
    return [];
  }
  const { name, organization } = parseSkillRouteParams(match.params);
  if (!name) {
    return [];
  }
  return [SKILLS_CRUMB, { label: formatSkillIdentity(name, organization), path: pathname }];
};

export const SkillRegistryBreadcrumbReporter: React.FC<SkillRegistryBreadcrumbReporterProps> = ({
  onBreadcrumbChange,
}) => {
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
