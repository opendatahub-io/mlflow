import { useDesignSystemTheme } from '@databricks/design-system';

export const CardIconWrapper = ({ children }: { children: React.ReactNode }) => {
  const { theme } = useDesignSystemTheme();
  return (
    <span
      css={{
        display: 'flex',
        flexShrink: 0,
        borderRadius: theme.borders.borderRadiusSm,
        backgroundColor: theme.colors.backgroundSecondary,
        padding: theme.spacing.xs,
        color: theme.colors.actionPrimaryBackgroundDefault,
      }}
    >
      {children}
    </span>
  );
};
