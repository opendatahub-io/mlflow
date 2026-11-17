const path = require('path');

const DESIGN_SYSTEM_SHIM = path.resolve(__dirname, '../src/odh/design-system/index.tsx');

const designSystemShimRule = {
  test: /\.(tsx?|jsx?)$/,
  include: path.resolve(__dirname, '../src'),
  exclude: DESIGN_SYSTEM_SHIM,
  resolve: {
    alias: {
      '@databricks/design-system$': DESIGN_SYSTEM_SHIM,
    },
  },
};

module.exports = { DESIGN_SYSTEM_SHIM, designSystemShimRule };
