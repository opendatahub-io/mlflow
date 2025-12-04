import React, { useMemo } from 'react';
import { Routes } from '../../common/utils/RoutingUtils';
import { getPromptRouteElements } from './promptRoutes';
import { PromptBreadcrumbReporter } from './PromptBreadcrumbReporter';
import MlflowWrapperBase from '@mlflow/mlflow/src/odh/wrappers/MlflowWrapperBase';
import { PROMPTS_DEFAULT_BASENAME } from '../const';

export interface MlflowPromptsWrapperProps {
  basename?: string;
  onBreadcrumbChange?: (segments: { label: string; path: string }[]) => void;
}

const MlflowPromptsWrapper: React.FC<MlflowPromptsWrapperProps> = ({
  basename = PROMPTS_DEFAULT_BASENAME,
  onBreadcrumbChange,
}) => {
  const routeElements = useMemo(() => getPromptRouteElements(), []);
  return (
    <MlflowWrapperBase
      basename={basename}
      breadcrumbReporter={<PromptBreadcrumbReporter onBreadcrumbChange={onBreadcrumbChange} />}
    >
      <Routes>{routeElements}</Routes>
    </MlflowWrapperBase>
  );
};

export default MlflowPromptsWrapper;
