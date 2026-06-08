import type { CursorPaginationProps } from '@databricks/design-system';
import { CursorPagination, Empty, NoIcon, Spinner, useDesignSystemTheme } from '@databricks/design-system';
import { FormattedMessage } from 'react-intl';

import type { MCPServer } from '../types';
import { MCPServerCard } from './MCPServerCard';

export const MCPServerCardGrid = ({
  servers,
  isLoading,
  isFiltered,
  hasNextPage,
  hasPreviousPage,
  onNextPage,
  onPreviousPage,
  pageSizeSelect,
}: {
  servers?: MCPServer[];
  isLoading?: boolean;
  isFiltered?: boolean;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
  pageSizeSelect?: CursorPaginationProps['pageSizeSelect'];
}) => {
  const { theme } = useDesignSystemTheme();

  if (isLoading) {
    return (
      <div
        css={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.sm,
          padding: theme.spacing.lg,
          minHeight: 200,
        }}
      >
        <Spinner size="small" />
        <FormattedMessage defaultMessage="Loading servers..." description="Loading state for MCP servers card grid" />
      </div>
    );
  }

  if (!servers?.length && isFiltered) {
    return (
      <div css={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
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

  if (!servers?.length) {
    return null;
  }

  return (
    <div css={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div
        css={{
          flex: '0 1 auto',
          overflow: 'auto',
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: theme.spacing.md,
          paddingTop: theme.spacing.md,
        }}
      >
        {servers.map((server) => (
          <MCPServerCard key={server.name} server={server} />
        ))}
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
  );
};
