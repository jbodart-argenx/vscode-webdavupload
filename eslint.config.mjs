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
            "src/jobSubmission.js",
            ".vscode-test/**"
        ],
        rules: {
            "no-const-assign": "warn",
            "no-this-before-super": "warn",
            "no-undef": "warn",
            "no-unreachable": "warn",
            "no-unused-vars": "warn",
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