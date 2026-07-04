import { Tooltip, Typography, useDesignSystemTheme } from '@databricks/design-system';
import type { ColumnDef } from '@tanstack/react-table';
import { FormattedMessage } from 'react-intl';
import { first } from 'lodash';
import type { RegisteredPrompt } from '../types';
import { getModelConfigFromTags } from '../utils';

const MAX_MODEL_NAME_WIDTH = 200;

export const PromptsListTableModelCell: ColumnDef<RegisteredPrompt>['cell'] = ({ row: { original } }) => {
  const { theme } = useDesignSystemTheme();
  const latestVersion = first(original.latest_versions);
  const modelConfig = getModelConfigFromTags(latestVersion?.tags);
  const modelName = modelConfig?.model_name;

  if (!modelName) {
    return (
      <Typography.Text color="secondary">
        <FormattedMessage
          defaultMessage="Not specified"
          description="Placeholder text shown when a prompt has no associated model in the prompt registry table"
        />
      </Typography.Text>
    );
  }

  return (
    <Tooltip content={modelName} componentId="mlflow.prompts.list.model_name_tooltip">
      <Typography.Text
        css={{
          maxWidth: MAX_MODEL_NAME_WIDTH,
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
