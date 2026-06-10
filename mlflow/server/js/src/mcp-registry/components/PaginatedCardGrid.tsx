import type { CursorPaginationProps } from '@databricks/design-system';
import { CursorPagination, Empty, NoIcon, Spinner, useDesignSystemTheme } from '@databricks/design-system';

import { emptyCenterStyles } from '../utils';

export const PaginatedCardGrid = <T,>({
  items,
  isLoading,
  isFiltered,
  hasNextPage,
  hasPreviousPage,
  onNextPage,
  onPreviousPage,
  pageSizeSelect,
  loadingMessage,
  noResultsMessage,
  emptyState,
  renderItem,
  getItemKey,
}: {
  items?: T[];
  isLoading?: boolean;
  isFiltered?: boolean;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
  pageSizeSelect?: CursorPaginationProps['pageSizeSelect'];
  loadingMessage: React.ReactNode;
  noResultsMessage: React.ReactNode;
  emptyState?: React.ReactNode;
  renderItem: (item: T) => React.ReactNode;
  getItemKey: (item: T) => string | number;
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
        {loadingMessage}
      </div>
    );
  }

  if (!items?.length && isFiltered) {
    return (
      <div css={emptyCenterStyles}>
        <Empty image={<NoIcon />} title={noResultsMessage} description={null} />
      </div>
    );
  }

  if (!items?.length) {
    return emptyState ? <div css={emptyCenterStyles}>{emptyState}</div> : null;
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
        {items.map((item) => (
          <div key={getItemKey(item)}>{renderItem(item)}</div>
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
          componentId="mlflow.mcp_registry.card_grid.pagination"
        />
      </div>
    </div>
  );
};
