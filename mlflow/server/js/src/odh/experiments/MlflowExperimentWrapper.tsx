import React, { useMemo } from 'react';
import { Routes } from '../../common/utils/RoutingUtils';
import { getExperimentTrackingRouteElements } from './experimentTrackingRoutes';
import { BreadcrumbReporter } from './BreadcrumbReporter';
import MlflowWrapperBase from '@mlflow/mlflow/src/odh/wrappers/MlflowWrapperBase';
import { EXPERIMENTS_DEFAULT_BASENAME } from '../const';

const MlflowExperimentWrapper: React.FC<{
  basename?: string;
  onBreadcrumbChange?: (segments: { label: string; path: string }[]) => void;
}> = ({ basename = EXPERIMENTS_DEFAULT_BASENAME, onBreadcrumbChange }) => {
  const routeElements = useMemo(() => getExperimentTrackingRouteElements(), []);
  return (
    <MlflowWrapperBase
      basename={basename}
      breadcrumbReporter={<BreadcrumbReporter onBreadcrumbChange={onBreadcrumbChange} />}
    >
      <Routes>{routeElements}</Routes>
    </MlflowWrapperBase>
  );
};

export default MlflowExperimentWrapper;
