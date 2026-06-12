import { useState } from 'react';
import { McpIcon, useDesignSystemTheme } from '@databricks/design-system';

export const MCPServerIcon = ({ iconSrc, className }: { iconSrc?: string; className?: string }) => {
  const { theme } = useDesignSystemTheme();
  const [iconError, setIconError] = useState(false);

  if (iconSrc && !iconError) {
    return (
      <img
        src={iconSrc}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setIconError(true)}
        className={className}
        css={{
          flexShrink: 0,
          width: theme.general.iconFontSize,
          height: theme.general.iconFontSize,
          objectFit: 'contain',
        }}
      />
    );
  }

  return <McpIcon className={className} css={{ flexShrink: 0, color: theme.colors.textSecondary }} />;
};
