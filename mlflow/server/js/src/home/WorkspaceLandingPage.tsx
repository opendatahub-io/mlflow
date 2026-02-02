import React, { useState } from 'react';
import { Header, TableSkeleton, TitleSkeleton, useDesignSystemTheme } from '@databricks/design-system';
import { FormattedMessage } from 'react-intl';
import { ScrollablePageWrapper } from '../common/components/ScrollablePageWrapper';
import { CreateWorkspaceModal } from './components/CreateWorkspaceModal';
import { useNavigate } from '../common/utils/RoutingUtils';
import { setActiveWorkspace } from '../common/utils/WorkspaceUtils';

// Loaders and lazy imports for expensive components
import LogTracesDrawerLoader from './components/LogTracesDrawerLoader';
const GetStarted = React.lazy(() => import('./components/GetStarted'));
const WorkspacesHomeView = React.lazy(() => import('./components/WorkspacesHomeView'));

const WorkspaceLandingPage = () => {
  const { theme } = useDesignSystemTheme();
  const navigate = useNavigate();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const handleOpenCreateModal = () => setIsCreateModalOpen(true);
  const handleCloseCreateModal = () => setIsCreateModalOpen(false);
  const handleWorkspaceCreated = (workspaceName: string) => {
    handleCloseCreateModal();
    // Set the newly created workspace as active and navigate to it
    setActiveWorkspace(workspaceName);
    navigate(`/workspaces/${encodeURIComponent(workspaceName)}`);
  };

  return (
    <ScrollablePageWrapper
      css={{
        padding: theme.spacing.md,
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.lg,
        height: 'min-content',
      }}
    >
      <Header title={<FormattedMessage defaultMessage="Welcome to MLflow" description="Home page hero title" />} />
      <React.Suspense fallback={<HomePageSectionSkeleton />}>
        <GetStarted />
      </React.Suspense>
      <React.Suspense fallback={<HomePageSectionSkeleton />}>
        <WorkspacesHomeView onCreateWorkspace={handleOpenCreateModal} />
      </React.Suspense>

      <CreateWorkspaceModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        onWorkspaceCreated={handleWorkspaceCreated}
      />
      <LogTracesDrawerLoader />
    </ScrollablePageWrapper>
  );
};

const HomePageSectionSkeleton = () => {
  const { theme } = useDesignSystemTheme();
  return (
    <div>
      <TitleSkeleton />
      <TableSkeleton lines={3} />
    </div>
  );
};

export default WorkspaceLandingPage;
