import { Button, Modal, Spinner, Typography, useDesignSystemTheme } from '@databricks/design-system';
import { FormattedMessage, useIntl } from '@databricks/i18n';
import { useCallback, useState } from 'react';
import { getAjaxUrl } from '../common/utils/FetchUtils';

const SettingsPage = () => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();
  const [isCleaningDemo, setIsCleaningDemo] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  const handleClearAllDemoData = useCallback(async () => {
    setIsCleaningDemo(true);
    try {
      await fetch(getAjaxUrl('ajax-api/3.0/mlflow/demo/delete'), {
        method: 'POST',
      });
    } catch (error) {
      console.error('Failed to clear demo data:', error);
    } finally {
      setIsCleaningDemo(false);
    }
  }, []);

  return (
    <div css={{ padding: theme.spacing.md }}>
      <Typography.Title level={2}>
        <FormattedMessage defaultMessage="Settings" description="Settings page title" />
      </Typography.Title>

      <div css={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 600 }}>
        <div css={{ display: 'flex', flexDirection: 'column', marginRight: theme.spacing.lg }}>
          <Typography.Title level={4}>
            <FormattedMessage defaultMessage="No settings available" description="No settings available title" />
          </Typography.Title>
        </div>
      </div>

      <div
        css={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          maxWidth: 600,
          marginTop: theme.spacing.lg,
        }}
      >
        <div css={{ display: 'flex', flexDirection: 'column', marginRight: theme.spacing.lg }}>
          <Typography.Title level={4}>
            <FormattedMessage defaultMessage="Demo data" description="Demo data settings title" />
          </Typography.Title>
          <Typography.Text>
            <FormattedMessage
              defaultMessage="Clear all demo data generated from the home page. This removes demo experiments, traces, evaluations, and prompts."
              description="Demo data settings description"
            />
          </Typography.Text>
        </div>
        <Button
          componentId="mlflow.settings.demo.clear-all-button"
          onClick={() => setIsConfirmModalOpen(true)}
          disabled={isCleaningDemo}
        >
          {isCleaningDemo ? (
            <Spinner size="small" />
          ) : (
            <FormattedMessage defaultMessage="Clear all demo data" description="Clear demo data button" />
          )}
        </Button>
      </div>

      <Modal
        componentId="mlflow.settings.demo.confirm-modal"
        title={intl.formatMessage({
          defaultMessage: 'Clear demo data',
          description: 'Demo data deletion confirmation modal title',
        })}
        visible={isConfirmModalOpen}
        onCancel={() => setIsConfirmModalOpen(false)}
        onOk={async () => {
          setIsConfirmModalOpen(false);
          await handleClearAllDemoData();
        }}
        okText={intl.formatMessage({
          defaultMessage: 'Clear',
          description: 'Demo data deletion confirm button',
        })}
        cancelText={intl.formatMessage({
          defaultMessage: 'Cancel',
          description: 'Demo data deletion cancel button',
        })}
        okButtonProps={{ danger: true }}
      >
        <Typography.Text>
          <FormattedMessage
            defaultMessage="This will delete the demo experiment and all associated traces, evaluations, and prompts. You can regenerate demo data from the home page, but any manual changes you made to the demo data will be lost."
            description="Demo data deletion confirmation message"
          />
        </Typography.Text>
      </Modal>
    </div>
  );
};

export default SettingsPage;
