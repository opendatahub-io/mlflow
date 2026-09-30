import { TruncationTooltip } from '@databricks/design-system';

export const PromptModelName = ({ modelName, componentId }: { modelName: string; componentId: string }) => (
  <TruncationTooltip componentId={componentId}>
    <span css={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {modelName}
    </span>
  </TruncationTooltip>
);
