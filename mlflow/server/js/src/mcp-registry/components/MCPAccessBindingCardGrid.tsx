import type { CursorPaginationProps } from '@databricks/design-system';
import { Button, Empty, PlusIcon } from '@databricks/design-system';
import { FormattedMessage } from 'react-intl';

import type { MCPAccessBinding } from '../types';
import { MCPAccessBindingCard } from './MCPAccessBindingCard';
import { PaginatedCardGrid } from './PaginatedCardGrid';

export const MCPAccessBindingCardGrid = ({
  bindings,
  isLoading,
  isFiltered,
  hasNextPage,
  hasPreviousPage,
  onNextPage,
  onPreviousPage,
  pageSizeSelect,
  onCreateBinding,
}: {
  bindings?: MCPAccessBinding[];
  isLoading?: boolean;
  isFiltered?: boolean;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
  pageSizeSelect?: CursorPaginationProps['pageSizeSelect'];
  onCreateBinding?: () => void;
}) => (
  <PaginatedCardGrid
    items={bindings}
    isLoading={isLoading}
    isFiltered={isFiltered}
    hasNextPage={hasNextPage}
    hasPreviousPage={hasPreviousPage}
    onNextPage={onNextPage}
    onPreviousPage={onPreviousPage}
    pageSizeSelect={pageSizeSelect}
    loadingMessage={
      <FormattedMessage
        defaultMessage="Loading access bindings..."
        description="Loading state for MCP access bindings card grid"
      />
    }
    noResultsMessage={
      <FormattedMessage
        defaultMessage="No access bindings found"
        description="Empty state when MCP access binding search returns no results"
      />
    }
    emptyState={
      <Empty
        title={
          <FormattedMessage
            defaultMessage="Create endpoint"
            description="Empty state title for access bindings card grid"
          />
        }
        description={
          <FormattedMessage
            defaultMessage="Create and manage direct access endpoints for your MCP servers."
            description="Empty state description for access bindings card grid"
          />
        }
        button={
          <Button
            componentId="mlflow.mcp_registry.bindings.grid.empty_state.create"
            type="primary"
            icon={<PlusIcon />}
            onClick={onCreateBinding}
          >
            <FormattedMessage
              defaultMessage="Create access binding"
              description="Access bindings card grid empty state CTA button"
            />
          </Button>
        }
      />
    }
    renderItem={(binding) => <MCPAccessBindingCard binding={binding} />}
    getItemKey={(binding) => binding.id}
  />
);
