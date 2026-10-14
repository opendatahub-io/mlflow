import React, { useMemo } from 'react';
import { Routes } from '../../common/utils/RoutingUtils';
import { getSkillRegistryRouteElements } from './skillRegistryRoutes';
import { SkillRegistryBreadcrumbReporter } from './SkillRegistryBreadcrumbReporter';
import MlflowWrapperBase from '@mlflow/mlflow/src/odh/wrappers/MlflowWrapperBase';
import { SKILL_REGISTRY_DEFAULT_BASENAME } from '../const';

export interface MlflowSkillRegistryWrapperProps {
  basename?: string;
  onBreadcrumbChange?: (segments: { label: string; path: string }[]) => void;
}

const MlflowSkillRegistryWrapper: React.FC<MlflowSkillRegistryWrapperProps> = ({
  basename = SKILL_REGISTRY_DEFAULT_BASENAME,
  onBreadcrumbChange,
}) => {
  const routeElements = useMemo(() => getSkillRegistryRouteElements(), []);
  return (
    <MlflowWrapperBase
      basename={basename}
      breadcrumbReporter={<SkillRegistryBreadcrumbReporter onBreadcrumbChange={onBreadcrumbChange} />}
    >
      <Routes>{routeElements}</Routes>
    </MlflowWrapperBase>
  );
};

export default MlflowSkillRegistryWrapper;
