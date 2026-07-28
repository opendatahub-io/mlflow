import { Tooltip, Typography } from '@databricks/design-system';
import type { ColumnDef } from '@tanstack/react-table';
import { FormattedMessage } from 'react-intl';
import type { RegisteredPrompt } from '../types';

export const PromptsListTableModelCell: ColumnDef<RegisteredPrompt>['cell'] = ({ getValue }) => {
  const modelName = getValue<string>();

  if (!modelName) {
    return (
      <Typography.Text color="secondary">
        <FormattedMessage
          defaultMessage="Not specified"
          description="Fallback text shown in the Associated Model column when a prompt has no model configuration"
        />
      </Typography.Text>
    );
  }

  return (
    <Tooltip content={modelName} componentId="mlflow.prompts.list.model.tooltip">
      <Typography.Text
        css={{
          maxWidth: 200,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'block',
        }}
      >
        {modelName}
      </Typography.Text>
    </Tooltip>
  );
};
