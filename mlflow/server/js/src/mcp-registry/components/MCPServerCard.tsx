import { Card, McpIcon, Typography, useDesignSystemTheme } from '@databricks/design-system';
import { FormattedMessage, useIntl } from 'react-intl';

import type { MCPServer } from '../types';
import MCPRegistryRoutes from '../routes';
import { useNavigate } from '../../common/utils/RoutingUtils';
import { resolveDisplayName, resolveIconSrc } from '../utils';
import { useLatestMCPServerVersionQuery } from '../hooks/useMCPServerDetailQuery';
import { CardIconWrapper } from './CardIconWrapper';
import { MCPServerIcon } from './MCPServerIcon';
import Utils from '../../common/utils/Utils';

export const MCPServerCard = ({ server }: { server: MCPServer }) => {
  const { theme } = useDesignSystemTheme();
  const navigate = useNavigate();
  const intl = useIntl();
  const { data: latestVersion } = useLatestMCPServerVersionQuery(server.name, !server.latest_version);

  const displayName = resolveDisplayName(server);
  const latestVersionDisplay = server.latest_version || latestVersion?.version;
  const timestamp = server.last_updated_timestamp
    ? Utils.formatTimestamp(server.last_updated_timestamp, intl)
    : undefined;

  return (
    <Card
      componentId="mlflow.mcp_registry.card"
      width="100%"
      onClick={() => navigate(MCPRegistryRoutes.getMCPServerDetailRoute(server.name))}
      dangerouslyAppendEmotionCSS={{ height: '100%' }}
    >
      <div css={{ display: 'flex', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <CardIconWrapper>
          <MCPServerIcon iconSrc={resolveIconSrc(server.icons) || resolveIconSrc(latestVersion?.server_json?.icons)} />
        </CardIconWrapper>
        <div css={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs, overflow: 'hidden', flex: 1 }}>
          <div css={{ display: 'flex', alignItems: 'flex-start', gap: theme.spacing.sm }}>
            <Typography.Text bold css={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </Typography.Text>
            {latestVersionDisplay && (
              <Typography.Text color="secondary" size="sm" css={{ marginLeft: 'auto', flexShrink: 0 }}>
                {latestVersionDisplay}
              </Typography.Text>
            )}
          </div>
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
    </Card>
  );
};
