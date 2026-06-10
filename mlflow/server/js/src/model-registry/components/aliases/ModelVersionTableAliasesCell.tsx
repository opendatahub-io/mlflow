import { Button, PencilIcon, Tooltip, useDesignSystemTheme } from '@databricks/design-system';
import type { TagColors } from '@databricks/design-system';
import { AliasTag } from '../../../common/components/AliasTag';
import { FormattedMessage } from 'react-intl';

interface ModelVersionTableAliasesCellProps {
  aliases?: string[];
  modelName: string;
  version: string;
  onAddEdit: () => void;
  className?: string;
  highlightedAliases?: string[];
  aliasColors?: Record<string, TagColors>;
  aliasTooltips?: Record<string, string>;
}

export const ModelVersionTableAliasesCell = ({
  aliases = [],
  onAddEdit,
  className,
  highlightedAliases,
  aliasColors,
  aliasTooltips,
}: ModelVersionTableAliasesCellProps) => {
  const { theme } = useDesignSystemTheme();

  return (
    <div
      css={{
        maxWidth: 300,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        '> *': {
          marginRight: '0 !important',
        },
        rowGap: theme.spacing.xs / 2,
        columnGap: theme.spacing.xs,
      }}
      className={className}
    >
      {aliases.length < 1 ? (
        <Button
          componentId="codegen_mlflow_app_src_model-registry_components_aliases_modelversiontablealiasescell.tsx_30"
          size="small"
          type="link"
          onClick={onAddEdit}
        >
          <FormattedMessage
            defaultMessage="Add"
            description="Model registry > model version table > aliases column > 'add' button label"
          />
        </Button>
      ) : (
        <>
          {aliases.map((alias) => {
            const color = aliasColors?.[alias] ?? (highlightedAliases?.includes(alias) ? 'turquoise' : undefined);
            const tooltip = aliasTooltips?.[alias];
            const tag = <AliasTag value={alias} css={{ marginTop: theme.spacing.xs / 2 }} color={color} />;
            return tooltip ? (
              <Tooltip
                key={alias}
                componentId={`mlflow.alias_tag.tooltip.${alias}`}
                content={tooltip}
              >
                <span css={{ display: 'inline-flex' }}>{tag}</span>
              </Tooltip>
            ) : (
              <AliasTag key={alias} value={alias} css={{ marginTop: theme.spacing.xs / 2 }} color={color} />
            );
          })}
          <Button
            componentId="codegen_mlflow_app_src_model-registry_components_aliases_modelversiontablealiasescell.tsx_41"
            size="small"
            icon={<PencilIcon />}
            onClick={onAddEdit}
          />
        </>
      )}
    </div>
  );
};
