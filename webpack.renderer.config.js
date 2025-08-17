const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            compilerOptions: {
              jsx: 'react-jsx',
              module: 'esnext',
              target: 'es2015'
            }
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/i,
        type: 'asset/resource',
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
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
          to: 'out',
        },
        {
          from: path.resolve(__dirname, 'public'),
          to: 'public',
          globOptions: {
            ignore: ['**/index.html'],
          },
        },
        // Explicitly copy cursors folder to ensure it's included
        {
          from: path.resolve(__dirname, 'public/cursors'),
          to: 'cursors',
        },
      ],
    }),
  ],
  target: 'electron-renderer',
  devServer: {
    static: {
      directory: path.join(__dirname, 'out'),
      publicPath: '/',
    },
    compress: true,
    hot: true,
    port: 3001,
  },
};