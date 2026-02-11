/* eslint-env node */
/* eslint-disable @typescript-eslint/no-require-imports */
const { ModuleFederationPlugin } = require('@module-federation/enhanced/webpack');
const deps = require('../package.json').dependencies;

const moduleFederationConfig = {
  name: 'mlflow',
  filename: 'remoteEntry.js',
  shared: {
    react: { singleton: true, requiredVersion: deps.react },
    'react-dom': { singleton: true, requiredVersion: deps['react-dom'] },
    // NOTE: react-router and react-router-dom are intentionally NOT shared.
    // The host uses react-router v7, MLflow uses v6. These are incompatible
    // major versions, so each side uses its own copy. The wrapper provides
    // its own BrowserRouter (v6) with a basename.
    '@patternfly/react-core': { singleton: true, requiredVersion: '*' },
    '@openshift/dynamic-plugin-sdk': {
      singleton: true,
      requiredVersion: '*',
    },
  },
  exposes: {
    './MlflowExperimentWrapper': './src/odh/wrappers/MlflowExperimentWrapper',
  },
  runtime: false,
  dts: true,
};

module.exports = {
  moduleFederationPlugins: [new ModuleFederationPlugin(moduleFederationConfig)],
};
