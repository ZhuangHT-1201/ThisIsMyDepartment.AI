/* eslint-disable */
const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const GenerateJsonPlugin = require("generate-json-webpack-plugin");
const GitRevisionPlugin = require("git-revision-webpack-plugin");
const dotenv = require('dotenv').config({ path: __dirname + '/.env' });
const { DefinePlugin } = require("webpack");

const gitRevisionPlugin = new GitRevisionPlugin();
const envConfig = { ...process.env, ...dotenv.parsed };

const transformIndexHtml = (content) => {
    return content.toString()
        .replaceAll("__TIMD_BACKEND_BASE_URL__", envConfig.TIMD_BACKEND_BASE_URL || "__TIMD_BACKEND_BASE_URL__")
        .replaceAll("__TIMD_SOCKET_BASE_URL__", envConfig.TIMD_SOCKET_BASE_URL || "__TIMD_SOCKET_BASE_URL__")
        .replaceAll("__TIMD_JITSI_DOMAIN__", envConfig.TIMD_JITSI_DOMAIN || "__TIMD_JITSI_DOMAIN__")
        .replaceAll("__TIMD_JITSI_MUC__", envConfig.TIMD_JITSI_MUC || "__TIMD_JITSI_MUC__")
        .replaceAll("__TIMD_JITSI_SERVICE_URL__", envConfig.TIMD_JITSI_SERVICE_URL || "__TIMD_JITSI_SERVICE_URL__")
        .replaceAll("__TIMD_JITSI_CLIENT_NODE__", envConfig.TIMD_JITSI_CLIENT_NODE || "__TIMD_JITSI_CLIENT_NODE__")
        .replace("src=\"node_modules/steal/steal.js\" main=\"lib/main/ThisIsMyDepartmentApp\"", "src=\"ThisIsMyDepartmentApp.js\"");
};

module.exports = {
    entry: `./lib/main/ThisIsMyDepartmentApp.js`,
    output: {
        path: path.join(__dirname, "dist"),
        filename: "ThisIsMyDepartmentApp.js",
        chunkFilename: "[name].js?m=[chunkhash]"
    },
    mode: "development",
    resolve: {
        symlinks: false,
        mainFields: ["browser", "main", "module"]
    },
    node: {
        fs: "empty"
    },
    devServer: {
        host: "0.0.0.0",
        port: 8000,
        disableHostCheck: true,
        watchOptions: {
            ignored: [
                path.resolve(__dirname, "src/**/*.ts")
            ]
        },
    },
    devtool: "source-map",
    stats: {
        warningsFilter: /System.import/
    },
    performance: {
        maxAssetSize: 16777216,
        maxEntrypointSize: 16777216
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                include: [
                    path.resolve(__dirname, "lib")
                ],
                use: ["source-map-loader"],
                enforce: "pre"
            }
        ]
    },
    plugins: [
        new DefinePlugin({
            "process.env": JSON.stringify(envConfig)
        }),
        gitRevisionPlugin,
        new GenerateJsonPlugin("appinfo.json", {
            version: process.env.npm_package_version,
            gitCommitHash: gitRevisionPlugin.commithash()
        }),
        new CopyWebpackPlugin({ patterns: [
            //{ from: "src/demo/**/*.{html,css}" },
            { from: "assets/", to: "assets/" },
            { from: "index.html", transform(content) { return transformIndexHtml(content); }},
            { from: "style.css" },
            { from: "manifest.webmanifest" }
        ]})
    ],
    optimization: {
        minimize: true
    }
};
