import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Breadcrumb,
  Button,
  ColumnsIcon,
  DropdownMenu,
  Header,
  OverflowIcon,
  SegmentedControlButton,
  SegmentedControlGroup,
  Spacer,
  Spinner,
  ZoomMarqueeSelection,
  useDesignSystemTheme,
} from '@databricks/design-system';
import { FormattedMessage, useIntl } from 'react-intl';

import { ScrollablePageWrapper } from '../../common/components/ScrollablePageWrapper';
import { Link, useNavigate, useParams } from '../../common/utils/RoutingUtils';
import { withErrorBoundary } from '../../common/utils/withErrorBoundary';
import ErrorUtils from '../../common/utils/ErrorUtils';
import { ConfirmationModal } from '../../admin/ConfirmationModal';
import { useEditAliasesModal } from '../../common/hooks/useEditAliasesModal';
import MCPRegistryRoutes from '../routes';
import { MCPRegistryApi } from '../api';
import {
  useMCPServerQuery,
  useMCPServerVersionsQuery,
  useMCPAccessBindingsQuery,
} from '../hooks/useMCPServerDetailQuery';
import { useDeleteMCPServer } from '../hooks/useMCPServerVersionMutations';
import { useDeleteAccessBindingMutation } from '../hooks/useAccessBindingMutation';
import type { MCPAccessBinding } from '../types';
import { useCreateMCPServerVersionModal } from '../hooks/useCreateMCPServerVersionModal';
import { MCPServerVersionList } from '../components/MCPServerVersionList';
import { MCPServerVersionDetail } from '../components/MCPServerVersionDetail';
import { AccessBindingModal } from '../components/AccessBindingModal';
import { useSelectedMCPServerVersion } from '../hooks/useSelectedMCPServerVersion';
import { resolveDisplayName } from '../utils';

const getAliasesModalTitle = (version: string) => (
  <FormattedMessage
    defaultMessage="Add/edit alias for MCP server version {version}"
    description="Title for the edit aliases modal on the MCP server detail page"
    values={{ version }}
  />
);

const MCPServerDetailPage = () => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const navigate = useNavigate();
  const params = useParams<{ serverName: string }>();
  const serverName = decodeURIComponent(params.serverName ?? '');
  const [deleteServerModalVisible, setDeleteServerModalVisible] = useState(false);
  const [addBindingModalOpen, setAddBindingModalOpen] = useState(false);
  const [editingBinding, setEditingBinding] = useState<MCPAccessBinding | undefined>(undefined);
  const [deletingBinding, setDeletingBinding] = useState<MCPAccessBinding | undefined>(undefined);
  const deleteServerMutation = useDeleteMCPServer();
  const deleteBindingMutation = useDeleteAccessBindingMutation();

  const {
    data: server,
    isLoading: serverLoading,
    error: serverError,
    refetch: refetchServer,
  } = useMCPServerQuery(serverName);
  const {
    data: versions,
    isLoading: versionsLoading,
    error: versionsError,
    refetch: refetchVersions,
  } = useMCPServerVersionsQuery(serverName);
  const { data: bindings, isLoading: bindingsLoading, error: bindingsError } = useMCPAccessBindingsQuery(serverName);

  const latestVersion = versions?.[0]?.version;
  const [selectedVersion, setSelectedVersion] = useSelectedMCPServerVersion(latestVersion);

  const currentVersion = useMemo(() => {
    if (!versions?.length) return undefined;
    return versions.find((v) => v.version === selectedVersion) ?? versions[0];
  }, [versions, selectedVersion]);

  const aliasesByVersion = useMemo(() => {
    const result: Record<string, string[]> = {};
    server?.aliases?.forEach(({ alias, version }) => {
      if (!result[version]) {
        result[version] = [];
      }
      result[version].push(alias);
    });
    return result;
  }, [server?.aliases]);

  const refetchAll = useCallback(async () => {
    await Promise.all([refetchServer(), refetchVersions()]);
  }, [refetchServer, refetchVersions]);

  const { CreateMCPServerVersionModal, openModal: openCreateVersionModal } = useCreateMCPServerVersionModal({
    serverName: decodedServerName,
    latestVersion: currentVersion,
    onSuccess: async ({ version }) => {
      await refetchAll();
      setSelectedVersion(version);
    },
  });

  const { EditAliasesModal, showEditAliasesModal } = useEditAliasesModal({
    aliases: server?.aliases ?? [],
    onSuccess: refetchAll,
    getTitle: getAliasesModalTitle,
    onSave: async (_currentlyEditedVersion: string, existingAliases: string[], draftAliases: string[]) => {
      const addedAliases = draftAliases.filter((a) => !existingAliases.includes(a));
      const deletedAliases = existingAliases.filter((a) => !draftAliases.includes(a));
      await Promise.all([
        ...addedAliases.map((alias) =>
          MCPRegistryApi.setMCPServerAlias(serverName, { alias, version: _currentlyEditedVersion }),
        ),
        ...deletedAliases.map((alias) => MCPRegistryApi.deleteMCPServerAlias(serverName, alias)),
      ]);
    },
    description: (
      <FormattedMessage
        defaultMessage="Aliases allow you to assign a mutable, named reference to a particular MCP server version."
        description="Description for the edit aliases modal on the MCP server detail page"
      />
    ),
    reservedAliases: ['latest'],
  });

  const breadcrumbs = (
    <Breadcrumb>
      <Breadcrumb.Item>
        <Link componentId="mlflow.mcp_registry.detail.breadcrumb_back" to={MCPRegistryRoutes.mcpRegistryPageRoute}>
          <FormattedMessage defaultMessage="MCP Registry" description="MCP Registry breadcrumb link" />
        </Link>
      </Breadcrumb.Item>
    </Breadcrumb>
  );

  if (serverLoading) {
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

  if (serverError || !server) {
    return (
      <ScrollablePageWrapper>
        <Spacer shrinks={false} />
        <Header breadcrumbs={breadcrumbs} title="" />
        <Alert
          componentId="mlflow.mcp_registry.detail.error"
          type="error"
          message={
            <FormattedMessage
              defaultMessage="Failed to load MCP server"
              description="MCP server detail page error title"
            />
          }
          description={serverError?.message}
          closable={false}
        />
      </ScrollablePageWrapper>
    );
  }

  const displayName = resolveDisplayName(server);

  return (
    <ScrollablePageWrapper css={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Spacer shrinks={false} />
      <Header
        breadcrumbs={breadcrumbs}
        title={displayName}
        buttons={
          <>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button
                  componentId="mlflow.mcp_registry.detail.actions"
                  icon={<OverflowIcon />}
                  aria-label={intl.formatMessage({
                    defaultMessage: 'More actions',
                    description: 'Aria label for MCP server detail actions overflow menu',
                  })}
                />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content>
                <DropdownMenu.Item
                  componentId="mlflow.mcp_registry.detail.actions.delete"
                  onClick={() => setDeleteServerModalVisible(true)}
                >
                  <FormattedMessage defaultMessage="Delete" description="MCP server detail delete server action" />
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
            <Button
              componentId="mlflow.mcp_registry.detail.create_version"
              type="primary"
              onClick={openCreateVersionModal}
            >
              <FormattedMessage
                defaultMessage="Create MCP server version"
                description="MCP server detail create version button"
              />
            </Button>
          </>
        }
      />
      <Spacer shrinks={false} />
      <div css={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div css={{ flex: '0 0 320px', display: 'flex', flexDirection: 'column' }}>
          <div css={{ display: 'flex', gap: theme.spacing.sm }}>
            <SegmentedControlGroup
              name="mcp-server-detail-view"
              value="preview"
              componentId="mlflow.mcp_registry.detail.view_toggle"
            >
              <SegmentedControlButton value="preview">
                <div css={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
                  <ZoomMarqueeSelection />
                  <FormattedMessage defaultMessage="Preview" description="MCP server detail preview tab" />
                </div>
              </SegmentedControlButton>
              <SegmentedControlButton value="compare" disabled>
                <div css={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
                  <ColumnsIcon />
                  <FormattedMessage defaultMessage="Compare" description="MCP server detail compare tab" />
                </div>
              </SegmentedControlButton>
            </SegmentedControlGroup>
          </div>
          <Spacer shrinks={false} size="sm" />
          {versionsError ? (
            <Alert
              componentId="mlflow.mcp_registry.detail.versions_error"
              type="error"
              message={versionsError.message}
              closable={false}
            />
          ) : (
            <MCPServerVersionList
              versions={versions}
              selectedVersion={selectedVersion}
              onSelectVersion={setSelectedVersion}
              isLoading={versionsLoading}
              serverName={serverName}
              aliasesByVersion={aliasesByVersion}
              showEditAliasesModal={showEditAliasesModal}
            />
          )}
        </div>
        <div
          css={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            borderLeft: `1px solid ${theme.colors.border}`,
            overflow: 'hidden',
          }}
        >
          <MCPServerVersionDetail
            server={server}
            version={currentVersion}
            bindings={bindings}
            bindingsLoading={bindingsLoading}
            bindingsError={bindingsError}
            aliasesByVersion={aliasesByVersion}
            showEditAliasesModal={showEditAliasesModal}
            onAddBinding={() => setAddBindingModalOpen(true)}
            onEditBinding={(binding) => {
              setEditingBinding(binding);
              setAddBindingModalOpen(true);
            }}
            onDeleteBinding={setDeletingBinding}
          />
        </div>
      </div>
      {EditAliasesModal}
      <AccessBindingModal
        visible={addBindingModalOpen}
        onCancel={() => {
          setEditingBinding(undefined);
          setAddBindingModalOpen(false);
        }}
        editBinding={editingBinding}
        lockedServer={serverName}
        defaultVersion={currentVersion?.version}
      />
      {CreateMCPServerVersionModal}
      <ConfirmationModal
        componentId="mlflow.mcp_registry.detail.delete_server_modal"
        title={intl.formatMessage({
          defaultMessage: 'Delete MCP server',
          description: 'MCP server delete confirmation modal title',
        })}
        visible={deleteServerModalVisible}
        message={
          <FormattedMessage
            defaultMessage="Are you sure you want to delete this MCP server and all its versions? This action cannot be undone."
            description="MCP server delete confirmation message"
          />
        }
        isLoading={deleteServerMutation.isLoading}
        error={deleteServerMutation.error?.message ?? null}
        onConfirm={() => {
          deleteServerMutation.mutate(serverName, {
            onSuccess: () => {
              setDeleteServerModalVisible(false);
              navigate(MCPRegistryRoutes.mcpRegistryPageRoute);
            },
          });
        }}
        onCancel={() => {
          deleteServerMutation.reset();
          setDeleteServerModalVisible(false);
        }}
      />
      <ConfirmationModal
        componentId="mlflow.mcp_registry.detail.delete_binding_modal"
        title={intl.formatMessage({
          defaultMessage: 'Delete access binding',
          description: 'Access binding delete confirmation modal title',
        })}
        visible={Boolean(deletingBinding)}
        message={
          <FormattedMessage
            defaultMessage="Are you sure you want to delete this access binding? This action cannot be undone."
            description="Access binding delete confirmation message"
          />
        }
        isLoading={deleteBindingMutation.isLoading}
        error={deleteBindingMutation.error?.message ?? null}
        onConfirm={() => {
          if (!deletingBinding) return;
          deleteBindingMutation.mutate(
            { serverName: deletingBinding.server_name, bindingId: deletingBinding.binding_id },
            { onSuccess: () => setDeletingBinding(undefined) },
          );
        }}
        onCancel={() => {
          deleteBindingMutation.reset();
          setDeletingBinding(undefined);
        }}
      />
    </ScrollablePageWrapper>
  );
};

export default withErrorBoundary(ErrorUtils.mlflowServices.EXPERIMENTS, MCPServerDetailPage);
