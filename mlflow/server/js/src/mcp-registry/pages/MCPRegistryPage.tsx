import { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  GridIcon,
  Header,
  ListIcon,
  PlusIcon,
  SegmentedControlButton,
  SegmentedControlGroup,
  McpIcon,
  Spacer,
  TableFilterInput,
  TableFilterLayout,
  Typography,
  useDesignSystemTheme,
} from '@databricks/design-system';
import type { RadioChangeEvent } from '@databricks/design-system';
import { FormattedMessage, useIntl } from 'react-intl';

import { ScrollablePageWrapper } from '../../common/components/ScrollablePageWrapper';
import { isIntegrated } from '../../common/utils/embedUtils';
import { withErrorBoundary } from '../../common/utils/withErrorBoundary';
import ErrorUtils from '../../common/utils/ErrorUtils';
import { useNavigate, useSearchParams } from '../../common/utils/RoutingUtils';
import { ModelSearchInputHelpTooltip } from '../../model-registry/components/model-list/ModelListFilters';
import { useMCPServersListQuery } from '../hooks/useMCPServersListQuery';
import { useUpdateMCPServerTags } from '../hooks/useUpdateMCPServerTags';
import { useCreateMCPServerVersionModal } from '../hooks/useCreateMCPServerVersionModal';
import { useMCPAccessBindingsListQuery } from '../hooks/useMCPAccessBindingsListQuery';
import { MCPServerCardGrid } from '../components/MCPServerCardGrid';
import { MCPServerListTable } from '../components/MCPServerListTable';
import { emptyCenterStyles } from '../utils';
import MCPRegistryRoutes from '../routes';
import type { MCPAccessBinding } from '../types';
import { MCPAccessBindingCardGrid } from '../components/MCPAccessBindingCardGrid';
import { MCPAccessBindingListTable } from '../components/MCPAccessBindingListTable';
import { AccessBindingModal } from '../components/AccessBindingModal';
import { useDebounce } from 'use-debounce';

type ViewMode = 'list' | 'grid';
type ActiveTab = 'servers' | 'bindings';

const MCPRegistryPage = () => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const activeTab: ActiveTab = tabFromUrl === 'servers' ? 'servers' : 'bindings';
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchFilter, setSearchFilter] = useState('');
  const [bindingModalOpen, setBindingModalOpen] = useState(false);
  const [editingBinding, setEditingBinding] = useState<MCPAccessBinding | undefined>(undefined);
  const [debouncedSearchFilter] = useDebounce(searchFilter, 500);
  const effectiveFilter = searchFilter ? debouncedSearchFilter : undefined;

  const {
    data: servers,
    isLoading,
    error,
    hasNextPage,
    hasPreviousPage,
    onNextPage,
    onPreviousPage,
    pageSizeSelect,
    refetch,
  } = useMCPServersListQuery({
    searchFilter: activeTab === 'servers' ? effectiveFilter : undefined,
  });

  const {
    data: bindings,
    isLoading: bindingsLoading,
    error: bindingsError,
    hasNextPage: bindingsHasNextPage,
    hasPreviousPage: bindingsHasPreviousPage,
    onNextPage: bindingsOnNextPage,
    onPreviousPage: bindingsOnPreviousPage,
    pageSizeSelect: bindingsPageSizeSelect,
  } = useMCPAccessBindingsListQuery({
    searchFilter: activeTab === 'bindings' ? effectiveFilter : undefined,
    enabled: activeTab === 'bindings',
  });

  const navigate = useNavigate();
  const { CreateMCPServerVersionModal, openModal } = useCreateMCPServerVersionModal({
    onSuccess: ({ name }) => navigate(MCPRegistryRoutes.getMCPServerDetailRoute(name)),
  });

  const { EditTagsModal, showEditServerTagsModal: handleEditTags } = useUpdateMCPServerTags({
    onSuccess: refetch,
  });

  const handleTabChange = useCallback(
    (e: RadioChangeEvent) => {
      const value = e.target.value as ActiveTab;
      setSearchFilter('');
      const next = new URLSearchParams(searchParams);
      if (value === 'bindings') {
        next.delete('tab');
      } else {
        next.set('tab', value);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const isServersEmpty = !isLoading && !error && !servers?.length && !searchFilter;
  const createButton =
    activeTab === 'bindings' ? (
      <Button
        componentId="mlflow.mcp_registry.create_binding_button"
        type="primary"
        disabled={isServersEmpty}
        onClick={() => {
          setEditingBinding(undefined);
          setBindingModalOpen(true);
        }}
      >
        <FormattedMessage defaultMessage="Create access binding" description="Button to create a new access binding" />
      </Button>
    ) : (
      <Button componentId="mlflow.mcp_registry.create_server_button" type="primary" onClick={openModal}>
        <FormattedMessage defaultMessage="Create MCP server" description="Button to create a new MCP server" />
      </Button>
    );

  const serversEmptyState = (
    <div css={emptyCenterStyles}>
      <Empty
        title={
          <FormattedMessage defaultMessage="Create MCP server" description="Empty state title for MCP servers tab" />
        }
        description={
          <FormattedMessage
            defaultMessage="Create and manage MCP servers using MLflow."
            description="Empty state description for MCP servers tab"
          />
        }
        button={
          <Button
            componentId="mlflow.mcp_registry.empty_state.create_server"
            type="primary"
            icon={<PlusIcon />}
            onClick={openModal}
          >
            <FormattedMessage defaultMessage="Create MCP server" description="MCP Registry empty state CTA button" />
          </Button>
        }
      />
    </div>
  );

  const integrated = isIntegrated();

  return (
    <>
      <ScrollablePageWrapper css={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1 }}>
        {!integrated && (
          <>
            <Spacer shrinks={false} />
            <Header
              title={
                <span css={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
                  <span
                    css={{
                      display: 'flex',
                      borderRadius: theme.borders.borderRadiusSm,
                      backgroundColor: theme.colors.backgroundSecondary,
                      padding: theme.spacing.sm,
                    }}
                  >
                    <McpIcon />
                  </span>
                  <FormattedMessage defaultMessage="MCP Registry" description="MCP Registry page title" />
                </span>
              }
              buttons={createButton}
            />
            <Spacer shrinks={false} />
          </>
        )}
        <div css={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div css={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <SegmentedControlGroup
              name="mcp-registry-tabs"
              value={activeTab}
              onChange={handleTabChange}
              componentId="mlflow.mcp_registry.tabs"
            >
              <SegmentedControlButton value="bindings">
                <FormattedMessage
                  defaultMessage="Access Bindings"
                  description="MCP Registry access bindings tab label"
                />
              </SegmentedControlButton>
              <SegmentedControlButton value="servers">
                <FormattedMessage defaultMessage="Servers" description="MCP Registry servers tab label" />
              </SegmentedControlButton>
            </SegmentedControlGroup>
            {integrated && createButton}
          </div>

          {activeTab === 'servers' && (
            <div css={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div
                css={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: theme.spacing.sm,
                  paddingTop: theme.spacing.md,
                  flexShrink: 0,
                }}
              >
                <div css={{ flex: 1 }}>
                  <TableFilterLayout>
                    <TableFilterInput
                      placeholder={intl.formatMessage({
                        defaultMessage: 'Search MCP servers by name',
                        description: 'Placeholder for MCP server search filter input',
                      })}
                      componentId="mlflow.mcp_registry.search"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      suffix={<ModelSearchInputHelpTooltip exampleEntityName="my-mcp-server" />}
                    />
                  </TableFilterLayout>
                </div>
                <SegmentedControlGroup
                  name="mcp-registry-view-mode"
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value as ViewMode)}
                  componentId="mlflow.mcp_registry.view_toggle"
                >
                  <SegmentedControlButton value="list" icon={<ListIcon />} />
                  <SegmentedControlButton value="grid" icon={<GridIcon />} />
                </SegmentedControlGroup>
              </div>
              {error?.message && (
                <Alert
                  type="error"
                  message={error.message}
                  componentId="mlflow.mcp_registry.error"
                  closable={false}
                  css={{ marginTop: theme.spacing.sm, flexShrink: 0 }}
                />
              )}
              {viewMode === 'grid' ? (
                isServersEmpty ? (
                  serversEmptyState
                ) : (
                  <MCPServerCardGrid
                    servers={servers}
                    isLoading={isLoading}
                    isFiltered={Boolean(searchFilter)}
                    hasNextPage={hasNextPage}
                    hasPreviousPage={hasPreviousPage}
                    onNextPage={onNextPage}
                    onPreviousPage={onPreviousPage}
                    pageSizeSelect={pageSizeSelect}
                  />
                )
              ) : (
                <MCPServerListTable
                  servers={servers}
                  hasNextPage={hasNextPage}
                  hasPreviousPage={hasPreviousPage}
                  isLoading={isLoading}
                  isFiltered={Boolean(searchFilter)}
                  onNextPage={onNextPage}
                  onPreviousPage={onPreviousPage}
                  pageSizeSelect={pageSizeSelect}
                  onEditTags={handleEditTags}
                />
              )}
            </div>
          )}

          {activeTab === 'bindings' && (
            <div css={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div
                css={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: theme.spacing.sm,
                  paddingTop: theme.spacing.md,
                  flexShrink: 0,
                }}
              >
                <div css={{ flex: 1 }}>
                  <TableFilterLayout>
                    <TableFilterInput
                      placeholder={intl.formatMessage({
                        defaultMessage: 'Search access bindings',
                        description: 'Placeholder for MCP access bindings search filter input',
                      })}
                      componentId="mlflow.mcp_registry.bindings.search"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      suffix={null}
                    />
                  </TableFilterLayout>
                </div>
                <SegmentedControlGroup
                  name="mcp-registry-bindings-view-mode"
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value as ViewMode)}
                  componentId="mlflow.mcp_registry.bindings.view_toggle"
                >
                  <SegmentedControlButton value="list" icon={<ListIcon />} />
                  <SegmentedControlButton value="grid" icon={<GridIcon />} />
                </SegmentedControlGroup>
              </div>
              <Typography.Text color="secondary" css={{ flexShrink: 0, paddingBottom: theme.spacing.sm }}>
                <FormattedMessage
                  defaultMessage="Approved endpoints that connect MCP servers in the registry to live deployments in your environment."
                  description="Description text for the access bindings tab"
                />
              </Typography.Text>
              {bindingsError?.message && (
                <Alert
                  type="error"
                  message={bindingsError.message}
                  componentId="mlflow.mcp_registry.bindings.error"
                  closable={false}
                  css={{ marginTop: theme.spacing.sm, flexShrink: 0 }}
                />
              )}
              {isServersEmpty && viewMode === 'grid' ? (
                <div css={emptyCenterStyles}>
                  <Empty
                    title={
                      <FormattedMessage
                        defaultMessage="Create MCP server"
                        description="Empty state title for access bindings tab when no servers exist"
                      />
                    }
                    description={
                      <FormattedMessage
                        defaultMessage="Register an MCP server before creating access bindings."
                        description="Empty state description for access bindings tab when no servers exist"
                      />
                    }
                    button={
                      <Button
                        componentId="mlflow.mcp_registry.bindings.empty_state.create_server"
                        type="primary"
                        icon={<PlusIcon />}
                        onClick={openModal}
                      >
                        <FormattedMessage
                          defaultMessage="Create MCP server"
                          description="Access bindings empty state create server button"
                        />
                      </Button>
                    }
                  />
                </div>
              ) : viewMode === 'grid' ? (
                <MCPAccessBindingCardGrid
                  bindings={bindings}
                  isLoading={bindingsLoading}
                  isFiltered={Boolean(searchFilter)}
                  hasNextPage={bindingsHasNextPage}
                  hasPreviousPage={bindingsHasPreviousPage}
                  onNextPage={bindingsOnNextPage}
                  onPreviousPage={bindingsOnPreviousPage}
                  pageSizeSelect={bindingsPageSizeSelect}
                  onCreateBinding={() => {
                    setEditingBinding(undefined);
                    setBindingModalOpen(true);
                  }}
                />
              ) : (
                <MCPAccessBindingListTable
                  bindings={bindings}
                  hasNextPage={bindingsHasNextPage}
                  hasPreviousPage={bindingsHasPreviousPage}
                  isLoading={bindingsLoading}
                  isFiltered={Boolean(searchFilter)}
                  onNextPage={bindingsOnNextPage}
                  onPreviousPage={bindingsOnPreviousPage}
                  pageSizeSelect={bindingsPageSizeSelect}
                  onCreateBinding={() => {
                    setEditingBinding(undefined);
                    setBindingModalOpen(true);
                  }}
                  onEditBinding={(binding) => {
                    setEditingBinding(binding);
                    setBindingModalOpen(true);
                  }}
                  emptyStateOverride={
                    isServersEmpty ? (
                      <Empty
                        title={
                          <FormattedMessage
                            defaultMessage="Create MCP server"
                            description="Empty state title for access bindings list when no servers exist"
                          />
                        }
                        description={
                          <FormattedMessage
                            defaultMessage="Register an MCP server before creating access bindings."
                            description="Empty state description for access bindings list when no servers exist"
                          />
                        }
                        button={
                          <Button
                            componentId="mlflow.mcp_registry.bindings.list.empty_state.create_server"
                            type="primary"
                            icon={<PlusIcon />}
                            onClick={openModal}
                          >
                            <FormattedMessage
                              defaultMessage="Create MCP server"
                              description="Access bindings list empty state create server button"
                            />
                          </Button>
                        }
                      />
                    ) : undefined
                  }
                />
              )}
            </div>
          )}
        </div>
        <AccessBindingModal
          visible={bindingModalOpen}
          onCancel={() => {
            setEditingBinding(undefined);
            setBindingModalOpen(false);
          }}
          editBinding={editingBinding}
        />
      </ScrollablePageWrapper>
      {CreateMCPServerVersionModal}
      {EditTagsModal}
    </>
  );
};

export default withErrorBoundary(ErrorUtils.mlflowServices.MCP_REGISTRY, MCPRegistryPage);
