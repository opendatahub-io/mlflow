import {
  Alert,
  Button,
  Card,
  PlusIcon,
  Spinner,
  Tag,
  TrashIcon,
  Typography,
  useDesignSystemTheme,
} from '@databricks/design-system';
import { FormattedMessage, useIntl } from 'react-intl';

import type { MCPAccessBinding, MCPServer } from '../types';
import MCPRegistryRoutes from '../routes';
import { formatTransportType } from '../utils';
import { useNavigate } from '../../common/utils/RoutingUtils';
import Utils from '../../common/utils/Utils';

const BindingCard = ({
  binding,
  serverDescription,
  onEditBinding,
  onDeleteBinding,
}: {
  binding: MCPAccessBinding;
  serverDescription?: string;
  onEditBinding?: (binding: MCPAccessBinding) => void;
  onDeleteBinding?: (binding: MCPAccessBinding) => void;
}) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const navigate = useNavigate();
  const target = binding.server_alias || binding.server_version || '—';

  return (
    <Card
      componentId="mlflow.mcp_registry.detail.binding.card"
      width="100%"
      onClick={() => navigate(MCPRegistryRoutes.getAccessBindingDetailRoute(binding.server_name, binding.id))}
      dangerouslyAppendEmotionCSS={{
        cursor: 'pointer',
        '&:hover': {
          background: theme.colors.actionDefaultBackgroundHover,
        },
      }}
    >
      <div css={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
        <div css={{ display: 'flex', alignItems: 'flex-start', gap: theme.spacing.sm }}>
          <Typography.Text bold css={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {binding.url}
          </Typography.Text>
          <Tag componentId="mlflow.mcp_registry.detail.binding.transport" color="turquoise" css={{ flexShrink: 0 }}>
            {formatTransportType(binding.transport_type)}
          </Tag>
          {(onEditBinding || onDeleteBinding) && (
            <div
              css={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: theme.spacing.xs, flexShrink: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              {onEditBinding && (
                <Typography.Link
                  componentId="mlflow.mcp_registry.detail.binding.edit"
                  onClick={() => onEditBinding(binding)}
                >
                  <FormattedMessage defaultMessage="Edit" description="Edit access binding link" />
                </Typography.Link>
              )}
              {onDeleteBinding && (
                <Button
                  componentId="mlflow.mcp_registry.detail.binding.delete"
                  type="tertiary"
                  size="small"
                  icon={<TrashIcon />}
                  danger
                  onClick={() => onDeleteBinding(binding)}
                  aria-label={intl.formatMessage({
                    defaultMessage: 'Delete access binding',
                    description: 'Aria label for delete access binding button',
                  })}
                />
              )}
            </div>
          )}
        </div>
        {serverDescription && (
          <Typography.Text
            color="secondary"
            size="sm"
            css={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {serverDescription}
          </Typography.Text>
        )}
        <div css={{ display: 'flex', gap: theme.spacing.lg }}>
          <Typography.Text size="sm">
            <Typography.Text bold size="sm">
              <FormattedMessage defaultMessage="Target:" description="Binding card target label" />
            </Typography.Text>{' '}
            {target}
          </Typography.Text>
          <Typography.Text size="sm">
            <Typography.Text bold size="sm">
              <FormattedMessage defaultMessage="Updated:" description="Binding card updated label" />
            </Typography.Text>{' '}
            {binding.last_updated_timestamp ? Utils.formatTimestamp(binding.last_updated_timestamp, intl) : '—'}
          </Typography.Text>
        </div>
      </div>
    </Card>
  );
};

export const MCPServerAccessBindings = ({
  server,
  bindings,
  isLoading,
  error,
  onAddBinding,
  onEditBinding,
  onDeleteBinding,
  hideTitle,
}: {
  server?: MCPServer;
  bindings?: MCPAccessBinding[];
  isLoading?: boolean;
  error?: Error | null;
  onAddBinding?: () => void;
  onEditBinding?: (binding: MCPAccessBinding) => void;
  onDeleteBinding?: (binding: MCPAccessBinding) => void;
  hideTitle?: boolean;
}) => {
  const { theme } = useDesignSystemTheme();

  return (
    <div css={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
      {!hideTitle ? (
        <div css={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography.Title level={4} withoutMargins>
            <FormattedMessage defaultMessage="Access Bindings" description="MCP server access bindings section title" />
          </Typography.Title>
          {onAddBinding && (
            <Button
              componentId="mlflow.mcp_registry.detail.add_binding"
              icon={<PlusIcon />}
              onClick={onAddBinding}
              size="small"
            >
              <FormattedMessage
                defaultMessage="Add access binding"
                description="MCP server add access binding button"
              />
            </Button>
          )}
        </div>
      ) : onAddBinding ? (
        <div css={{ display: 'flex', justifyContent: 'flex-start' }}>
          <Button
            componentId="mlflow.mcp_registry.detail.add_binding"
            icon={<PlusIcon />}
            onClick={onAddBinding}
            size="small"
          >
            <FormattedMessage defaultMessage="Add access binding" description="MCP server add access binding button" />
          </Button>
        </div>
      ) : null}

      {error ? (
        <Alert
          componentId="mlflow.mcp_registry.detail.bindings_error"
          type="error"
          message={error.message}
          closable={false}
        />
      ) : isLoading ? (
        <div css={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: theme.spacing.lg }}>
          <Spinner size="small" />
        </div>
      ) : !bindings || bindings.length === 0 ? (
        <Typography.Text color="secondary">
          <FormattedMessage
            defaultMessage="No access bindings configured for this server."
            description="MCP server empty access bindings message"
          />
        </Typography.Text>
      ) : (
        <div css={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
          {bindings.map((binding) => (
            <BindingCard
              key={binding.id}
              binding={binding}
              serverDescription={server?.description}
              onEditBinding={onEditBinding}
              onDeleteBinding={onDeleteBinding}
            />
          ))}
        </div>
      )}
    </div>
  );
};
