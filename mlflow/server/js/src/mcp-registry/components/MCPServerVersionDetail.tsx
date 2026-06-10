import { useState } from 'react';
import {
  Alert,
  Button,
  Input,
  McpIcon,
  Modal,
  PencilIcon,
  Spacer,
  Tag,
  Tooltip,
  TrashIcon,
  Typography,
  useDesignSystemTheme,
} from '@databricks/design-system';
import type { TagColors } from '@databricks/design-system';
import { FormattedMessage, useIntl } from 'react-intl';

import type { MCPAccessBinding, MCPServer, MCPServerVersion } from '../types';
import { STATUS_TAG_COLOR, resolveDisplayName, resolveVersionDisplayName } from '../utils';
import { ServerJSONViewer } from './ServerJSONViewer';
import { MCPServerAccessBindings } from './MCPServerAccessBindings';
import { UpdateVersionStatusModal } from './UpdateVersionStatusModal';
import { ConfirmationModal } from '../../admin/ConfirmationModal';
import { ModelVersionTableAliasesCell } from '../../model-registry/components/aliases/ModelVersionTableAliasesCell';
import {
  useUpdateMCPServerVersionStatus,
  useUpdateMCPServerVersionDisplayName,
  useDeleteMCPServerVersion,
} from '../hooks/useMCPServerVersionMutations';
import { UpdateVersionDisplayNameModal } from './UpdateVersionDisplayNameModal';
import { KeyValueTag } from '../../common/components/KeyValueTag';
import Utils from '../../common/utils/Utils';

const EMPTY_ALIASES: string[] = [];

export const MCPServerVersionDetail = ({
  server,
  version,
  bindings,
  bindingsLoading,
  bindingsError,
  aliasesByVersion,
  aliasColors,
  showEditAliasesModal,
  onAddBinding,
  onEditBinding,
  onDeleteBinding,
  onEditMetadata,
  onSetLatest,
  setLatestLoading,
  setLatestError,
  onClearLatestError,
  resolvedLatestVersion,
  onUpdateDescription,
}: {
  server: MCPServer;
  version?: MCPServerVersion;
  bindings?: MCPAccessBinding[];
  bindingsLoading?: boolean;
  bindingsError?: Error | null;
  aliasesByVersion: Record<string, string[]>;
  aliasColors?: Record<string, TagColors>;
  showEditAliasesModal?: (versionNumber: string) => void;
  onAddBinding?: () => void;
  onEditBinding?: (binding: MCPAccessBinding) => void;
  onDeleteBinding?: (binding: MCPAccessBinding) => void;
  onEditMetadata?: (version: MCPServerVersion) => void;
  onSetLatest?: (version: string | null) => void;
  setLatestLoading?: boolean;
  setLatestError?: Error | null;
  onClearLatestError?: () => void;
  resolvedLatestVersion?: string;
  onUpdateDescription?: (description: string | null) => Promise<void>;
}) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [displayNameModalVisible, setDisplayNameModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [descriptionModalVisible, setDescriptionModalVisible] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [descriptionSaving, setDescriptionSaving] = useState(false);
  const [descriptionError, setDescriptionError] = useState<Error | null>(null);

  const updateStatusMutation = useUpdateMCPServerVersionStatus(server.name);
  const updateDisplayNameMutation = useUpdateMCPServerVersionDisplayName(server.name);
  const deleteVersionMutation = useDeleteMCPServerVersion(server.name);

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
  const versionDisplayName = version.display_name || version.server_json?.title;
  const showVersionDisplayName = versionDisplayName && versionDisplayName !== displayName;

  const isPinned = server.latest_version === version.version;
  const isResolvedLatest = resolvedLatestVersion === version.version;
  const isDraftVersion = version.status === 'draft';
  const setLatestDisabled = !isPinned && !isResolvedLatest && isDraftVersion;

  const setLatestLabel = isPinned ? (
    <FormattedMessage defaultMessage="Unpin latest" description="MCP server unpin latest version button" />
  ) : isResolvedLatest && !server.latest_version ? (
    <FormattedMessage defaultMessage="Pin as latest" description="MCP server pin as latest version button" />
  ) : (
    <FormattedMessage defaultMessage="Set as latest" description="MCP server set as latest version button" />
  );

  const setLatestOnClick = isPinned ? () => onSetLatest?.(null) : () => onSetLatest?.(version.version);

  return (
    <div css={{ flex: 1, padding: theme.spacing.md, overflow: 'auto' }}>
      <div css={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <div css={{ minWidth: 0, flex: 1 }}>
          <Typography.Title level={3} withoutMargins>
            <FormattedMessage
              defaultMessage="Viewing version {version}"
              description="MCP server version detail heading"
              values={{ version: version.version }}
            />
          </Typography.Title>
          {showVersionDisplayName && (
            <div css={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs, minWidth: 0 }}>
              <Typography.Text
                color="secondary"
                css={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={versionDisplayName}
              >
                {versionDisplayName}
              </Typography.Text>
              <Button
                componentId="mlflow.mcp_registry.detail.version.edit_display_name"
                size="small"
                icon={<PencilIcon />}
                onClick={() => setDisplayNameModalVisible(true)}
              />
            </div>
          )}
          {(() => {
            const description = server.description;
            return description ? (
              <div css={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs, marginTop: theme.spacing.xs }}>
                <Typography.Hint>{description}</Typography.Hint>
                <Button
                  componentId="mlflow.mcp_registry.detail.version.edit_description"
                  size="small"
                  icon={<PencilIcon />}
                  onClick={() => {
                    setDescriptionDraft(description);
                    setDescriptionModalVisible(true);
                  }}
                />
              </div>
            ) : (
              <Button
                componentId="mlflow.mcp_registry.detail.version.add_description"
                size="small"
                type="link"
                css={{ marginTop: theme.spacing.xs, padding: 0 }}
                onClick={() => {
                  setDescriptionDraft('');
                  setDescriptionModalVisible(true);
                }}
              >
                <FormattedMessage defaultMessage="Add description" description="MCP server version add description button" />
              </Button>
            );
          })()}
        </div>
        <div css={{ display: 'flex', gap: theme.spacing.sm, flexShrink: 0 }}>
          {onSetLatest && (() => {
            const button = (
              <Button
                componentId="mlflow.mcp_registry.detail.set_latest"
                disabled={setLatestDisabled}
                loading={setLatestLoading}
                onClick={setLatestOnClick}
              >
                {setLatestLabel}
              </Button>
            );
            return setLatestDisabled ? (
              <Tooltip
                componentId="mlflow.mcp_registry.detail.set_latest.tooltip"
                content={intl.formatMessage({
                  defaultMessage: 'Draft versions cannot be set as latest',
                  description: 'Tooltip explaining why set as latest is disabled for draft versions',
                })}
              >
                {button}
              </Tooltip>
            ) : button;
          })()}
          <Button
            componentId="mlflow.mcp_registry.detail.delete_version"
            icon={<TrashIcon />}
            type="primary"
            danger
            onClick={() => setDeleteModalVisible(true)}
          >
            <FormattedMessage defaultMessage="Delete version" description="MCP server delete version button" />
          </Button>
        </div>
      </div>

      {setLatestError && (
        <>
          <Spacer shrinks={false} />
          <Alert
            componentId="mlflow.mcp_registry.detail.set_latest_error"
            type="error"
            closable
            onClose={onClearLatestError}
            message={setLatestError.message}
          />
        </>
      )}
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
          <FormattedMessage defaultMessage="Aliases:" description="MCP server version detail aliases label" />
        </Typography.Text>
        <div>
          <ModelVersionTableAliasesCell
            css={{ maxWidth: 'none' }}
            modelName={server.name}
            version={version.version}
            aliases={aliasesByVersion[version.version] ?? EMPTY_ALIASES}
            aliasColors={aliasColors}
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
          <Button
            componentId="mlflow.mcp_registry.detail.edit_status"
            size="small"
            icon={<PencilIcon />}
            onClick={() => setStatusModalVisible(true)}
          />
        </span>

        <Typography.Text bold>
          <FormattedMessage
            defaultMessage="Server version:"
            description="MCP server version detail server version label"
          />
        </Typography.Text>
        <Typography.Text>{version.server_json?.version || version.version}</Typography.Text>

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

        <Typography.Text bold>
          <FormattedMessage defaultMessage="Metadata:" description="MCP server version detail metadata label" />
        </Typography.Text>
        <div>
          <div css={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs, alignItems: 'center' }}>
            {Object.keys(version.tags).length > 0 ? (
              Object.entries(version.tags).map(([key, value]) => (
                <KeyValueTag css={{ margin: 0 }} key={key} tag={{ key, value }} />
              ))
            ) : (
              !onEditMetadata && <Typography.Hint>—</Typography.Hint>
            )}
            {onEditMetadata &&
              (Object.keys(version.tags).length > 0 ? (
                <Button
                  componentId="mlflow.mcp_registry.detail.version.edit_metadata"
                  size="small"
                  icon={<PencilIcon />}
                  onClick={() => onEditMetadata(version)}
                />
              ) : (
                <Button
                  componentId="mlflow.mcp_registry.detail.version.add_metadata"
                  size="small"
                  type="link"
                  onClick={() => onEditMetadata(version)}
                >
                  <FormattedMessage defaultMessage="Add" description="MCP server version detail add metadata button" />
                </Button>
              ))}
          </div>
        </div>
      </div>

      {version.server_json && <ServerJSONViewer serverJson={version.server_json} />}

      <Spacer shrinks={false} size="lg" />
      <MCPServerAccessBindings
        server={server}
        bindings={bindings}
        isLoading={bindingsLoading}
        error={bindingsError}
        onAddBinding={onAddBinding}
        onEditBinding={onEditBinding}
        onDeleteBinding={onDeleteBinding}
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

      <UpdateVersionDisplayNameModal
        visible={displayNameModalVisible}
        currentDisplayName={version.display_name || version.server_json?.title || ''}
        isLoading={updateDisplayNameMutation.isLoading}
        error={updateDisplayNameMutation.error as Error | null}
        onUpdate={(displayName) => {
          updateDisplayNameMutation.mutate(
            { version: version.version, displayName },
            { onSuccess: () => setDisplayNameModalVisible(false) },
          );
        }}
        onCancel={() => {
          updateDisplayNameMutation.reset();
          setDisplayNameModalVisible(false);
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
        error={(deleteVersionMutation.error as Error | null)?.message ?? null}
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
        componentId="mlflow.mcp_registry.detail.version.description.modal"
        title={
          <FormattedMessage
            defaultMessage="Edit description"
            description="MCP server version edit description modal title"
          />
        }
        visible={descriptionModalVisible}
        destroyOnClose
        confirmLoading={descriptionSaving}
        okText={
          <FormattedMessage defaultMessage="Save" description="MCP server version edit description save button" />
        }
        cancelText={
          <FormattedMessage defaultMessage="Cancel" description="MCP server version edit description cancel button" />
        }
        onOk={async () => {
          if (onUpdateDescription) {
            setDescriptionSaving(true);
            setDescriptionError(null);
            try {
              await onUpdateDescription(descriptionDraft || null);
              setDescriptionModalVisible(false);
            } catch (e) {
              setDescriptionError(e as Error);
            } finally {
              setDescriptionSaving(false);
            }
          }
        }}
        onCancel={() => {
          setDescriptionError(null);
          setDescriptionModalVisible(false);
        }}
      >
        {descriptionError && (
          <Alert
            componentId="mlflow.mcp_registry.detail.version.description.error"
            type="error"
            closable
            onClose={() => setDescriptionError(null)}
            message={descriptionError.message}
            css={{ marginBottom: theme.spacing.sm }}
          />
        )}
        <Input.TextArea
          componentId="mlflow.mcp_registry.detail.version.description.textarea"
          value={descriptionDraft}
          onChange={(e) => setDescriptionDraft(e.target.value)}
          autoSize={{ minRows: 3, maxRows: 10 }}
          placeholder={intl.formatMessage({
            defaultMessage: 'Enter a description',
            description: 'Placeholder for MCP server version description textarea',
          })}
        />
      </Modal>
    </div>
  );
};
