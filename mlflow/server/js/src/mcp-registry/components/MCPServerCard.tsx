import { McpIcon, Typography, useDesignSystemTheme } from '@databricks/design-system';
import { useIntl } from 'react-intl';

import type { MCPServer } from '../types';
import MCPRegistryRoutes from '../routes';
import { resolveDisplayName } from '../utils';
import { Link } from '../../common/utils/RoutingUtils';
import Utils from '../../common/utils/Utils';

export const MCPServerCard = ({ server }: { server: MCPServer }) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();

  const displayName = resolveDisplayName(server);
  const timestamp = server.last_updated_timestamp
    ? Utils.formatTimestamp(server.last_updated_timestamp, intl)
    : undefined;

  return (
    <Link
      componentId="mlflow.mcp_registry.card.link"
      to={MCPRegistryRoutes.getMCPServerDetailRoute(server.name)}
      css={{
        textDecoration: 'none',
        color: 'inherit',
        height: '100%',
        '&:hover': { textDecoration: 'none', color: 'inherit' },
      }}
    >
      <div
        css={{
          border: `1px solid ${theme.colors.borderDecorative}`,
          borderRadius: theme.borders.borderRadiusMd,
          background: theme.colors.backgroundPrimary,
          padding: theme.spacing.md,
          display: 'flex',
          gap: theme.spacing.sm,
          boxShadow: theme.shadows.sm,
          transition: 'background 150ms ease',
          height: '100%',
          '&:hover': {
            background: theme.colors.actionDefaultBackgroundHover,
          },
          '&:active': {
            background: theme.colors.actionDefaultBackgroundPress,
          },
        }}
      >
        <McpIcon css={{ flexShrink: 0, color: theme.colors.textSecondary }} />
        <div css={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs, overflow: 'hidden' }}>
          <Typography.Text bold css={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </Typography.Text>
          {server.description && (
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
              {server.description}
            </Typography.Text>
          )}
          {timestamp && (
            <Typography.Text color="secondary" size="sm">
              {timestamp}
            </Typography.Text>
          )}
        </div>
      </div>
    </Link>
  );
};
