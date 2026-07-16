import type { CursorPaginationProps } from '@databricks/design-system';
import { FormattedMessage } from 'react-intl';

import type { MCPServer } from '../types';
import { MCPServerCard } from './MCPServerCard';
import { PaginatedCardGrid } from './PaginatedCardGrid';

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
}) => (
  <PaginatedCardGrid
    items={servers}
    isLoading={isLoading}
    isFiltered={isFiltered}
    hasNextPage={hasNextPage}
    hasPreviousPage={hasPreviousPage}
    onNextPage={onNextPage}
    onPreviousPage={onPreviousPage}
    pageSizeSelect={pageSizeSelect}
    loadingMessage={
      <FormattedMessage defaultMessage="Loading servers..." description="Loading state for MCP servers card grid" />
    }
    noResultsMessage={
      <FormattedMessage
        defaultMessage="No servers found"
        description="Empty state when MCP server search returns no results"
      />
    }
    renderItem={(server) => <MCPServerCard server={server} />}
    getItemKey={(server) => server.name}
  />
);
