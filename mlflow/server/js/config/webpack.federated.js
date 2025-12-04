/* eslint-env node */
/* eslint-disable @typescript-eslint/no-require-imports, import/no-extraneous-dependencies */
/**
 * Webpack config for building the federated (Module Federation) bundle.
 * This is a SEPARATE config from CRACO -- it ONLY produces remoteEntry.js + chunks.
 * The standalone app continues to use CRACO via `yarn start` / `yarn build`.
 *
 * Usage:
 *   yarn build:federated    -- production build
 *   yarn start:federated    -- dev server on port 9300
 */
const path = require('path');
const webpack = require('webpack');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const { moduleFederationPlugins } = require('./moduleFederation');
const { name } = require('../package.json');

const IS_DEV = process.env.WEBPACK_WATCH === 'true';
const PORT = process.env.PORT || 9300;
const DIST_DIR = path.resolve(__dirname, '../build/federated');

module.exports = {
  mode: IS_DEV ? 'development' : 'production',
  devtool: IS_DEV ? 'eval-source-map' : 'source-map',
  entry: {},
  output: {
    filename: '[name].bundle.js',
    path: DIST_DIR,
    publicPath: 'auto',
    // uniqueName prevents webpack runtime conflicts when multiple bundles
    // (host + remotes) share the same page. Without this, the JSONP callback
    // names can collide, causing chunk loading failures.
    uniqueName: name,
    clean: true,
  },
  ...(IS_DEV && {
    devServer: {
      port: PORT,
      server: 'https',
      hot: false,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
      },
      historyApiFallback: false,
      client: {
        overlay: {
          warnings: false,
        },
      },
      devMiddleware: {
        // Serve output files under the same path the MLflow Python server
        // uses in production (/mlflow/static-files/). This ensures the
        // dashboard MF proxy can load remoteEntry.js at the same path
        // in both local dev and production. Only affects the dev server;
        // production builds are not affected.
        publicPath: '/mlflow/static-files/federated/',
        writeToDisk: true,
      },
    },
  }),
  module: {
    rules: [
      // TypeScript / JavaScript -- uses babel-loader with formatjs + emotion plugins
      {
        test: /\.(tsx?|jsx?)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', { targets: 'defaults' }],
              ['@babel/preset-react', { runtime: 'automatic', importSource: '@emotion/react' }],
              '@babel/preset-typescript',
            ],
            plugins: [
              ['babel-plugin-formatjs', { idInterpolationPattern: '[sha512:contenthash:base64:6]' }],
              ['@emotion/babel-plugin', { sourceMap: false }],
            ],
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.s[ac]ss$/,
        use: ['style-loader', 'css-loader', 'sass-loader'],
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf|png|jpg|gif)$/,
        type: 'asset/resource',
      },
      // SVGs: support both URL import (default) and ReactComponent import (named).
      // Matches CRA's setup: @svgr/webpack provides { ReactComponent } named
      // export, file-loader provides the URL default export.
      {
        test: /\.svg$/,
        issuer: /\.(tsx?|jsx?)$/,
        use: [
          { loader: '@svgr/webpack', options: { exportType: 'named', svgo: false, titleProp: true, ref: true } },
          { loader: 'file-loader', options: { name: '[name].[hash].[ext]' } },
        ],
      },
      // SVGs from CSS (background-image etc.) -- just emit as resource
      {
        test: /\.svg$/,
        issuer: /\.(css|scss|sass)$/,
        type: 'asset/resource',
      },
      // JSON
      {
        test: /\.json$/,
        type: 'json',
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    plugins: [
      new TsconfigPathsPlugin({
        configFile: path.resolve(__dirname, '../tsconfig.json'),
      }),
    ],
    alias: {
      'react/jsx-runtime.js': require.resolve('react/jsx-runtime'),
      'react/jsx-dev-runtime.js': require.resolve('react/jsx-dev-runtime'),
    },
    fallback: {
      stream: require.resolve('stream-browserify'),
    },
  },
  plugins: [
    ...moduleFederationPlugins,
    new webpack.EnvironmentPlugin({
      DEPLOYMENT_MODE: process.env.DEPLOYMENT_MODE || 'federated',
      MLFLOW_API_BASE_URL: process.env.MLFLOW_API_BASE_URL || '/mlflow',
      MLFLOW_ENABLE_ASSISTANT: 'false',
      MLFLOW_ENABLE_AI_GATEWAY: 'false',
      MLFLOW_SHOW_GDPR_PURGING_MESSAGES: 'false',
      MLFLOW_USE_ABSOLUTE_AJAX_URLS: 'false',
    }),
    new webpack.ProvidePlugin({ process: require.resolve('process/browser') }),
  ],
  optimization: {
    // runtimeChunk: 'single' extracts the webpack runtime into a separate chunk.
    // This is required when using runtime: false in the MF plugin config.
    // See https://github.com/webpack/webpack/issues/18810
    ...(IS_DEV && { runtimeChunk: 'single' }),
    removeEmptyChunks: true,
  },
};
