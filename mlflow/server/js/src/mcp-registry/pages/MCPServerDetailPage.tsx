import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { MCPServerVersionList } from '../components/MCPServerVersionList';
import { MCPServerVersionDetail } from '../components/MCPServerVersionDetail';
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
  const { serverName = '' } = useParams<{ serverName: string }>();
  const [deleteServerModalVisible, setDeleteServerModalVisible] = useState(false);
  const deleteServerMutation = useDeleteMCPServer();

  const {
    data: server,
    isLoading: serverLoading,
    error: serverError,
    refetch: refetchServer,
  } = useMCPServerQuery(serverName);
  const {
    data: versions,
    isLoading: versionsLoading,
    refetch: refetchVersions,
  } = useMCPServerVersionsQuery(serverName);
  const { data: bindings, isLoading: bindingsLoading } = useMCPAccessBindingsQuery(serverName);

  const [selectedVersion, setSelectedVersion] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!versions?.length) {
      setSelectedVersion(undefined);
      return;
    }
    const currentStillValid = versions.some((v) => v.version === selectedVersion);
    if (!currentStillValid) {
      setSelectedVersion(versions[0].version);
    }
  }, [versions, selectedVersion]);

  const currentVersion = versions?.find((v) => v.version === selectedVersion);

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
            <Button componentId="mlflow.mcp_registry.detail.create_version" type="primary" disabled>
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
          <MCPServerVersionList
            versions={versions}
            selectedVersion={selectedVersion}
            onSelectVersion={setSelectedVersion}
            isLoading={versionsLoading}
            serverName={serverName}
            aliasesByVersion={aliasesByVersion}
            showEditAliasesModal={showEditAliasesModal}
          />
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
            aliasesByVersion={aliasesByVersion}
            showEditAliasesModal={showEditAliasesModal}
          />
        </div>
      </div>
      {EditAliasesModal}
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
        error={(deleteServerMutation.error as Error | null)?.message ?? null}
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
    </ScrollablePageWrapper>
  );
};

export default withErrorBoundary(ErrorUtils.mlflowServices.EXPERIMENTS, MCPServerDetailPage);
