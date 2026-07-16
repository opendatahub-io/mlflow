import { useEffect, useState } from 'react';
import {
  Alert,
  Input,
  Modal,
  SimpleSelect,
  SimpleSelectOption,
  SimpleSelectOptionGroup,
  Typography,
  useDesignSystemTheme,
} from '@databricks/design-system';
import { FormattedMessage, useIntl } from 'react-intl';

import type { MCPAccessBinding, MCPRemoteTransportType } from '../types';
import { useMCPServerQuery, useMCPServerVersionsQuery } from '../hooks/useMCPServerDetailQuery';
import { useMCPServersListQuery } from '../hooks/useMCPServersListQuery';
import { useCreateAccessBindingMutation, useUpdateAccessBindingMutation } from '../hooks/useAccessBindingMutation';
import { isValidEndpointUrl, resolveBindingDisplayName } from '../utils';
import { FieldLabel } from '../../admin/components/FieldLabel';

const ALIAS_PREFIX = 'alias:';
const VERSION_PREFIX = 'version:';

function bindingToTarget(binding: MCPAccessBinding): string {
  if (binding.server_alias) return `${ALIAS_PREFIX}${binding.server_alias}`;
  if (binding.server_version) return `${VERSION_PREFIX}${binding.server_version}`;
  return `${ALIAS_PREFIX}latest`;
}

export const AccessBindingModal = ({
  visible,
  onCancel,
  onSuccess,
  editBinding,
  lockedServer,
  defaultVersion,
  filterToVersion,
  filterAliases,
}: {
  visible: boolean;
  onCancel: () => void;
  onSuccess?: () => void;
  editBinding?: MCPAccessBinding;
  lockedServer?: string;
  defaultVersion?: string;
  filterToVersion?: string;
  filterAliases?: string[];
}) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const isEditMode = Boolean(editBinding);
  const isServerLocked = isEditMode || Boolean(lockedServer);

  const [selectedServer, setSelectedServer] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [selectedTarget, setSelectedTarget] = useState(`${ALIAS_PREFIX}latest`);
  const [transportType, setTransportType] = useState<MCPRemoteTransportType>('streamable-http');

  const createMutation = useCreateAccessBindingMutation();
  const updateMutation = useUpdateAccessBindingMutation();
  const activeMutation = isEditMode ? updateMutation : createMutation;

  const { data: servers } = useMCPServersListQuery({ enabled: !isServerLocked });
  const { data: server } = useMCPServerQuery(selectedServer);
  const { data: versions } = useMCPServerVersionsQuery(selectedServer);

  useEffect(() => {
    if (visible) {
      if (editBinding) {
        setSelectedServer(editBinding.server_name);
        setEndpointUrl(editBinding.url);
        setSelectedTarget(bindingToTarget(editBinding));
        setTransportType(editBinding.transport_type);
      } else {
        setSelectedServer(lockedServer || '');
        setEndpointUrl('');
        setSelectedTarget(defaultVersion ? `${VERSION_PREFIX}${defaultVersion}` : `${ALIAS_PREFIX}latest`);
        setTransportType('streamable-http');
      }
      setUrlTouched(false);
      createMutation.reset();
      updateMutation.reset();
    }
  }, [visible, editBinding, lockedServer, defaultVersion]); // eslint-disable-line react-hooks/exhaustive-deps -- reset() creates new ref

  const aliases = server?.aliases ?? [];
  const isSubmitting = activeMutation.isLoading;
  const [urlTouched, setUrlTouched] = useState(false);

  const isValidUrl = isValidEndpointUrl(endpointUrl);
  const showUrlError = urlTouched && endpointUrl.trim() && !isValidUrl;
  const isFormValid = Boolean(selectedServer && isValidUrl && selectedTarget);

  const handleSubmit = () => {
    if (!isFormValid) return;
    const isAlias = selectedTarget.startsWith(ALIAS_PREFIX);
    const targetValue = isAlias
      ? selectedTarget.slice(ALIAS_PREFIX.length)
      : selectedTarget.slice(VERSION_PREFIX.length);

    if (isEditMode && editBinding) {
      updateMutation.mutate(
        {
          serverName: editBinding.server_name,
          bindingId: editBinding.id,
          request: {
            url: endpointUrl.trim(),
            server_alias: isAlias ? targetValue : null,
            server_version: isAlias ? null : targetValue,
            transport_type: transportType,
          },
        },
        {
          onSuccess: () => {
            onCancel();
            onSuccess?.();
          },
        },
      );
    } else {
      createMutation.mutate(
        {
          serverName: selectedServer,
          request: {
            url: endpointUrl.trim(),
            server_alias: isAlias ? targetValue : undefined,
            server_version: isAlias ? undefined : targetValue,
            transport_type: transportType,
          },
        },
        {
          onSuccess: () => {
            onCancel();
            onSuccess?.();
          },
        },
      );
    }
  };

  return (
    <Modal
      componentId="mlflow.mcp_registry.binding_modal"
      title={
        isEditMode ? (
          <FormattedMessage
            defaultMessage="Edit access binding"
            description="MCP registry edit access binding modal title"
          />
        ) : (
          <FormattedMessage
            defaultMessage="Create access binding"
            description="MCP registry create access binding modal title"
          />
        )
      }
      visible={visible}
      onCancel={onCancel}
      onOk={handleSubmit}
      okText={
        isEditMode
          ? intl.formatMessage({
              defaultMessage: 'Save',
              description: 'MCP registry edit access binding modal save button',
            })
          : intl.formatMessage({
              defaultMessage: 'Create',
              description: 'MCP registry create access binding modal create button',
            })
      }
      confirmLoading={isSubmitting}
      okButtonProps={{ disabled: !isFormValid || isSubmitting }}
    >
      <div css={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
        {activeMutation.error && (
          <Alert
            componentId="mlflow.mcp_registry.binding_modal.error"
            type="error"
            message={activeMutation.error?.message}
            closable={false}
          />
        )}

        <div>
          <FieldLabel>
            <FormattedMessage defaultMessage="MCP Server:" description="MCP registry binding modal server label" />
          </FieldLabel>
          {isServerLocked ? (
            <Typography.Text>{editBinding ? resolveBindingDisplayName(editBinding) : selectedServer}</Typography.Text>
          ) : (
            <SimpleSelect
              id="mcp-registry-binding-server"
              componentId="mlflow.mcp_registry.binding_modal.server"
              value={selectedServer}
              onChange={({ target }) => {
                setSelectedServer(target.value);
                setSelectedTarget(`${ALIAS_PREFIX}latest`);
              }}
              disabled={isSubmitting}
              placeholder={intl.formatMessage({
                defaultMessage: 'Select an MCP server',
                description: 'MCP registry binding modal server placeholder',
              })}
            >
              {servers?.map((s) => (
                <SimpleSelectOption key={s.name} value={s.name}>
                  {s.display_name || s.name}
                </SimpleSelectOption>
              ))}
            </SimpleSelect>
          )}
        </div>

        <div>
          <FieldLabel>
            <FormattedMessage defaultMessage="Endpoint URL:" description="MCP registry binding modal endpoint label" />
          </FieldLabel>
          <Input
            componentId="mlflow.mcp_registry.binding_modal.endpoint"
            value={endpointUrl}
            onChange={(e) => setEndpointUrl(e.target.value)}
            onBlur={() => setUrlTouched(true)}
            disabled={isSubmitting}
            placeholder={intl.formatMessage({
              defaultMessage: 'https://mcp.example.com/server',
              description: 'MCP registry binding modal endpoint placeholder',
            })}
            validationState={showUrlError ? 'error' : undefined}
          />
          {showUrlError && (
            <Typography.Text color="error" size="sm">
              <FormattedMessage
                defaultMessage="Enter a valid HTTP or HTTPS URL"
                description="MCP registry binding modal endpoint URL validation error"
              />
            </Typography.Text>
          )}
        </div>

        <div>
          <FieldLabel>
            <FormattedMessage
              defaultMessage="Version/Alias:"
              description="MCP registry binding modal version/alias label"
            />
          </FieldLabel>
          <SimpleSelect
            id="mcp-registry-binding-target"
            componentId="mlflow.mcp_registry.binding_modal.target"
            value={selectedTarget}
            onChange={({ target }) => setSelectedTarget(target.value)}
            disabled={!selectedServer || isSubmitting}
          >
            {(() => {
              const filteredAliases = filterToVersion
                ? aliases.filter((a) => a.version === filterToVersion)
                : filterAliases
                  ? aliases.filter((a) => filterAliases.includes(a.alias))
                  : aliases;
              const filteredVersions = filterToVersion
                ? versions?.filter((v) => v.version === filterToVersion)
                : versions;
              const showLatest = filterAliases ? filterAliases.includes('latest') : true;

              return (
                <>
                  <SimpleSelectOptionGroup
                    label={intl.formatMessage({
                      defaultMessage: 'Aliases',
                      description: 'MCP registry binding modal aliases group label',
                    })}
                  >
                    {showLatest && (
                      <SimpleSelectOption value={`${ALIAS_PREFIX}latest`}>
                        <FormattedMessage defaultMessage="@latest" description="MCP registry latest alias option" />
                      </SimpleSelectOption>
                    )}
                    {filteredAliases.map((a) => (
                      <SimpleSelectOption key={a.alias} value={`${ALIAS_PREFIX}${a.alias}`}>
                        @{a.alias}
                      </SimpleSelectOption>
                    ))}
                  </SimpleSelectOptionGroup>
                  {filteredVersions && filteredVersions.length > 0 && (
                    <SimpleSelectOptionGroup
                      label={intl.formatMessage({
                        defaultMessage: 'Versions',
                        description: 'MCP registry binding modal versions group label',
                      })}
                    >
                      {filteredVersions.map((v) => (
                        <SimpleSelectOption key={v.version} value={`${VERSION_PREFIX}${v.version}`}>
                          {v.version}
                        </SimpleSelectOption>
                      ))}
                    </SimpleSelectOptionGroup>
                  )}
                </>
              );
            })()}
          </SimpleSelect>
        </div>

        <div>
          <FieldLabel>
            <FormattedMessage
              defaultMessage="Transport Type:"
              description="MCP registry binding modal transport label"
            />
          </FieldLabel>
          <SimpleSelect
            id="mcp-registry-binding-transport"
            componentId="mlflow.mcp_registry.binding_modal.transport"
            value={transportType}
            onChange={({ target }) => setTransportType(target.value as MCPRemoteTransportType)}
            disabled={isSubmitting}
          >
            <SimpleSelectOption value="streamable-http">
              <FormattedMessage
                defaultMessage="Streamable HTTP"
                description="MCP registry streamable HTTP transport option"
              />
            </SimpleSelectOption>
            <SimpleSelectOption value="sse">
              <FormattedMessage
                defaultMessage="Server-Sent Events (SSE)"
                description="MCP registry SSE transport option"
              />
            </SimpleSelectOption>
          </SimpleSelect>
        </div>
      </div>
    </Modal>
  );
};
