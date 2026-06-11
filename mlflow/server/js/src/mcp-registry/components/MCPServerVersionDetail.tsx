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
  SimpleSelect,
  SimpleSelectOption,
  TrashIcon,
  Typography,
  useDesignSystemTheme,
} from '@databricks/design-system';
import type { TagColors } from '@databricks/design-system';
import { FormattedMessage, useIntl } from 'react-intl';

import type { MCPAccessBinding, MCPServer, MCPServerVersion } from '../types';
import { STATUS_TAG_COLOR, STATUS_TRANSITIONS, resolveDisplayName } from '../utils';
import type { MCPStatus } from '../types';
import { CollapsibleSection } from '../../common/components/CollapsibleSection';
import { MCPServerAccessBindings } from './MCPServerAccessBindings';
import { ConfirmationModal } from '../../admin/ConfirmationModal';
import { ModelVersionTableAliasesCell } from '../../model-registry/components/aliases/ModelVersionTableAliasesCell';
import {
  useUpdateMCPServerVersion,
  useDeleteMCPServerVersion,
} from '../hooks/useMCPServerVersionMutations';
import { KeyValueTag } from '../../common/components/KeyValueTag';
import { AliasSelect } from '../../common/components/AliasSelect';
import { LATEST_ALIAS, RESERVED_ALIASES, validateToolsJson } from '../utils';
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
  resolvedLatestVersion,
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
  resolvedLatestVersion?: string;
}) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const [editVersionModalVisible, setEditVersionModalVisible] = useState(false);
  const [editVersionDisplayName, setEditVersionDisplayName] = useState('');
  const [editVersionStatus, setEditVersionStatus] = useState<MCPStatus>('draft');
  const [editVersionAliases, setEditVersionAliases] = useState<string[]>([]);
  const [editVersionToolsText, setEditVersionToolsText] = useState('');
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [toolsValidationError, setToolsValidationError] = useState<string | null>(null);

  const updateVersionMutation = useUpdateMCPServerVersion(server.name);
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
            <Typography.Text
              color="secondary"
              css={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={versionDisplayName}
            >
              {versionDisplayName}
            </Typography.Text>
          )}
          {version.server_json?.description && (
            <Typography.Hint css={{ marginTop: theme.spacing.xs }}>
              {version.server_json.description}
            </Typography.Hint>
          )}
        </div>
        <div css={{ display: 'flex', gap: theme.spacing.sm, flexShrink: 0 }}>
          <Button
            componentId="mlflow.mcp_registry.detail.edit_version"
            icon={<PencilIcon />}
            onClick={() => {
              setEditVersionDisplayName(version.display_name || version.server_json?.title || '');
              setEditVersionStatus(version.status);
              const currentAliases = (aliasesByVersion[version.version] ?? []).filter((a) => a !== 'latest');
              setEditVersionAliases(currentAliases);
              setEditVersionToolsText(version.tools?.length ? JSON.stringify(version.tools, null, 2) : '');
              setEditVersionModalVisible(true);
            }}
          >
            <FormattedMessage defaultMessage="Edit" description="MCP server edit version button" />
          </Button>
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
        </span>

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
          <FormattedMessage defaultMessage="Created:" description="MCP server version detail registered at label" />
        </Typography.Text>
        <Typography.Text>
          {version.creation_timestamp ? Utils.formatTimestamp(version.creation_timestamp, intl) : '—'}
        </Typography.Text>

        <Typography.Text bold>
          <FormattedMessage defaultMessage="Metadata:" description="MCP server version detail metadata label" />
        </Typography.Text>
        <div>
          <div css={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs, alignItems: 'center' }}>
            {Object.keys(version.tags ?? {}).length > 0
              ? Object.entries(version.tags ?? {}).map(([key, value]) => (
                  <KeyValueTag css={{ margin: 0 }} key={key} tag={{ key, value }} />
                ))
              : !onEditMetadata && <Typography.Hint>—</Typography.Hint>}
            {onEditMetadata &&
              (Object.keys(version.tags ?? {}).length > 0 ? (
                <Button
                  componentId="mlflow.mcp_registry.detail.version.edit_metadata"
                  size="small"
                  icon={<PencilIcon />}
                  aria-label={intl.formatMessage({
                    defaultMessage: 'Edit metadata',
                    description: 'Aria label for edit metadata button',
                  })}
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

      <div css={{ '& svg': { width: 14, height: 14 } }}>
        {version.server_json && (
          <CollapsibleSection
            title={
              <span
                css={{ fontWeight: theme.typography.typographyBoldFontWeight, fontSize: theme.typography.fontSizeBase }}
              >
                <FormattedMessage
                  defaultMessage="Configuration"
                  description="MCP server version detail configuration section heading"
                />
              </span>
            }
            defaultCollapsed
            componentId="mlflow.mcp_registry.detail.configuration_section"
          >
            <pre
              css={{
                margin: 0,
                padding: theme.spacing.md,
                backgroundColor: theme.colors.backgroundSecondary,
                borderRadius: theme.borders.borderRadiusSm,
                overflow: 'auto',
                fontSize: theme.typography.fontSizeSm,
              }}
            >
              <code>{JSON.stringify(version.server_json, null, 2)}</code>
            </pre>
          </CollapsibleSection>
        )}
        {version.tools && version.tools.length > 0 && (
          <CollapsibleSection
            title={
              <span
                css={{ fontWeight: theme.typography.typographyBoldFontWeight, fontSize: theme.typography.fontSizeBase }}
              >
                <FormattedMessage
                  defaultMessage="Tools <light>({count})</light>"
                  description="MCP server version detail tools section heading"
                  values={{
                    count: version.tools.length,
                    light: (chunks: React.ReactNode) => <span css={{ fontWeight: 'normal' }}>{chunks}</span>,
                  }}
                />
              </span>
            }
            defaultCollapsed
            componentId="mlflow.mcp_registry.detail.tools_section"
          >
            <Typography.Hint css={{ marginBottom: theme.spacing.sm }}>
              <FormattedMessage
                defaultMessage="Tools are observed from the live endpoint and may change between snapshots."
                description="MCP server version detail tools disclaimer"
              />
            </Typography.Hint>
            <div
              css={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: theme.spacing.sm,
              }}
            >
              {version.tools.map((tool) => (
                <div
                  key={tool.name}
                  css={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: theme.spacing.sm,
                    padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
                    border: `1px solid ${theme.colors.borderDecorative}`,
                    borderRadius: theme.borders.borderRadiusMd,
                  }}
                >
                  <Tag
                    componentId="mlflow.mcp_registry.detail.tool_name_tag"
                    color="turquoise"
                    css={{
                      minWidth: 120,
                      textAlign: 'center',
                      flexShrink: 0,
                      display: 'inline-flex',
                      justifyContent: 'center',
                    }}
                  >
                    {tool.name}
                  </Tag>
                  {tool.description && (
                    <Typography.Text
                      color="secondary"
                      size="sm"
                      css={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {tool.description}
                    </Typography.Text>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        <CollapsibleSection
          title={
            <span
              css={{ fontWeight: theme.typography.typographyBoldFontWeight, fontSize: theme.typography.fontSizeBase }}
            >
              <FormattedMessage
                defaultMessage="Access Bindings"
                description="MCP server version detail access bindings section heading"
              />
            </span>
          }
          defaultCollapsed
          componentId="mlflow.mcp_registry.detail.bindings_section"
        >
          <MCPServerAccessBindings
            server={server}
            bindings={bindings}
            isLoading={bindingsLoading}
            error={bindingsError}
            onAddBinding={onAddBinding}
            onEditBinding={onEditBinding}
            onDeleteBinding={onDeleteBinding}
            hideTitle
          />
        </CollapsibleSection>
      </div>

      <Modal
        componentId="mlflow.mcp_registry.detail.version.edit_version_modal"
        title={
          <FormattedMessage
            defaultMessage="Edit version details"
            description="MCP server version edit details modal title"
          />
        }
        visible={editVersionModalVisible}
        destroyOnClose
        confirmLoading={updateVersionMutation.isLoading}
        okText={<FormattedMessage defaultMessage="Save" description="Save button" />}
        onOk={() => {
          const payload: Parameters<typeof updateVersionMutation.mutate>[0] = { version: version.version };

          if (editVersionDisplayName !== (version.display_name || version.server_json?.title || '')) {
            payload.displayName = editVersionDisplayName;
          }
          if (editVersionStatus !== version.status) {
            payload.status = editVersionStatus;
          }

          setToolsValidationError(null);
          const currentToolsJson = version.tools?.length ? JSON.stringify(version.tools, null, 2) : '';
          if (editVersionToolsText !== currentToolsJson) {
            if (editVersionToolsText.trim()) {
              const toolsResult = validateToolsJson(editVersionToolsText);
              if (!toolsResult.valid) {
                setToolsValidationError(toolsResult.error ?? 'Invalid tools JSON');
                return;
              }
              payload.tools = toolsResult.parsed ?? null;
            } else {
              payload.tools = [];
            }
          }

          const existingAliases = (aliasesByVersion[version.version] ?? []).filter((a) => a !== LATEST_ALIAS);
          const addedAliases = editVersionAliases.filter((a) => !existingAliases.includes(a));
          const deletedAliases = existingAliases.filter((a) => !editVersionAliases.includes(a));
          if (addedAliases.length > 0 || deletedAliases.length > 0) {
            payload.aliases = { add: addedAliases, remove: deletedAliases };
          }

          updateVersionMutation.mutate(payload, {
            onSuccess: () => setEditVersionModalVisible(false),
          });
        }}
        onCancel={() => {
          updateVersionMutation.reset();
          setToolsValidationError(null);
          setEditVersionModalVisible(false);
        }}
      >
        {updateVersionMutation.error && (
          <Alert
            componentId="mlflow.mcp_registry.detail.version.edit_version_error"
            type="error"
            closable
            onClose={() => updateVersionMutation.reset()}
            message={(updateVersionMutation.error as Error).message}
            css={{ marginBottom: theme.spacing.sm }}
          />
        )}
        <div css={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          <div>
            <Typography.Text bold css={{ marginBottom: theme.spacing.xs, display: 'block' }}>
              <FormattedMessage defaultMessage="Display name" description="Version edit display name label" />
            </Typography.Text>
            <Input
              componentId="mlflow.mcp_registry.detail.version.edit_display_name_input"
              value={editVersionDisplayName}
              onChange={(e) => setEditVersionDisplayName(e.target.value)}
              placeholder={intl.formatMessage({
                defaultMessage: 'Enter display name',
                description: 'Placeholder for version display name input',
              })}
            />
          </div>
          <div>
            <Typography.Text bold css={{ marginBottom: theme.spacing.xs, display: 'block' }}>
              <FormattedMessage defaultMessage="Status" description="Version edit status label" />
            </Typography.Text>
            <SimpleSelect
              id="mcp-registry-edit-version-status"
              componentId="mlflow.mcp_registry.detail.version.edit_status_select"
              value={editVersionStatus}
              onChange={({ target }) => setEditVersionStatus(target.value as MCPStatus)}
            >
              {(['draft', 'active', 'deprecated'] as MCPStatus[]).map((s) => (
                <SimpleSelectOption
                  key={s}
                  value={s}
                  disabled={s !== version.status && !STATUS_TRANSITIONS[version.status]?.includes(s)}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </SimpleSelectOption>
              ))}
            </SimpleSelect>
          </div>
          <div>
            <Typography.Text bold css={{ marginBottom: theme.spacing.xs, display: 'block' }}>
              <FormattedMessage defaultMessage="Aliases" description="Version edit aliases label" />
            </Typography.Text>
            <AliasSelect
              renderKey={editVersionModalVisible}
              disabled={false}
              draftAliases={editVersionAliases}
              existingAliases={(server.aliases ?? []).map((a) => a.alias).filter((a) => !RESERVED_ALIASES.includes(a))}
              setDraftAliases={setEditVersionAliases}
              version={version.version}
              aliasToVersionMap={Object.fromEntries((server.aliases ?? []).map((a) => [a.alias, a.version]))}
              pinnedAliases={resolvedLatestVersion === version.version ? [LATEST_ALIAS] : undefined}
              pinnedAliasColor={aliasColors?.[LATEST_ALIAS]}
            />
          </div>
          <div>
            <Typography.Text bold css={{ marginBottom: theme.spacing.xs, display: 'block' }}>
              <FormattedMessage defaultMessage="Tools" description="Version edit tools label" />
            </Typography.Text>
            {toolsValidationError && (
              <Alert
                componentId="mlflow.mcp_registry.detail.version.tools_validation_error"
                type="error"
                closable
                onClose={() => setToolsValidationError(null)}
                message={toolsValidationError}
                css={{ marginBottom: theme.spacing.xs }}
              />
            )}
            <Input.TextArea
              componentId="mlflow.mcp_registry.detail.version.edit_tools_input"
              value={editVersionToolsText}
              onChange={(e) => {
                setEditVersionToolsText(e.target.value);
                setToolsValidationError(null);
              }}
              autoSize={{ minRows: 4, maxRows: 12 }}
              css={{ fontFamily: 'monospace' }}
              placeholder={intl.formatMessage({
                defaultMessage: 'Enter tools JSON array',
                description: 'Placeholder for version tools input',
              })}
            />
          </div>
        </div>
      </Modal>

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

    </div>
  );
};
