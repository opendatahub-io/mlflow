import { useMemo } from 'react';
import { useReactTable_unverifiedWithReact18 as useReactTable } from '@databricks/web-shared/react-table';
import type { CursorPaginationProps } from '@databricks/design-system';
import {
  CursorPagination,
  Empty,
  NoIcon,
  Overflow,
  PencilIcon,
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
import MCPRegistryRoutes from '../routes';
import { emptyCenterStyles, resolveDisplayName, tagsRecordToArray, resolveIconSrc } from '../utils';
import { useLatestMCPServerVersionQuery } from '../hooks/useMCPServerDetailQuery';
import { Link } from '../../common/utils/RoutingUtils';
import { KeyValueTag } from '../../common/components/KeyValueTag';
import { MCPServerIcon } from './MCPServerIcon';
import Utils from '../../common/utils/Utils';

interface MCPServerTableMeta {
  onEditTags?: (server: MCPServer) => void;
}

const MCPServerNameCell = ({ getValue, row }: CellContext<MCPServer, unknown>) => {
  const { theme } = useDesignSystemTheme();
  const { data: latestVersion } = useLatestMCPServerVersionQuery(row.original.name);
  const value = getValue() as string;
  return (
    <span css={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
      <MCPServerIcon
        iconSrc={resolveIconSrc(row.original.icons) || resolveIconSrc(latestVersion?.server_json?.icons)}
      />
      <Link
        componentId="mlflow.mcp_registry.table.name_link"
        to={MCPRegistryRoutes.getMCPServerDetailRoute(row.original.name)}
      >
        {value}
      </Link>
    </span>
  );
};

const MCPServerTagsCell = ({
  row: { original },
  table: {
    options: { meta },
  },
}: CellContext<MCPServer, unknown>) => {
  const intl = useIntl();
  const { theme } = useDesignSystemTheme();
  const { onEditTags } = (meta as MCPServerTableMeta) || {};
  const tags = tagsRecordToArray(original.tags);
  const containsTags = tags.length > 0;

  return (
    <div css={{ display: 'flex', alignItems: 'center' }}>
      {containsTags && (
        <Overflow noMargin>
          {tags.map((tag) => (
            <KeyValueTag key={tag.key} tag={tag} />
          ))}
        </Overflow>
      )}
      <Button
        componentId="mlflow.mcp_registry.table.tag.edit"
        size="small"
        icon={!containsTags ? undefined : <PencilIcon />}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onEditTags?.(original);
        }}
        aria-label={intl.formatMessage({
          defaultMessage: 'Edit tags',
          description: 'Label for the edit tags button in the MCP servers table',
        })}
        css={{
          flexShrink: 0,
          marginLeft: containsTags ? theme.spacing.sm : 0,
          opacity: 0,
          '[role=row]:hover &': { opacity: 1 },
          '[role=row]:focus-within &': { opacity: 1 },
        }}
        type="tertiary"
      >
        {!containsTags ? (
          <FormattedMessage
            defaultMessage="Add tags"
            description="Label for the add tags button in the MCP servers table"
          />
        ) : undefined}
      </Button>
    </div>
  );
};

const MCPServerLatestVersionCell = ({ row: { original } }: CellContext<MCPServer, unknown>) => {
  const { data: latestVersion } = useLatestMCPServerVersionQuery(original.name, !original.latest_version);
  return original.latest_version || latestVersion?.version || '—';
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
        accessorFn: (row) => resolveDisplayName(row),
        id: 'name',
        cell: MCPServerNameCell,
      },
      {
        header: intl.formatMessage({
          defaultMessage: 'Latest version',
          description: 'Header for the latest version column in the MCP servers table',
        }),
        id: 'latestVersion',
        cell: MCPServerLatestVersionCell,
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
      {
        header: intl.formatMessage({
          defaultMessage: 'Description',
          description: 'Header for the description column in the MCP servers table',
        }),
        accessorKey: 'description',
        id: 'description',
        cell: ({ getValue }) => {
          const value = getValue() as string | undefined;
          return value ? <Typography.Truncate lines={1}>{value}</Typography.Truncate> : '—';
        },
      },
      {
        header: intl.formatMessage({
          defaultMessage: 'Tags',
          description: 'Header for the tags column in the MCP servers table',
        }),
        id: 'tags',
        cell: MCPServerTagsCell,
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
  pageSizeSelect,
  onEditTags,
}: {
  servers?: MCPServer[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isLoading?: boolean;
  isFiltered?: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
  pageSizeSelect?: CursorPaginationProps['pageSizeSelect'];
  onEditTags?: (server: MCPServer) => void;
}) => {
  const { theme } = useDesignSystemTheme();
  const columns = useMCPServerTableColumns();

  const table = useReactTable('mlflow/server/js/src/mcp-registry/components/MCPServerListTable.tsx', {
    data: servers ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row, index) => row.name ?? index.toString(),
    meta: { onEditTags } as MCPServerTableMeta,
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
          pageSizeSelect={pageSizeSelect}
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
