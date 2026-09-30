import { Typography } from '@databricks/design-system';
import type { ColumnDef } from '@tanstack/react-table';
import type { RegisteredPrompt } from '../types';
import { PromptModelName } from './PromptModelName';

export const PromptsListTableModelCell: ColumnDef<RegisteredPrompt>['cell'] = ({ getValue }) => {
  const rawValue = getValue();
  const modelName = typeof rawValue === 'string' ? rawValue : undefined;

  if (!modelName) {
    return <Typography.Text color="secondary">-</Typography.Text>;
  }

  return <PromptModelName modelName={modelName} componentId="mlflow.prompts.list.model.tooltip" />;
};
