import eslintPluginImport from "eslint-plugin-import";
import eslintPluginNode from "eslint-plugin-node";
import eslintPluginPromise from "eslint-plugin-promise";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import globals from "globals";

export default [
    {
        files: ["**/*.js"],
        languageOptions: {
            globals: {
                ...globals.commonjs,
                ...globals.node,
                ...globals.mocha,
            },

            ecmaVersion: 2022,
            sourceType: "module",
        },
        ignores: [
            "media/tabulator.min.js",
            "media/script.js",
            "src/jobSubmission.js",
            "dist/**/*.js",
            "node_modules/**/*.js",
            ".vscode-test/**/*.js"
        ],
        plugins: {
            node: eslintPluginNode,
            import: eslintPluginImport,
            promise: eslintPluginPromise,
            unicorn: eslintPluginUnicorn,
        },
        rules: {
            // Enable essential rules
            //"node/no-unsupported-features/node-builtins": "off", // "error", // 
            //"@typescript-eslint/no-explicit-any": "off", // Disable rule even if plugin is not used
            //"@typescript-eslint/no-unused-vars": "off",
            "import/no-extraneous-dependencies": "error",
            "no-undef": "error", // Catch undefined variables
            "eqeqeq": ["error", "always", { null: "ignore" }], // Require strict equality except in specific cases
            "no-const-assign": "warn",
            "no-this-before-super": "warn",
            "no-undef": "warn",
            "no-unreachable": "warn",
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }], // Ignore unused variables starting with '_'
            "constructor-super": "warn",
            "valid-typeof": "warn",
        },
    },
    {
        files: ["media/script.js"],
        languageOptions: {
            globals: {
                ...globals.browser,
                Tabulator: "readonly",
            },
            ecmaVersion: 2022,
            sourceType: "module",
        },
    },
    {
        files: ["src/extension.js"],
        languageOptions: {
            globals: {
                ...globals.node,
            },
            ecmaVersion: 2022,
            sourceType: "module",
        },
    },
];