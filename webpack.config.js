//@ts-check
'use strict';

const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

// import path from 'path';
// import CopyWebpackPlugin from 'copy-webpack-plugin';

// import { fileURLToPath } from 'url';
// import { dirname } from 'path';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);  // create a custom __dirname (not defined in ES module context)

/** @type {import('webpack').Configuration} */
const config = {
target: 'node', // Extensions run in a Node.js context

entry: {
   extension: './src/extension.js', // Entry point for the extension
},
output: {
   filename: '[name].js',
   path: path.resolve(__dirname, 'dist'),
   libraryTarget: 'commonjs2',
},
mode: 'production',
devtool: 'source-map',
externals: {
   vscode: 'commonjs vscode', // Exclude the vscode module
},
resolve: {
   extensions: ['.js'],
},
module: {
   rules: [
      {
      test: /\.js$/,
      exclude: /node_modules/,
      use: 'babel-loader', // Use babel-loader for JavaScript files
      },
   ],
},
plugins: [
   new CopyWebpackPlugin({
      patterns: [
      {
         context: 'node_modules/webr/dist',
         from: 'webr-*.js',
      },
      {
         context: 'node_modules/webr/dist',
         from: 'R.bin.*',
      },
      {
         context: 'node_modules/webr/dist',
         from: '*.so',
      },
      {
         context: 'node_modules/webr/dist',
         from: 'vfs',
         to: 'vfs',
      },
      ],
   }),
],
};

module.exports = config;
// export default config;