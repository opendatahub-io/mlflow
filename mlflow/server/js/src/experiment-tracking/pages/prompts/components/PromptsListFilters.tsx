import { TableFilterInput, TableFilterLayout } from '@databricks/design-system';
import type { ReactNode } from 'react';
import { ModelSearchInputHelpTooltip } from '../../../../model-registry/components/model-list/ModelListFilters';
import type { RegisteredPrompt } from '../types';
import { PromptsListModelSelector } from './PromptsListModelSelector';

export const PromptsListFilters = ({
  searchFilter,
  onSearchFilterChange,
  modelFilter,
  setModelFilter,
  prompts,
  componentId,
  actions,
}: {
  searchFilter: string;
  onSearchFilterChange: (searchFilter: string) => void;
  modelFilter?: string;
  setModelFilter: (modelFilter?: string) => void;
  prompts: RegisteredPrompt[];
  componentId: string;
  actions?: ReactNode;
}) => {
  return (
    <TableFilterLayout>
      <TableFilterInput
        placeholder="Search prompts by name"
        componentId={componentId}
        value={searchFilter}
        onChange={(e) => onSearchFilterChange(e.target.value)}
        suffix={<ModelSearchInputHelpTooltip exampleEntityName="my-prompt-name" />}
      />
      <PromptsListModelSelector modelFilter={modelFilter} setModelFilter={setModelFilter} prompts={prompts} />
      {actions}
    </TableFilterLayout>
  );
};
