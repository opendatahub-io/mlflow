import { useMemo, useState } from 'react';
import { Button, ChevronDownIcon, ChevronRightIcon, Spacer, useDesignSystemTheme } from '@databricks/design-system';
import { FormattedMessage } from 'react-intl';

import type { ServerJSONPayload } from '../types';

export const ServerJSONViewer = ({ serverJson }: { serverJson: ServerJSONPayload }) => {
  const { theme } = useDesignSystemTheme();
  const [expanded, setExpanded] = useState(false);
  const formattedJson = useMemo(() => JSON.stringify(serverJson, null, 2), [serverJson]);

  return (
    <>
      <Spacer shrinks={false} size="sm" />
      <Button
        componentId="mlflow.mcp_registry.detail.toggle_json"
        type="tertiary"
        size="small"
        onClick={() => setExpanded((prev) => !prev)}
        icon={expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        aria-expanded={expanded}
      >
        <FormattedMessage defaultMessage="View full configuration" description="MCP server detail toggle JSON viewer" />
      </Button>
      {expanded && (
        <>
          <Spacer shrinks={false} size="sm" />
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
            <code>{formattedJson}</code>
          </pre>
        </>
      )}
    </>
  );
};
