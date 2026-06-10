import { useMemo, useState } from 'react';
import {
  Button,
  McpIcon,
  Modal,
  PlayIcon,
  Spacer,
  Tag,
  TrashIcon,
  Typography,
  useDesignSystemTheme,
} from '@databricks/design-system';
import { FormattedMessage, useIntl } from 'react-intl';

import type { MCPAccessBinding, MCPServer, MCPServerVersion } from '../types';
import { STATUS_TAG_COLOR, resolveDisplayName, resolveVersionDisplayName } from '../utils';
import { ServerJSONViewer } from './ServerJSONViewer';
import { MCPServerAccessBindings } from './MCPServerAccessBindings';
import { UpdateVersionStatusModal } from './UpdateVersionStatusModal';
import { ConfirmationModal } from '../../admin/ConfirmationModal';
import { ShowArtifactCodeSnippet } from '../../experiment-tracking/components/artifact-view-components/ShowArtifactCodeSnippet';
import { ModelVersionTableAliasesCell } from '../../model-registry/components/aliases/ModelVersionTableAliasesCell';
import { useUpdateMCPServerVersionStatus, useDeleteMCPServerVersion } from '../hooks/useMCPServerVersionMutations';
import Utils from '../../common/utils/Utils';

const EMPTY_ALIASES: string[] = [];

const buildUsageSnippet = (serverName: string, version: string) =>
  `import mlflow

client = mlflow.MlflowClient()

# Get the MCP server version from the registry
version = client.get_mcp_server_version(
    name="${serverName}",
    version="${version}",
)

# The server_json contains the full MCP server definition
server_json = version.server_json
print(f"Server: {server_json['name']} v{server_json['version']}")
print(f"Description: {server_json.get('description', '')}")

# Access the declared tools
for tool in version.tools or []:
    print(f"Tool: {tool['name']} - {tool.get('description', '')}")
`;

export const MCPServerVersionDetail = ({
  server,
  version,
  bindings,
  bindingsLoading,
  bindingsError,
  aliasesByVersion,
  showEditAliasesModal,
  onAddBinding,
}: {
  server: MCPServer;
  version?: MCPServerVersion;
  bindings?: MCPAccessBinding[];
  bindingsLoading?: boolean;
  bindingsError?: Error | null;
  aliasesByVersion: Record<string, string[]>;
  showEditAliasesModal?: (versionNumber: string) => void;
  onAddBinding?: () => void;
}) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [showUsageExample, setShowUsageExample] = useState(false);

  const updateStatusMutation = useUpdateMCPServerVersionStatus(server.name);
  const deleteVersionMutation = useDeleteMCPServerVersion(server.name);

  const usageSnippet = useMemo(
    () => (version ? buildUsageSnippet(server.name, version.version) : ''),
    [server.name, version],
  );

  if (!version) {
    return (
      <div
        css={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.spacing.lg,
        }}
      >
        <Typography.Text color="secondary">
          <FormattedMessage
            defaultMessage="Select a version to view details."
            description="MCP server detail placeholder when no version is selected"
          />
        </Typography.Text>
      </div>
    );
  }

  const displayName = resolveDisplayName(server);

  return (
    <div css={{ flex: 1, padding: theme.spacing.md, overflow: 'auto' }}>
      <div css={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Typography.Title level={3} withoutMargins>
          <FormattedMessage
            defaultMessage="Viewing version {version}"
            description="MCP server version detail heading"
            values={{ version: version.version }}
          />
        </Typography.Title>
        <div css={{ display: 'flex', gap: theme.spacing.sm }}>
          <Button
            componentId="mlflow.mcp_registry.detail.delete_version"
            icon={<TrashIcon />}
            type="primary"
            danger
            onClick={() => setDeleteModalVisible(true)}
          >
            <FormattedMessage defaultMessage="Delete version" description="MCP server delete version button" />
          </Button>
          <Button
            componentId="mlflow.mcp_registry.detail.use_version"
            icon={<PlayIcon />}
            onClick={() => setShowUsageExample(true)}
          >
            <FormattedMessage defaultMessage="Use" description="MCP server use version button" />
          </Button>
        </div>
      </div>

      <Spacer shrinks={false} />
      <div css={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
        <McpIcon css={{ flexShrink: 0, color: theme.colors.textSecondary }} />
        <div css={{ display: 'flex', flexDirection: 'column' }}>
          <Typography.Text bold>{displayName}</Typography.Text>
          <Typography.Text color="secondary" size="sm">
            {server.name}
          </Typography.Text>
        </div>
      </div>

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
        <Typography.Text bold>
          <FormattedMessage defaultMessage="Name:" description="MCP server version detail name label" />
        </Typography.Text>
        <Typography.Text>{server.name}</Typography.Text>

        <Typography.Text bold>
          <FormattedMessage defaultMessage="Display name:" description="MCP server version detail display name label" />
        </Typography.Text>
        <Typography.Text>{resolveVersionDisplayName(version, displayName)}</Typography.Text>

        <Typography.Text bold>
          <FormattedMessage defaultMessage="Aliases:" description="MCP server version detail aliases label" />
        </Typography.Text>
        <div>
          <ModelVersionTableAliasesCell
            css={{ maxWidth: 'none' }}
            modelName={server.name}
            version={version.version}
            aliases={aliasesByVersion[version.version] ?? EMPTY_ALIASES}
            onAddEdit={() => {
              showEditAliasesModal?.(version.version);
            }}
          />
        </div>

        <Typography.Text bold>
          <FormattedMessage defaultMessage="Status:" description="MCP server version detail status label" />
        </Typography.Text>
        <span css={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
          <Tag componentId="mlflow.mcp_registry.detail.version_status" color={STATUS_TAG_COLOR[version.status]}>
            {version.status}
          </Tag>
          <Typography.Link
            componentId="mlflow.mcp_registry.detail.edit_status"
            onClick={() => setStatusModalVisible(true)}
          >
            <FormattedMessage defaultMessage="Edit" description="MCP server edit status link" />
          </Typography.Link>
        </span>

        <Typography.Text bold>
          <FormattedMessage
            defaultMessage="Server version:"
            description="MCP server version detail server version label"
          />
        </Typography.Text>
        <Typography.Text>{version.server_json?.version || version.version}</Typography.Text>

        <Typography.Text bold>
          <FormattedMessage defaultMessage="Description:" description="MCP server version detail description label" />
        </Typography.Text>
        <Typography.Text>{version.server_json?.description || server.description || '—'}</Typography.Text>

        {version.server_json?.websiteUrl && (
          <>
            <Typography.Text bold>
              <FormattedMessage defaultMessage="Website:" description="MCP server version detail website label" />
            </Typography.Text>
            <Typography.Link
              componentId="mlflow.mcp_registry.detail.website"
              href={version.server_json.websiteUrl}
              target="_blank"
            >
              {version.server_json.websiteUrl}
            </Typography.Link>
          </>
        )}

        {version.server_json?.repository?.url && (
          <>
            <Typography.Text bold>
              <FormattedMessage defaultMessage="Repository:" description="MCP server version detail repository label" />
            </Typography.Text>
            <Typography.Link
              componentId="mlflow.mcp_registry.detail.repository"
              href={version.server_json.repository.url}
              target="_blank"
            >
              {version.server_json.repository.url}
            </Typography.Link>
          </>
        )}

        <Typography.Text bold>
          <FormattedMessage
            defaultMessage="Registered at:"
            description="MCP server version detail registered at label"
          />
        </Typography.Text>
        <Typography.Text>
          {version.creation_timestamp ? Utils.formatTimestamp(version.creation_timestamp, intl) : '—'}
        </Typography.Text>
      </div>

      {version.server_json && <ServerJSONViewer serverJson={version.server_json} />}

      <Spacer shrinks={false} size="lg" />
      <MCPServerAccessBindings
        server={server}
        bindings={bindings}
        isLoading={bindingsLoading}
        error={bindingsError}
        onAddBinding={onAddBinding}
      />

      <UpdateVersionStatusModal
        visible={statusModalVisible}
        currentStatus={version.status}
        isLoading={updateStatusMutation.isLoading}
        error={updateStatusMutation.error}
        onUpdate={(newStatus) => {
          updateStatusMutation.mutate(
            { version: version.version, status: newStatus },
            { onSuccess: () => setStatusModalVisible(false) },
          );
        }}
        onCancel={() => {
          updateStatusMutation.reset();
          setStatusModalVisible(false);
        }}
      />

      <ConfirmationModal
        componentId="mlflow.mcp_registry.detail.delete_version_modal"
        title={intl.formatMessage({
          defaultMessage: 'Delete version',
          description: 'MCP server delete version confirmation modal title',
        })}
        visible={deleteModalVisible}
        message={
          <FormattedMessage
            defaultMessage="Are you sure you want to delete version {version}? This action cannot be undone."
            description="MCP server delete version confirmation message"
            values={{ version: version.version }}
          />
        }
        isLoading={deleteVersionMutation.isLoading}
        error={deleteVersionMutation.error?.message ?? null}
        onConfirm={() => {
          deleteVersionMutation.mutate(version.version, {
            onSuccess: () => setDeleteModalVisible(false),
          });
        }}
        onCancel={() => {
          deleteVersionMutation.reset();
          setDeleteModalVisible(false);
        }}
      />

      <Modal
        componentId="mlflow.mcp_registry.detail.usage_example_modal"
        title={<FormattedMessage defaultMessage="Usage example" description="MCP server usage example modal title" />}
        visible={showUsageExample}
        onCancel={() => setShowUsageExample(false)}
        cancelText={intl.formatMessage({
          defaultMessage: 'Dismiss',
          description: 'MCP server usage example modal dismiss button',
        })}
      >
        <ShowArtifactCodeSnippet code={usageSnippet} />
      </Modal>
    </div>
  );
};
