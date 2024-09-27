const vscode = require("vscode");
const { initWebR, webR } = require('./read_sas.js');

console.log('Starting extension.js');

// require('events').EventEmitter.defaultMaxListeners = 20;  // temporary fix

const tmp = require("tmp");
tmp.setGracefulCleanup();   // remove all controlled temporary objects on process exit


// REST API functions
const {  restApiVersions, restApiCompare, restApiUpload, restApiProperties } = require('./rest-api.js');

const { localFolderContents, restApiFolderContents, compareFolderContents } = require('./folderView.js');


console.log('extension.js - before require("./auth.js")');
const { initializeSecretModule, authTokens } = require('./auth.js');
console.log('extension.js - after require("./auth.js")');

async function activate(context) {

    console.log('vscode-lsaf-rest-api starting extension activation!');

    // Initialize secret storage
    const secretStorage = context.secrets;

    // Pass secret storage to other modules
    initializeSecretModule(secretStorage);

    const restApiUploadCommand = vscode.commands.registerCommand(
        "extension.restApiUpload",
        restApiUpload
    );
    const restApiCompareCommand = vscode.commands.registerCommand(
        "extension.restApiCompare",
        restApiCompare
    );
    const restApiPropertiesCommand = vscode.commands.registerCommand(
        "extension.restApiProperties",
        restApiProperties
    );
    const restApiVersionsCommand = vscode.commands.registerCommand(
        "extension.restApiVersions",
        restApiVersions
    );
    const restApiFolderContentsCommand = vscode.commands.registerCommand(
        "extension.restApiFolderContents",
        restApiFolderContents
    );
    const localFolderContentsCommand = vscode.commands.registerCommand(
        "extension.localFolderContents",
        localFolderContents
    );
    const compareFolderContentsCommand = vscode.commands.registerCommand(
        "extension.compareFolderContents",
        compareFolderContents
    );


    context.subscriptions.push(restApiUploadCommand);
    context.subscriptions.push(restApiCompareCommand);
    context.subscriptions.push(restApiPropertiesCommand);
    context.subscriptions.push(restApiVersionsCommand);
    context.subscriptions.push(restApiFolderContentsCommand);
    context.subscriptions.push(localFolderContentsCommand);
    context.subscriptions.push(compareFolderContentsCommand);

    console.log('Starting webR...');
    await initWebR(webR);

    console.log('vscode-lsaf-rest-api extension activated!');
}

console.log('typeof activate:', typeof activate);

exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
    // Clean up by removing the tokens (optional, as they will be cleared anyway when the extension is deactivated)
    const props = Object.getOwnPropertyNames(authTokens);
    props.forEach(prop => {
        delete authTokens[prop];
    });
}

exports.deactivate = deactivate;

