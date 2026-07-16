import { useMemo } from 'react';
import {
  Button,
  ExpandMoreIcon,
  Spacer,
  Tag,
  Tooltip,
  Typography,
  useDesignSystemTheme,
} from '@databricks/design-system';
import { FormattedMessage, useIntl } from 'react-intl';
import { diffWords } from '../../experiment-tracking/pages/prompts/diff';

import type { TagColors } from '@databricks/design-system';
import type { MCPServerVersion } from '../types';
import { STATUS_TAG_COLOR } from '../utils';
import { AliasTag } from '../../common/components/AliasTag';
import { KeyValueTag } from '../../common/components/KeyValueTag';
import Utils from '../../common/utils/Utils';

const VersionMetadataGrid = ({
  version,
  aliasesByVersion,
  aliasColors,
}: {
  version?: MCPServerVersion;
  aliasesByVersion: Record<string, string[]>;
  aliasColors?: Record<string, TagColors>;
}) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();

  if (!version) return null;

  return (
    <div
      css={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr',
        gridAutoRows: `minmax(${theme.typography.lineHeightLg}, auto)`,
        alignItems: 'flex-start',
        rowGap: theme.spacing.xs,
        columnGap: theme.spacing.sm,
      }}
    >
      <Typography.Text bold>
        <FormattedMessage defaultMessage="Status:" description="MCP compare metadata status label" />
      </Typography.Text>
      <span>
        <Tag componentId="mlflow.mcp_registry.compare.status" color={STATUS_TAG_COLOR[version.status]}>
          {version.status}
        </Tag>
      </span>

      <Typography.Text bold>
        <FormattedMessage defaultMessage="Aliases:" description="MCP compare metadata aliases label" />
      </Typography.Text>
      <div css={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        {(aliasesByVersion[version.version] ?? []).length > 0 ? (
          (aliasesByVersion[version.version] ?? []).map((alias) => (
            <AliasTag key={alias} value={alias} color={aliasColors?.[alias]} />
          ))
        ) : (
          <Typography.Hint>—</Typography.Hint>
        )}
      </div>

      <Typography.Text bold>
        <FormattedMessage defaultMessage="Created:" description="MCP compare metadata created label" />
      </Typography.Text>
      <Typography.Text>
        {version.creation_timestamp ? Utils.formatTimestamp(version.creation_timestamp, intl) : '—'}
      </Typography.Text>

      {Object.keys(version.tags ?? {}).length > 0 && (
        <>
          <Typography.Text bold>
            <FormattedMessage defaultMessage="Metadata:" description="MCP compare metadata tags label" />
          </Typography.Text>
          <div css={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            {Object.entries(version.tags ?? {}).map(([key, value]) => (
              <KeyValueTag css={{ margin: 0 }} key={key} tag={{ key, value }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const MCPServerVersionCompare = ({
  baselineVersion,
  comparedVersion,
  serverName,
  aliasesByVersion,
  aliasColors,
  onSwitchSides,
}: {
  baselineVersion?: MCPServerVersion;
  comparedVersion?: MCPServerVersion;
  serverName: string;
  aliasesByVersion: Record<string, string[]>;
  aliasColors?: Record<string, TagColors>;
  onSwitchSides: () => void;
}) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();

  const baselineJson = useMemo(
    () => (baselineVersion?.server_json ? JSON.stringify(baselineVersion.server_json, null, 2) : ''),
    [baselineVersion?.server_json],
  );
  const comparedJson = useMemo(
    () => (comparedVersion?.server_json ? JSON.stringify(comparedVersion.server_json, null, 2) : ''),
    [comparedVersion?.server_json],
  );

  const diff = useMemo(() => diffWords(baselineJson, comparedJson) ?? [], [baselineJson, comparedJson]);

  const colors = useMemo(
    () => ({
      addedBackground: theme.isDarkMode ? theme.colors.green700 : theme.colors.green300,
      removedBackground: theme.isDarkMode ? theme.colors.red700 : theme.colors.red300,
    }),
    [theme],
  );

  const jsonPanelStyles = useMemo(
    () => ({
      flex: 1,
      margin: 0,
      padding: theme.spacing.md,
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: theme.borders.borderRadiusSm,
      overflow: 'auto' as const,
      fontSize: theme.typography.fontSizeSm,
      whiteSpace: 'pre-wrap' as const,
      wordBreak: 'break-word' as const,
    }),
    [theme],
  );

  return (
    <div
      css={{
        flex: 1,
        padding: theme.spacing.md,
        paddingTop: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography.Title level={3}>
        <FormattedMessage
          defaultMessage="Comparing version {baseline} with version {compared}"
          description="MCP server version compare heading"
          values={{
            baseline: baselineVersion?.version,
            compared: comparedVersion?.version,
          }}
        />
      </Typography.Title>

      <div css={{ display: 'flex' }}>
        <div css={{ flex: 1 }}>
          <VersionMetadataGrid
            version={baselineVersion}
            aliasesByVersion={aliasesByVersion}
            aliasColors={aliasColors}
          />
        </div>
        <div css={{ paddingLeft: theme.spacing.sm, paddingRight: theme.spacing.sm }}>
          <div css={{ width: theme.general.heightSm }} />
        </div>
        <div css={{ flex: 1 }}>
          <VersionMetadataGrid
            version={comparedVersion}
            aliasesByVersion={aliasesByVersion}
            aliasColors={aliasColors}
          />
        </div>
      </div>

      <Spacer shrinks={false} />

      <div css={{ display: 'flex', flex: 1, overflow: 'auto', alignItems: 'flex-start' }}>
        <pre css={jsonPanelStyles}>
          <code>
            {baselineJson ||
              intl.formatMessage({
                defaultMessage: 'Empty',
                description: 'Fallback for empty server JSON in compare view',
              })}
          </code>
        </pre>

        <div css={{ paddingLeft: theme.spacing.sm, paddingRight: theme.spacing.sm }}>
          <Tooltip
            componentId="mlflow.mcp_registry.compare.switch_sides.tooltip"
            content={
              <FormattedMessage
                defaultMessage="Switch sides"
                description="Label for button to switch MCP server versions in comparison view"
              />
            }
            side="top"
          >
            <Button
              aria-label={intl.formatMessage({
                defaultMessage: 'Switch sides',
                description: 'Label for button to switch MCP server versions in comparison view',
              })}
              componentId="mlflow.mcp_registry.compare.switch_sides"
              icon={<ExpandMoreIcon css={{ svg: { rotate: '90deg' } }} />}
              onClick={onSwitchSides}
            />
          </Tooltip>
        </div>

        <pre css={jsonPanelStyles}>
          <code>
            {diff.map((part, index) => (
              <span
                key={index}
                css={{
                  backgroundColor: part.added
                    ? colors.addedBackground
                    : part.removed
                      ? colors.removedBackground
                      : undefined,
                  textDecoration: part.removed ? 'line-through' : 'none',
                }}
              >
                {part.value}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
};
