import { useReactTable_unverifiedWithReact18 as useReactTable } from '@databricks/web-shared/react-table';
import {
  CursorPagination,
  Empty,
  NoIcon,
  Table,
  TableCell,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  useDesignSystemTheme,
  Button,
  PlusIcon,
  Typography,
} from '@databricks/design-system';
import type { ColumnDef, SortDirection, SortingState } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, getSortedRowModel } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { RegisteredPrompt } from '../types';
import { PromptsListTableTagsCell } from './PromptsListTableTagsCell';
import { PromptsListTableNameCell } from './PromptsListTableNameCell';
import { PromptsListTableModelCell } from './PromptsListTableModelCell';
import Utils from '../../../../common/utils/Utils';
import { PromptsListTableVersionCell } from './PromptsListTableVersionCell';
import type { PromptsTableMetadata } from '../utils';
import { getModelConfigFromTags } from '../utils';
import { first, isEmpty } from 'lodash';

const coreRowModel = getCoreRowModel<RegisteredPrompt>();
const EMPTY_DATA: RegisteredPrompt[] = [];

type PromptsTableColumnDef = ColumnDef<RegisteredPrompt>;

const usePromptsTableColumns = () => {
  const intl = useIntl();
  return useMemo(() => {
    const resultColumns: PromptsTableColumnDef[] = [
      {
        header: intl.formatMessage({
          defaultMessage: 'Name',
          description: 'Header for the name column in the registered prompts table',
        }),
        accessorKey: 'name',
        id: 'name',
        cell: PromptsListTableNameCell,
      },
      {
        header: intl.formatMessage({
          defaultMessage: 'Latest version',
          description: 'Header for the latest version column in the registered prompts table',
        }),
        cell: PromptsListTableVersionCell,
        accessorFn: ({ latest_versions }) => first(latest_versions)?.version,
        id: 'latestVersion',
      },
      {
        header: intl.formatMessage({
          defaultMessage: 'Associated Model',
          description: 'Header for the associated model column in the registered prompts table',
        }),
        id: 'associatedModel',
        accessorFn: ({ latest_versions }) => {
          const config = getModelConfigFromTags(first(latest_versions)?.tags);
          return config?.model_name ?? '';
        },
        cell: PromptsListTableModelCell,
        enableSorting: true,
        sortingFn: 'alphanumeric',
      },
      {
        header: intl.formatMessage({
          defaultMessage: 'Last modified',
          description: 'Header for the last modified column in the registered prompts table',
        }),
        id: 'lastModified',
        accessorFn: ({ last_updated_timestamp }) => Utils.formatTimestamp(last_updated_timestamp, intl),
      },
      {
        header: intl.formatMessage({
          defaultMessage: 'Tags',
          description: 'Header for the tags column in the registered prompts table',
        }),
        accessorKey: 'tags',
        id: 'tags',
        cell: PromptsListTableTagsCell,
      },
    ];

    return resultColumns;
  }, [intl]);
};

export const PromptsListTable = ({
  prompts,
  hasNextPage,
  hasPreviousPage,
  isLoading,
  isFiltered,
  onNextPage,
  onPreviousPage,
  onEditTags,
  experimentId,
  onCreatePrompt,
  componentId,
}: {
  prompts?: RegisteredPrompt[];
  error?: Error;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isLoading?: boolean;
  isFiltered?: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onEditTags: (editedEntity: RegisteredPrompt) => void;
  experimentId?: string;
  onCreatePrompt: () => void;
  componentId: string;
}) => {
  const { theme } = useDesignSystemTheme();
  const columns = usePromptsTableColumns();
  const [sorting, setSorting] = useState<SortingState>([]);

  // prettier-ignore
  const table = useReactTable('mlflow/server/js/src/experiment-tracking/pages/prompts/components/PromptsListTable.tsx', {
    data: prompts ?? EMPTY_DATA,
    columns,
    getCoreRowModel: coreRowModel,
    getSortedRowModel: getSortedRowModel(),
    enableSorting: true,
    onSortingChange: setSorting,
    state: { sorting },
    getRowId: (row, index) => row.name ?? index.toString(),
    meta: { onEditTags, experimentId } satisfies PromptsTableMetadata,
  });

  const getEmptyState = () => {
    const isEmptyList = !isLoading && isEmpty(prompts);
    if (isEmptyList && isFiltered) {
      return (
        <div css={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
          <Empty
            image={<NoIcon />}
            title={
              <FormattedMessage
                defaultMessage="No prompts found"
                description="Label for the empty state in the prompts table when no prompts are found"
              />
            }
            description={null}
          />
        </div>
      );
    }
    if (isEmptyList) {
      return (
        <div css={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
          <Empty
            title={
              <FormattedMessage
                defaultMessage="Create prompt"
                description="A header for the empty state in the prompts table"
              />
            }
            description={
              <FormattedMessage
                defaultMessage="Create and manage prompts using MLflow. <link>Learn more</link>"
                description="Guidelines for the user on how to create a new prompt in the prompts list page"
                values={{
                  link: (content: any) => (
                    <Typography.Link
                      componentId="mlflow.prompts.list.table.learn_more_link"
                      href="https://mlflow.org/docs/latest/genai/prompt-registry/"
                      openInNewTab
                    >
                      {content}
                    </Typography.Link>
                  ),
                }}
              />
            }
            button={
              <Button
                componentId="mlflow.prompts.list.table.create_prompt"
                data-testid="create-prompt-empty-state-button"
                onClick={onCreatePrompt}
                type="primary"
                icon={<PlusIcon />}
              >
                <FormattedMessage defaultMessage="Create prompt" description="Prompts empty state CTA" />
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
          componentId={`${componentId}.pagination`}
        />
      }
      empty={getEmptyState()}
    >
      <TableRow isHeader>
        {table.getLeafHeaders().map((header) => (
          <TableHeader
            componentId={`${componentId}.table.header`}
            key={header.id}
            sortable={header.column.getCanSort()}
            sortDirection={header.column.getIsSorted() as SortDirection}
            onToggleSort={header.column.getToggleSortingHandler()}
            header={header}
            column={header.column}
          >
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
