import { useMemo } from 'react';
import { useReactTable_unverifiedWithReact18 as useReactTable } from '@databricks/web-shared/react-table';
import type { CursorPaginationProps } from '@databricks/design-system';
import {
  CopyIcon,
  CursorPagination,
  Empty,
  NoIcon,
  Table,
  TableCell,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  Tooltip,
  Typography,
  useDesignSystemTheme,
  Button,
  PlusIcon,
} from '@databricks/design-system';
import type { ColumnDef } from '@tanstack/react-table';
import { flexRender, getCoreRowModel } from '@tanstack/react-table';
import { FormattedMessage, useIntl } from 'react-intl';

import type { MCPAccessBinding } from '../types';
import MCPRegistryRoutes from '../routes';
import { emptyCenterStyles, formatTransportType, resolveBindingDisplayName } from '../utils';
import { Link } from '../../common/utils/RoutingUtils';
import { copyToClipboard } from '../../common/utils/copyToClipboard';
import Utils from '../../common/utils/Utils';

const EndpointCell: ColumnDef<MCPAccessBinding>['cell'] = ({ row: { original } }) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  return (
    <span css={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
      <Tooltip
        componentId="mlflow.mcp_registry.bindings.table.copy_tooltip"
        content={intl.formatMessage({
          defaultMessage: 'Copy endpoint URL',
          description: 'Tooltip for copy endpoint URL button',
        })}
      >
        <Button
          componentId="mlflow.mcp_registry.bindings.table.copy_endpoint"
          size="small"
          icon={<CopyIcon />}
          onClick={() => copyToClipboard(original.url)}
          css={{ flexShrink: 0 }}
        />
      </Tooltip>
      <Link
        componentId="mlflow.mcp_registry.bindings.table.endpoint_link"
        to={MCPRegistryRoutes.getAccessBindingDetailRoute(original.server_name, original.id)}
        css={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {original.url}
      </Link>
    </span>
  );
};

const ServerNameCell: ColumnDef<MCPAccessBinding>['cell'] = ({ row: { original } }) => {
  const version = original.resolved_version?.version ?? original.server_version;
  return (
    <Link
      componentId="mlflow.mcp_registry.bindings.table.server_link"
      to={MCPRegistryRoutes.getMCPServerDetailRoute(original.server_name, version)}
    >
      {resolveBindingDisplayName(original)}
    </Link>
  );
};

const EditCell: ColumnDef<MCPAccessBinding>['cell'] = ({
  row: { original },
  table: {
    options: { meta },
  },
}) => {
  const { onEditBinding } = (meta ?? {}) as { onEditBinding?: (binding: MCPAccessBinding) => void };
  if (!onEditBinding) return null;
  return (
    <Typography.Link componentId="mlflow.mcp_registry.bindings.table.edit_link" onClick={() => onEditBinding(original)}>
      <FormattedMessage defaultMessage="Edit" description="Edit access binding link in table" />
    </Typography.Link>
  );
};

const useMCPAccessBindingTableColumns = () => {
  const intl = useIntl();
  return useMemo(() => {
    const columns: ColumnDef<MCPAccessBinding>[] = [
      {
        header: intl.formatMessage({
          defaultMessage: 'Endpoint',
          description: 'Header for the endpoint column in the access bindings table',
        }),
        accessorKey: 'url',
        id: 'endpoint',
        meta: { flex: 2 },
        cell: EndpointCell,
      },
      {
        header: intl.formatMessage({
          defaultMessage: 'MCP Server',
          description: 'Header for the server name column in the access bindings table',
        }),
        accessorKey: 'server_name',
        id: 'server',
        cell: ServerNameCell,
      },
      {
        header: intl.formatMessage({
          defaultMessage: 'Version/Alias',
          description: 'Header for the version or alias column in the access bindings table',
        }),
        id: 'target',
        meta: { flex: 0.75 },
        accessorFn: (row) => row.server_alias || row.server_version || '—',
      },
      {
        header: intl.formatMessage({
          defaultMessage: 'Transport',
          description: 'Header for the transport type column in the access bindings table',
        }),
        id: 'transport',
        accessorFn: (row) => formatTransportType(row.transport_type),
      },
      {
        header: intl.formatMessage({
          defaultMessage: 'Last updated',
          description: 'Header for the last updated column in the access bindings table',
        }),
        id: 'lastUpdated',
        accessorFn: ({ last_updated_timestamp }) =>
          last_updated_timestamp ? Utils.formatTimestamp(last_updated_timestamp, intl) : '',
      },
      {
        header: '',
        id: 'actions',
        meta: { flex: 0.5 },
        cell: EditCell,
      },
    ];
    return columns;
  }, [intl]);
};

export const MCPAccessBindingListTable = ({
  bindings,
  hasNextPage,
  hasPreviousPage,
  isLoading,
  isFiltered,
  onNextPage,
  onPreviousPage,
  pageSizeSelect,
  emptyStateOverride,
  onCreateBinding,
  onEditBinding,
}: {
  bindings?: MCPAccessBinding[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isLoading?: boolean;
  isFiltered?: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
  pageSizeSelect?: CursorPaginationProps['pageSizeSelect'];
  emptyStateOverride?: React.ReactNode;
  onCreateBinding?: () => void;
  onEditBinding?: (binding: MCPAccessBinding) => void;
}) => {
  const { theme } = useDesignSystemTheme();
  const columns = useMCPAccessBindingTableColumns();

  const table = useReactTable('mlflow/server/js/src/mcp-registry/components/MCPAccessBindingListTable.tsx', {
    data: bindings ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row, index) => row.id?.toString() ?? index.toString(),
    meta: { onEditBinding },
  });

  const getEmptyState = () => {
    const isEmptyList = !isLoading && (!bindings || bindings.length === 0);
    if (isEmptyList && emptyStateOverride) {
      return <div css={emptyCenterStyles}>{emptyStateOverride}</div>;
    }
    if (isEmptyList && isFiltered) {
      return (
        <div css={emptyCenterStyles}>
          <Empty
            image={<NoIcon />}
            title={
              <FormattedMessage
                defaultMessage="No access bindings found"
                description="Empty state when access binding search returns no results"
              />
            }
            description={null}
          />
        </div>
      );
    }
    if (isEmptyList) {
      return (
        <div css={emptyCenterStyles}>
          <Empty
            title={
              <FormattedMessage
                defaultMessage="Create endpoint"
                description="Empty state title for access bindings table"
              />
            }
            description={
              <FormattedMessage
                defaultMessage="Create and manage direct access endpoints for your MCP servers."
                description="Empty state description for access bindings table"
              />
            }
            button={
              <Button
                componentId="mlflow.mcp_registry.bindings.table.empty_state.create"
                type="primary"
                icon={<PlusIcon />}
                onClick={onCreateBinding}
              >
                <FormattedMessage
                  defaultMessage="Create endpoint"
                  description="Access bindings table empty state CTA button"
                />
              </Button>
            }
          />
        </div>
      );
    }
    return null;
  };

  return (
    <Table
      scrollable
      pagination={
        <CursorPagination
          hasNextPage={hasNextPage}
          hasPreviousPage={hasPreviousPage}
          onNextPage={onNextPage}
          onPreviousPage={onPreviousPage}
          pageSizeSelect={pageSizeSelect}
          componentId="mlflow.mcp_registry.bindings.table.pagination"
        />
      }
      empty={getEmptyState()}
    >
      <TableRow isHeader>
        {table.getLeafHeaders().map((header) => {
          const flex = (header.column.columnDef.meta as { flex?: number } | undefined)?.flex;
          return (
            <TableHeader
              componentId="mlflow.mcp_registry.bindings.table.header"
              key={header.id}
              css={flex != null ? { flex } : undefined}
            >
              {flexRender(header.column.columnDef.header, header.getContext())}
            </TableHeader>
          );
        })}
      </TableRow>
      {isLoading ? (
        <TableSkeletonRows table={table} />
      ) : (
        table.getRowModel().rows.map((row) => (
          <TableRow key={row.id} css={{ height: theme.general.buttonHeight }}>
            {row.getAllCells().map((cell) => {
              const flex = (cell.column.columnDef.meta as { flex?: number } | undefined)?.flex;
              return (
                <TableCell key={cell.id} css={{ alignItems: 'center', ...(flex != null && { flex }) }}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              );
            })}
          </TableRow>
        ))
      )}
    </Table>
  );
};
