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
import { CopyButton } from '../../shared/building_blocks/CopyButton';
import Utils from '../../common/utils/Utils';

const EndpointCell: ColumnDef<MCPAccessBinding>['cell'] = ({ row: { original } }) => {
  const { theme } = useDesignSystemTheme();
  return (
    <span css={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
      <CopyButton
        componentId="mlflow.mcp_registry.bindings.table.copy_endpoint"
        copyText={original.endpoint_url}
        showLabel={false}
        size="small"
        type="tertiary"
        icon={<CopyIcon />}
      />
      <Typography.Link
        componentId="mlflow.mcp_registry.bindings.table.endpoint_link"
        href={original.endpoint_url}
        target="_blank"
        css={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {original.endpoint_url}
      </Typography.Link>
    </span>
  );
};

const ServerNameCell: ColumnDef<MCPAccessBinding>['cell'] = ({ row: { original } }) => {
  return (
    <Link
      componentId="mlflow.mcp_registry.bindings.table.server_link"
      to={MCPRegistryRoutes.getMCPServerDetailRoute(original.server_name)}
    >
      {resolveBindingDisplayName(original)}
    </Link>
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
        accessorKey: 'endpoint_url',
        id: 'endpoint',
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
}) => {
  const { theme } = useDesignSystemTheme();
  const columns = useMCPAccessBindingTableColumns();

  const table = useReactTable('mlflow/server/js/src/mcp-registry/components/MCPAccessBindingListTable.tsx', {
    data: bindings ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row, index) => row.binding_id?.toString() ?? index.toString(),
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
                disabled
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
        {table.getLeafHeaders().map((header) => (
          <TableHeader componentId="mlflow.mcp_registry.bindings.table.header" key={header.id}>
            {flexRender(header.column.columnDef.header, header.getContext())}
          </TableHeader>
        ))}
      </TableRow>
      {isLoading ? (
        <TableSkeletonRows table={table} />
      ) : (
        table.getRowModel().rows.map((row) => (
          <TableRow key={row.id} css={{ height: theme.general.buttonHeight }}>
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id} css={{ alignItems: 'center' }}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))
      )}
    </Table>
  );
};
