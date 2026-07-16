import { Button, PencilIcon, useDesignSystemTheme } from '@databricks/design-system';
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
}

export const ModelVersionTableAliasesCell = ({
  aliases = [],
  onAddEdit,
  className,
  highlightedAliases,
  aliasColors,
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
            return <AliasTag key={alias} value={alias} css={{ marginTop: theme.spacing.xs / 2 }} color={color} />;
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
