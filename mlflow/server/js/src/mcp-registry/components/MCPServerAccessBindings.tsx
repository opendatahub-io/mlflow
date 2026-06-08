import {
  Button,
  PlusIcon,
  Spinner,
  Table,
  TableCell,
  TableHeader,
  TableRow,
  Typography,
  useDesignSystemTheme,
} from '@databricks/design-system';
import { FormattedMessage, useIntl } from 'react-intl';

import type { MCPAccessBinding } from '../types';
import Utils from '../../common/utils/Utils';

export const MCPServerAccessBindings = ({
  bindings,
  isLoading,
}: {
  bindings?: MCPAccessBinding[];
  isLoading?: boolean;
}) => {
  const { theme } = useDesignSystemTheme();
  const intl = useIntl();

  return (
    <div css={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
      <div css={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography.Title level={4} withoutMargins>
          <FormattedMessage defaultMessage="Access Bindings" description="MCP server access bindings section title" />
        </Typography.Title>
        <Button componentId="mlflow.mcp_registry.detail.add_binding" type="tertiary" icon={<PlusIcon />} disabled>
          <FormattedMessage defaultMessage="Add access binding" description="MCP server add access binding button" />
        </Button>
      </div>

      {isLoading ? (
        <div css={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: theme.spacing.lg }}>
          <Spinner size="small" />
        </div>
      ) : !bindings || bindings.length === 0 ? (
        <Typography.Text color="secondary">
          <FormattedMessage
            defaultMessage="No access bindings configured for this server."
            description="MCP server empty access bindings message"
          />
        </Typography.Text>
      ) : (
        <Table scrollable noMinHeight>
          <TableRow isHeader>
            <TableHeader componentId="mlflow.mcp_registry.detail.bindings.endpoint">
              <FormattedMessage defaultMessage="Endpoint" description="MCP access bindings table header for endpoint" />
            </TableHeader>
            <TableHeader componentId="mlflow.mcp_registry.detail.bindings.transport">
              <FormattedMessage
                defaultMessage="Transport"
                description="MCP access bindings table header for transport"
              />
            </TableHeader>
            <TableHeader componentId="mlflow.mcp_registry.detail.bindings.target">
              <FormattedMessage
                defaultMessage="Version/Alias"
                description="MCP access bindings table header for version or alias"
              />
            </TableHeader>
            <TableHeader componentId="mlflow.mcp_registry.detail.bindings.last_updated">
              <FormattedMessage
                defaultMessage="Last updated"
                description="MCP access bindings table header for last updated"
              />
            </TableHeader>
          </TableRow>
          {bindings.map((binding) => (
            <TableRow key={binding.binding_id}>
              <TableCell>{binding.endpoint_url}</TableCell>
              <TableCell>{binding.transport_type}</TableCell>
              <TableCell>{binding.server_alias || binding.server_version || '—'}</TableCell>
              <TableCell>
                {binding.last_updated_timestamp ? Utils.formatTimestamp(binding.last_updated_timestamp, intl) : '—'}
              </TableCell>
            </TableRow>
          ))}
        </Table>
      )}
    </div>
  );
};
