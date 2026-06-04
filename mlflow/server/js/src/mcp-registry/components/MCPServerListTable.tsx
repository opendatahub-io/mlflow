import { useMemo } from 'react';
import { useReactTable_unverifiedWithReact18 as useReactTable } from '@databricks/web-shared/react-table';
import {
  CursorPagination,
  Empty,
  McpIcon,
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
import type { CellContext, ColumnDef } from '@tanstack/react-table';
import { flexRender, getCoreRowModel } from '@tanstack/react-table';
import { FormattedMessage, useIntl } from 'react-intl';

import type { MCPServer } from '../types';
import Utils from '../../common/utils/Utils';

export const emptyCenterStyles = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  minHeight: 400,
  width: '100%',
  '& > div': {
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    alignItems: 'center',
  },
};

const MCPServerNameCell = ({ getValue }: CellContext<MCPServer, unknown>) => {
  const { theme } = useDesignSystemTheme();
  const value = getValue() as string;
  return (
    <span css={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
      <McpIcon css={{ flexShrink: 0, color: theme.colors.textSecondary }} />
      <Typography.Text>{value}</Typography.Text>
    </span>
  );
};

const useMCPServerTableColumns = () => {
  const intl = useIntl();
  return useMemo(() => {
    const columns: ColumnDef<MCPServer>[] = [
      {
        header: intl.formatMessage({
          defaultMessage: 'Name',
          description: 'Header for the name column in the MCP servers table',
        }),
        accessorFn: (row) => row.display_name || row.name,
        id: 'name',
        cell: MCPServerNameCell,
      },
      {
        header: intl.formatMessage({
          defaultMessage: 'Description',
          description: 'Header for the description column in the MCP servers table',
        }),
        accessorKey: 'description',
        id: 'description',
      },
      {
        header: intl.formatMessage({
          defaultMessage: 'Last modified',
          description: 'Header for the last modified column in the MCP servers table',
        }),
        id: 'lastModified',
        accessorFn: ({ last_updated_timestamp }) =>
          last_updated_timestamp ? Utils.formatTimestamp(last_updated_timestamp, intl) : '',
      },
    ];
    return columns;
  }, [intl]);
};

export const MCPServerListTable = ({
  servers,
  hasNextPage,
  hasPreviousPage,
  isLoading,
  isFiltered,
  onNextPage,
  onPreviousPage,
}: {
  servers?: MCPServer[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isLoading?: boolean;
  isFiltered?: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
}) => {
  const { theme } = useDesignSystemTheme();
  const columns = useMCPServerTableColumns();

  const table = useReactTable('mlflow/server/js/src/mcp-registry/components/MCPServerListTable.tsx', {
    data: servers ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row, index) => row.name ?? index.toString(),
  });

  const getEmptyState = () => {
    const isEmptyList = !isLoading && (!servers || servers.length === 0);
    if (isEmptyList && isFiltered) {
      return (
        <div css={emptyCenterStyles}>
          <Empty
            image={<NoIcon />}
            title={
              <FormattedMessage
                defaultMessage="No servers found"
                description="Empty state when MCP server search returns no results"
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
                defaultMessage="Create MCP server"
                description="Empty state title for MCP servers table"
              />
            }
            description={
              <FormattedMessage
                defaultMessage="Create and manage MCP servers using MLflow."
                description="Empty state description for MCP servers table"
              />
            }
            button={
              <Button
                componentId="mlflow.mcp_registry.table.empty_state.create_server"
                type="primary"
                icon={<PlusIcon />}
                disabled
              >
                <FormattedMessage
                  defaultMessage="Create MCP server"
                  description="MCP servers table empty state CTA button"
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
          componentId="mlflow.mcp_registry.table.pagination"
        />
      }
      empty={getEmptyState()}
    >
      <TableRow isHeader>
        {table.getLeafHeaders().map((header) => (
          <TableHeader componentId="mlflow.mcp_registry.table.header" key={header.id}>
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
