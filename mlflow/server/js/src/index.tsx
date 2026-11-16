import React from 'react';
import ReactDOM from 'react-dom';
import { MLFlowRoot } from './app';

const renderApp = async () => {
  if (process.env['NODE_ENV'] === 'development' && process.env['REACT_APP_AGENT_PLUGINS_STUB'] === 'true') {
    const { startAgentPluginDevStub } = await import('./agent-plugins/dev-stub');
    startAgentPluginDevStub();
  }
  // eslint-disable-next-line @databricks/no-direct-react-root -- We should try to migrate this (FEINF-4568)
  ReactDOM.render(<MLFlowRoot />, document.getElementById('root'));
};

void renderApp();

const windowOnError = (message: Event | string, source?: string, lineno?: number, colno?: number, error?: Error) => {
  // eslint-disable-next-line no-console -- TODO(FEINF-3587)
  console.error(error, message);
  // returning false allows the default handler to fire as well
  return false;
};

window.onerror = windowOnError;
