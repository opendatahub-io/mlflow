import { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  CursorPagination,
  Empty,
  GridIcon,
  Header,
  ListIcon,
  PlusIcon,
  SegmentedControlButton,
  SegmentedControlGroup,
  WrenchIcon,
  Spacer,
  Table,
  TableHeader,
  TableRow,
  TableFilterInput,
  TableFilterLayout,
  useDesignSystemTheme,
} from '@databricks/design-system';
import type { RadioChangeEvent } from '@databricks/design-system';
import { FormattedMessage, useIntl } from 'react-intl';

import { ScrollablePageWrapper } from '../../common/components/ScrollablePageWrapper';
import { withErrorBoundary } from '../../common/utils/withErrorBoundary';
import ErrorUtils from '../../common/utils/ErrorUtils';
import { useSearchParams } from '../../common/utils/RoutingUtils';
import { ModelSearchInputHelpTooltip } from '../../model-registry/components/model-list/ModelListFilters';
import { useMCPServersListQuery } from '../hooks/useMCPServersListQuery';
import { MCPServerCardGrid } from '../components/MCPServerCardGrid';
import { MCPServerListTable, emptyCenterStyles } from '../components/MCPServerListTable';
import { useDebounce } from 'use-debounce';

type ViewMode = 'list' | 'grid';
type ActiveTab = 'servers' | 'bindings';

const MCPRegistryPage = () => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const activeTab: ActiveTab = tabFromUrl === 'bindings' ? 'bindings' : 'servers';
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchFilter, setSearchFilter] = useState('');
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
  } = useMCPServersListQuery({ searchFilter: effectiveFilter });

  const handleTabChange = useCallback(
    (e: RadioChangeEvent) => {
      const value = e.target.value as ActiveTab;
      setSearchFilter('');
      const next = new URLSearchParams(searchParams);
      if (value === 'servers') {
        next.delete('tab');
      } else {
        next.set('tab', value);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const isEmptyState = !isLoading && !error && !servers?.length && !searchFilter;
  const createButton = !isEmptyState ? (
    <Button componentId="mlflow.mcp_registry.create_server_button" type="primary" disabled>
      <FormattedMessage defaultMessage="Create MCP server" description="Button to create a new MCP server" />
    </Button>
  ) : null;

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
            disabled
          >
            <FormattedMessage defaultMessage="Create MCP server" description="MCP Registry empty state CTA button" />
          </Button>
        }
      />
    </div>
  );

  return (
    <ScrollablePageWrapper css={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1 }}>
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
              <WrenchIcon />
            </span>
            <FormattedMessage defaultMessage="MCP Registry" description="MCP Registry page title" />
          </span>
        }
        buttons={createButton}
      />
      <Spacer shrinks={false} />
      <div css={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <SegmentedControlGroup
          name="mcp-registry-tabs"
          value={activeTab}
          onChange={handleTabChange}
          componentId="mlflow.mcp_registry.tabs"
        >
          <SegmentedControlButton value="servers">
            <FormattedMessage defaultMessage="Servers" description="MCP Registry servers tab label" />
          </SegmentedControlButton>
          <SegmentedControlButton value="bindings">
            <FormattedMessage defaultMessage="Access Bindings" description="MCP Registry access bindings tab label" />
          </SegmentedControlButton>
        </SegmentedControlGroup>

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
              isEmptyState ? (
                serversEmptyState
              ) : (
                <div css={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                  <div css={{ flex: '0 1 auto', overflow: 'auto', minHeight: 0 }}>
                    <MCPServerCardGrid servers={servers} isLoading={isLoading} isFiltered={Boolean(searchFilter)} />
                  </div>
                  <div
                    css={{
                      flexShrink: 0,
                      display: 'flex',
                      justifyContent: 'flex-end',
                      paddingTop: theme.spacing.sm,
                      paddingBottom: theme.spacing.sm,
                    }}
                  >
                    <CursorPagination
                      hasNextPage={hasNextPage}
                      hasPreviousPage={hasPreviousPage}
                      onNextPage={onNextPage}
                      onPreviousPage={onPreviousPage}
                      pageSizeSelect={pageSizeSelect}
                      componentId="mlflow.mcp_registry.grid.pagination"
                    />
                  </div>
                </div>
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
              />
            )}
          </div>
        )}

        {activeTab === 'bindings' && (
          <>
            <div css={{ paddingTop: theme.spacing.md }}>
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
            <Table
              scrollable
              empty={
                <div css={emptyCenterStyles}>
                  <Empty
                    title={
                      <FormattedMessage
                        defaultMessage="Create endpoint"
                        description="Empty state title for MCP access bindings tab"
                      />
                    }
                    description={
                      <FormattedMessage
                        defaultMessage="Create and manage direct access endpoints for your MCP servers."
                        description="Empty state description for MCP access bindings tab"
                      />
                    }
                    button={
                      <Button
                        componentId="mlflow.mcp_registry.bindings.empty_state.create"
                        type="primary"
                        icon={<PlusIcon />}
                        disabled
                      >
                        <FormattedMessage
                          defaultMessage="Create endpoint"
                          description="MCP Registry bindings empty state CTA button"
                        />
                      </Button>
                    }
                  />
                </div>
              }
            >
              <TableRow isHeader>
                <TableHeader componentId="mlflow.mcp_registry.bindings.header.endpoint">
                  <FormattedMessage defaultMessage="Endpoint" description="Access bindings table header for endpoint" />
                </TableHeader>
                <TableHeader componentId="mlflow.mcp_registry.bindings.header.server">
                  <FormattedMessage
                    defaultMessage="MCP Server"
                    description="Access bindings table header for server name"
                  />
                </TableHeader>
                <TableHeader componentId="mlflow.mcp_registry.bindings.header.version">
                  <FormattedMessage
                    defaultMessage="Version/Alias"
                    description="Access bindings table header for version or alias"
                  />
                </TableHeader>
                <TableHeader componentId="mlflow.mcp_registry.bindings.header.transport">
                  <FormattedMessage
                    defaultMessage="Transport"
                    description="Access bindings table header for transport type"
                  />
                </TableHeader>
                <TableHeader componentId="mlflow.mcp_registry.bindings.header.last_updated">
                  <FormattedMessage
                    defaultMessage="Last updated"
                    description="Access bindings table header for last updated"
                  />
                </TableHeader>
              </TableRow>
            </Table>
          </>
        )}
      </div>
    </ScrollablePageWrapper>
  );
};

export default withErrorBoundary(ErrorUtils.mlflowServices.EXPERIMENTS, MCPRegistryPage);
