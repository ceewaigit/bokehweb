const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './electron/main/index.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.node$/,
        use: 'node-loader',
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'out'),
          to: path.resolve(__dirname, '.webpack/main/out'),
        },
      ],
    }),
  ],
  externals: [
    'uiohook-napi',
    ({ request }, callback) => {
      // Mark uiohook-napi as external
      if (/^uiohook-napi/.test(request)) {
        return callback(null, `commonjs ${request}`);
      }
      callback();
    },
  ],
  target: 'electron-main',
  node: {
    __dirname: false,
    __filename: false,
  },
  output: {
    path: path.resolve(__dirname, '.webpack/main'),
    filename: 'index.js',
  },
};