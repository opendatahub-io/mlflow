import { Button, PencilIcon, useDesignSystemTheme } from '@databricks/design-system';
import { FormattedMessage, useIntl } from 'react-intl';
import { useCallback } from 'react';
import { useMutation } from '@mlflow/mlflow/src/common/utils/reactQueryHooks';
import { useEditKeyValueTagsModal } from '../../common/hooks/useEditKeyValueTagsModal';
import { diffCurrentAndNewTags } from '../../common/utils/TagUtils';
import { KeyValueTag } from '../../common/components/KeyValueTag';
import { MCPRegistryApi } from '../api';
import type { MCPServer } from '../types';

type MCPServerTagEntity = { name: string; tags?: { key: string; value: string }[] };

type UpdateTagsPayload = {
  serverName: string;
  toAdd: { key: string; value: string }[];
  toDelete: { key: string }[];
};

const tagsRecordToArray = (tags: Record<string, string>) =>
  Object.entries(tags).map(([key, value]) => ({ key, value }));

export const MCPServerTagsBox = ({
  server,
  onTagsUpdated,
}: {
  server?: MCPServer;
  onTagsUpdated?: () => void;
}) => {
  const intl = useIntl();
  const { theme } = useDesignSystemTheme();

  const updateMutation = useMutation<unknown, Error, UpdateTagsPayload>({
    mutationFn: async ({ toAdd, toDelete, serverName }) => {
      return Promise.all([
        ...toAdd.map(({ key, value }) => MCPRegistryApi.setMCPServerTag(serverName, { key, value })),
        ...toDelete.map(({ key }) => MCPRegistryApi.deleteMCPServerTag(serverName, key)),
      ]);
    },
  });

  const { EditTagsModal, showEditTagsModal } = useEditKeyValueTagsModal<MCPServerTagEntity>({
    valueRequired: true,
    saveTagsHandler: (entity, currentTags, newTags) => {
      const { addedOrModifiedTags, deletedTags } = diffCurrentAndNewTags(currentTags, newTags);
      return new Promise<void>((resolve, reject) => {
        if (!entity.name) return reject();
        updateMutation.mutate(
          { serverName: entity.name, toAdd: addedOrModifiedTags, toDelete: deletedTags },
          { onSuccess: () => { resolve(); onTagsUpdated?.(); }, onError: reject },
        );
      });
    },
  });

  const handleEdit = useCallback(() => {
    if (!server) return;
    showEditTagsModal({
      name: server.name,
      tags: tagsRecordToArray(server.tags),
    });
  }, [server, showEditTagsModal]);

  const visibleTags = server ? tagsRecordToArray(server.tags) : [];
  const containsTags = visibleTags.length > 0;

  return (
    <div
      css={{
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.xs,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        '> *': { marginRight: '0 !important' },
        gap: theme.spacing.xs,
      }}
    >
      {visibleTags.map((tag) => (
        <KeyValueTag key={tag.key} tag={tag} />
      ))}
      <Button
        componentId="mlflow.mcp_registry.detail.tags.edit"
        size="small"
        icon={!containsTags ? undefined : <PencilIcon />}
        onClick={handleEdit}
        aria-label={intl.formatMessage({
          defaultMessage: 'Edit tags',
          description: 'Label for the edit tags button on the MCP server detail page',
        })}
        children={
          !containsTags ? (
            <FormattedMessage
              defaultMessage="Add tags"
              description="Label for the add tags button on the MCP server detail page"
            />
          ) : undefined
        }
        type="tertiary"
      />
      {EditTagsModal}
    </div>
  );
};
