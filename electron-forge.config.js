/* eslint-disable */
const os = require("os");
const path = require("path");

// Package name for macOS should be different.
const packageName = os.platform() === "darwin" ? "ThisIsMyDepartment.AI" : "thisismydepartment-ai";

module.exports = {
    packagerConfig: {
        name: packageName,
        // https://electron.github.io/electron-packager/master/interfaces/electronpackager.win32metadataoptions.html
        win32metadata: {
            FileDescription: "A self-hostable virtual department environment with identity-aware avatars and AI characters.",
            ProductName: "ThisIsMyDepartment.AI"
        },
        icon: path.resolve(__dirname, "assets", "appicon.iconset"),
        appCopyright: "Copyright (C) ThisIsMyDepartment.AI contributors",
        appVersion: require(path.resolve(__dirname, "package.json")).version
    },
    makers: [
        {
            name: "@electron-forge/maker-squirrel",
            config: {
                name: "thisismydepartment_ai"
            }
        },
        {
            name: "@electron-forge/maker-zip",
            platforms: [
                "darwin"
            ]
        },
        {
            name: "@electron-forge/maker-deb",
            config: {
                icon: "./assets/appicon.iconset/icon_256x256.png",
                productName: "ThisIsMyDepartment.AI",
                genericName: "ThisIsMyDepartment.AI",
                categories: [
                    "Game"
                ]
            }
        },
        {
            name: "@electron-forge/maker-rpm",
            config: {}
        }
    ],
    plugins: [
        [
            "@electron-forge/plugin-webpack",
            {
                mainConfig: "./webpack.app.config.js",
                renderer: {
                    config: "./webpack.renderer.config.js",
                    entryPoints: [
                        {
                            js: "./lib/main/ThisIsMyDepartmentApp.js",
                            name: "./"
                        }
                    ]
                }
            }
        ]
    ]
}
