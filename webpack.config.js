//@ts-check
'use strict';

const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
// const { glob } = require('glob');

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
                    context: path.resolve(__dirname, 'node_modules/webr/dist'),
                    from: 'webr-*.js',
                },
                {
                    context: path.resolve(__dirname, 'node_modules/webr/dist'),
                    from: 'R.bin.*',
                },
                {
                    context: path.resolve(__dirname, 'node_modules/webr/dist'),
                    from: '*.so',
                },
                {
                    context: path.resolve(__dirname, 'node_modules/webr/dist'),
                    from: 'vfs',
                    to: 'vfs',
                },
                { 
                    from: path.resolve(__dirname, 'webr-repo'),
                    to: 'webr-repo'
                },
                // {
                //     from: 'react-big-table/build',
                //     to: 'react-big-table/build'
                // }
            ],
        }),
    ],
};

module.exports = config;
