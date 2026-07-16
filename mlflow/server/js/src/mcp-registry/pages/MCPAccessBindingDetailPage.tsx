import { useMemo, useState } from 'react';
import {
  Alert,
  Breadcrumb,
  Button,
  CopyIcon,
  DropdownMenu,
  Header,
  OverflowIcon,
  PencilIcon,
  Tooltip,
  Spacer,
  Spinner,
  Tag,
  Typography,
  useDesignSystemTheme,
} from '@databricks/design-system';
import { FormattedMessage, useIntl } from 'react-intl';

import { ScrollablePageWrapper } from '../../common/components/ScrollablePageWrapper';
import { isIntegrated } from '../../common/utils/embedUtils';
import { Link, useNavigate, useParams } from '../../common/utils/RoutingUtils';
import { withErrorBoundary } from '../../common/utils/withErrorBoundary';
import { copyToClipboard } from '../../common/utils/copyToClipboard';
import ErrorUtils from '../../common/utils/ErrorUtils';
import { ConfirmationModal } from '../../admin/ConfirmationModal';
import { ShowArtifactCodeSnippet } from '../../experiment-tracking/components/artifact-view-components/ShowArtifactCodeSnippet';
import MCPRegistryRoutes from '../routes';
import { useMCPAccessBindingQuery } from '../hooks/useMCPServerDetailQuery';
import { useDeleteAccessBindingMutation } from '../hooks/useAccessBindingMutation';
import { AccessBindingModal } from '../components/AccessBindingModal';
import { STATUS_TAG_COLOR, formatTransportType, resolveBindingDisplayName } from '../utils';
import Utils from '../../common/utils/Utils';

const buildClientConfig = (serverName: string, endpointUrl: string, transportType: string) =>
  JSON.stringify(
    {
      mcpServers: {
        [serverName]: {
          url: endpointUrl,
          type: transportType === 'streamable-http' ? 'http' : transportType,
        },
      },
    },
    null,
    2,
  );

const MCPAccessBindingDetailPage = () => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const navigate = useNavigate();
  const params = useParams<{ serverName: string; bindingId: string }>();
  const serverName = decodeURIComponent(params.serverName ?? '');
  const bindingId = params.bindingId ?? '';
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  const { data: binding, isLoading, error, refetch } = useMCPAccessBindingQuery(serverName, bindingId);

  const deleteMutation = useDeleteAccessBindingMutation();

  const clientConfig = useMemo(
    () => (binding ? buildClientConfig(binding.server_name, binding.url, binding.transport_type) : ''),
    [binding],
  );

  const breadcrumbs = (
    <Breadcrumb>
      <Breadcrumb.Item>
        <Link
          componentId="mlflow.mcp_registry.binding_detail.breadcrumb_back"
          to={MCPRegistryRoutes.mcpRegistryPageRoute}
        >
          <FormattedMessage defaultMessage="MCP Registry" description="MCP Registry breadcrumb link" />
        </Link>
      </Breadcrumb.Item>
    </Breadcrumb>
  );

  if (isLoading) {
    return (
      <ScrollablePageWrapper>
        <div
          css={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: 400,
          }}
        >
          <Spinner size="small" />
        </div>
      </ScrollablePageWrapper>
    );
  }

  if (error || !binding) {
    return (
      <ScrollablePageWrapper>
        {!isIntegrated() && <Spacer shrinks={false} />}
        <Header breadcrumbs={breadcrumbs} title="" />
        <Alert
          componentId="mlflow.mcp_registry.binding_detail.error"
          type="error"
          message={
            <FormattedMessage
              defaultMessage="Failed to load access binding"
              description="Access binding detail page error title"
            />
          }
          description={error?.message}
          closable={false}
        />
      </ScrollablePageWrapper>
    );
  }

  const displayName = resolveBindingDisplayName(binding);
  const description = binding.resolved_version?.server_json?.description;
  const target = binding.server_alias || binding.server_version || '—';
  const versionStatus = binding.resolved_version?.status;

  return (
    <ScrollablePageWrapper>
      {!isIntegrated() && <Spacer shrinks={false} />}
      <Header
        breadcrumbs={breadcrumbs}
        title={displayName}
        buttons={
          <>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button
                  componentId="mlflow.mcp_registry.binding_detail.actions"
                  icon={<OverflowIcon />}
                  aria-label={intl.formatMessage({
                    defaultMessage: 'More actions',
                    description: 'Aria label for access binding detail actions overflow menu',
                  })}
                />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content>
                <DropdownMenu.Item
                  componentId="mlflow.mcp_registry.binding_detail.actions.delete"
                  onClick={() => setDeleteModalVisible(true)}
                >
                  <FormattedMessage defaultMessage="Delete" description="Access binding detail delete action" />
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
            <Button
              componentId="mlflow.mcp_registry.binding_detail.edit"
              icon={<PencilIcon />}
              onClick={() => setEditModalOpen(true)}
            >
              <FormattedMessage defaultMessage="Edit binding" description="Access binding detail edit button" />
            </Button>
          </>
        }
      />
      <Spacer shrinks={false} />
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
        {description && (
          <>
            <Typography.Text bold>
              <FormattedMessage defaultMessage="Description:" description="Binding detail description label" />
            </Typography.Text>
            <Typography.Text>{description}</Typography.Text>
          </>
        )}

        <Typography.Text bold>
          <FormattedMessage defaultMessage="Endpoint URL:" description="Binding detail endpoint URL label" />
        </Typography.Text>
        <span css={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
          <Typography.Text>{binding.url}</Typography.Text>
          <Tooltip
            componentId="mlflow.mcp_registry.binding_detail.copy_tooltip"
            content={intl.formatMessage({
              defaultMessage: 'Copy endpoint URL',
              description: 'Tooltip for copy endpoint URL button on binding detail',
            })}
          >
            <Button
              componentId="mlflow.mcp_registry.binding_detail.copy_endpoint"
              size="small"
              icon={<CopyIcon />}
              onClick={() => copyToClipboard(binding.url)}
              css={{ flexShrink: 0 }}
            />
          </Tooltip>
        </span>

        <Typography.Text bold>
          <FormattedMessage defaultMessage="Transport:" description="Binding detail transport label" />
        </Typography.Text>
        <Typography.Text>{formatTransportType(binding.transport_type)}</Typography.Text>

        <Typography.Text bold>
          <FormattedMessage defaultMessage="MCP server:" description="Binding detail MCP server label" />
        </Typography.Text>
        <Link
          componentId="mlflow.mcp_registry.binding_detail.server_link"
          to={MCPRegistryRoutes.getMCPServerDetailRoute(
            binding.server_name,
            binding.resolved_version?.version ?? binding.server_version,
          )}
        >
          {binding.server_name}
        </Link>

        <Typography.Text bold>
          <FormattedMessage defaultMessage="Version/Alias:" description="Binding detail version or alias label" />
        </Typography.Text>
        <span css={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
          <Typography.Text>{target}</Typography.Text>
          {versionStatus && (
            <Tag
              componentId="mlflow.mcp_registry.binding_detail.version_status"
              color={STATUS_TAG_COLOR[versionStatus]}
            >
              {versionStatus}
            </Tag>
          )}
        </span>

        <Typography.Text bold>
          <FormattedMessage defaultMessage="Last updated:" description="Binding detail last updated label" />
        </Typography.Text>
        <Typography.Text>
          {binding.last_updated_timestamp ? Utils.formatTimestamp(binding.last_updated_timestamp, intl) : '—'}
        </Typography.Text>

        <Typography.Text bold>
          <FormattedMessage defaultMessage="Updated by:" description="Binding detail updated by label" />
        </Typography.Text>
        <Typography.Text>{binding.last_updated_by || '—'}</Typography.Text>

        <Typography.Text bold>
          <FormattedMessage defaultMessage="Created at:" description="Binding detail created at label" />
        </Typography.Text>
        <Typography.Text>
          {binding.creation_timestamp ? Utils.formatTimestamp(binding.creation_timestamp, intl) : '—'}
        </Typography.Text>

        <Typography.Text bold>
          <FormattedMessage defaultMessage="Created by:" description="Binding detail created by label" />
        </Typography.Text>
        <Typography.Text>{binding.created_by || '—'}</Typography.Text>
      </div>

      <Spacer shrinks={false} size="lg" />
      <Typography.Title level={4}>
        <FormattedMessage
          defaultMessage="Client configuration"
          description="Binding detail client config section title"
        />
      </Typography.Title>
      <ShowArtifactCodeSnippet code={clientConfig} />

      <AccessBindingModal
        visible={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onSuccess={() => refetch()}
        editBinding={binding}
        lockedServer={binding.server_name}
      />

      <ConfirmationModal
        componentId="mlflow.mcp_registry.binding_detail.delete_modal"
        title={intl.formatMessage({
          defaultMessage: 'Delete access binding',
          description: 'Access binding delete confirmation modal title',
        })}
        visible={deleteModalVisible}
        message={
          <FormattedMessage
            defaultMessage="Are you sure you want to delete this access binding? This action cannot be undone."
            description="Access binding delete confirmation message"
          />
        }
        isLoading={deleteMutation.isLoading}
        error={deleteMutation.error?.message ?? null}
        onConfirm={() => {
          deleteMutation.mutate(
            { serverName: binding.server_name, bindingId: binding.id },
            {
              onSuccess: () => {
                setDeleteModalVisible(false);
                navigate(MCPRegistryRoutes.mcpRegistryPageRoute);
              },
            },
          );
        }}
        onCancel={() => {
          deleteMutation.reset();
          setDeleteModalVisible(false);
        }}
      />
    </ScrollablePageWrapper>
  );
};

export default withErrorBoundary(ErrorUtils.mlflowServices.MCP_REGISTRY, MCPAccessBindingDetailPage);
