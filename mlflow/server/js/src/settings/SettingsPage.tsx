import { Typography, useDesignSystemTheme } from '@databricks/design-system';
import { FormattedMessage, useIntl } from '@databricks/i18n';

const SettingsPage = () => {
  const { theme } = useDesignSystemTheme();

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
    </div>
  );
};

export default SettingsPage;
