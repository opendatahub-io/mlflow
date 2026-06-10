import { Card, ConnectIcon, Typography, useDesignSystemTheme } from '@databricks/design-system';

import type { MCPAccessBinding } from '../types';
import { resolveBindingDisplayName } from '../utils';
import { CardIconWrapper } from './CardIconWrapper';

export const MCPAccessBindingCard = ({ binding }: { binding: MCPAccessBinding }) => {
  const { theme } = useDesignSystemTheme();

  const displayName = resolveBindingDisplayName(binding);
  const description = binding.resolved_version?.server_json?.description;
  const target = binding.server_alias || binding.server_version || undefined;

  return (
    <Card
      componentId="mlflow.mcp_registry.bindings.card"
      width="100%"
      dangerouslyAppendEmotionCSS={{
        borderLeft: `3px solid ${theme.colors.actionPrimaryBackgroundDefault}`,
        height: '100%',
        '&:hover': {
          background: theme.colors.actionDefaultBackgroundHover,
        },
      }}
    >
      <div css={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
        <div css={{ display: 'flex', alignItems: 'flex-start', gap: theme.spacing.sm }}>
          <CardIconWrapper>
            <ConnectIcon />
          </CardIconWrapper>
          <Typography.Text bold css={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </Typography.Text>
          {target && (
            <Typography.Text color="secondary" size="sm" css={{ flexShrink: 0 }}>
              {target}
            </Typography.Text>
          )}
        </div>
        {description && (
          <Typography.Text
            color="secondary"
            size="sm"
            css={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {description}
          </Typography.Text>
        )}
      </div>
    </Card>
  );
};
