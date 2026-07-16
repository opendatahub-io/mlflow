import { useEffect, useState } from 'react';
import { Alert, Input, Modal, useDesignSystemTheme } from '@databricks/design-system';
import { FormattedMessage, useIntl } from 'react-intl';

export const UpdateDescriptionModal = ({
  visible,
  currentDescription,
  isLoading,
  error,
  onUpdate,
  onCancel,
  onClearError,
}: {
  visible: boolean;
  currentDescription: string;
  isLoading?: boolean;
  error?: Error | null;
  onUpdate: (description: string | null) => void;
  onCancel: () => void;
  onClearError?: () => void;
}) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const [draft, setDraft] = useState(currentDescription);

  useEffect(() => {
    if (visible) {
      setDraft(currentDescription);
    }
  }, [visible, currentDescription]);

  return (
    <Modal
      componentId="mlflow.mcp_registry.detail.version.description.modal"
      title={
        <FormattedMessage
          defaultMessage="Edit server description"
          description="MCP server edit server-level description modal title"
        />
      }
      visible={visible}
      destroyOnClose
      confirmLoading={isLoading}
      okText={<FormattedMessage defaultMessage="Save" description="MCP server version edit description save button" />}
      cancelText={
        <FormattedMessage defaultMessage="Cancel" description="MCP server version edit description cancel button" />
      }
      onOk={() => onUpdate(draft || null)}
      onCancel={onCancel}
    >
      {error && (
        <Alert
          componentId="mlflow.mcp_registry.detail.version.description.error"
          type="error"
          closable
          onClose={onClearError}
          message={error.message}
          css={{ marginBottom: theme.spacing.sm }}
        />
      )}
      <Input.TextArea
        componentId="mlflow.mcp_registry.detail.version.description.textarea"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoSize={{ minRows: 3, maxRows: 10 }}
        placeholder={intl.formatMessage({
          defaultMessage: 'Enter a description',
          description: 'Placeholder for MCP server version description textarea',
        })}
      />
    </Modal>
  );
};
