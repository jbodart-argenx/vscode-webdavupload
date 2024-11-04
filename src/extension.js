const vscode = require("vscode");
const fs = require("fs");
const { initWebR, webR } = require('./read_dataset.js');

let webrRepo;

console.log('Starting extension.js');

// require('events').EventEmitter.defaultMaxListeners = 20;  // temporary fix

const tmp = require("tmp");
tmp.setGracefulCleanup();   // remove all controlled temporary objects on process exit


// REST API functions
const {  restApiVersions, restApiCompare, restApiUpload, restApiProperties, restApiSubmitJob,
    restApiViewManifest
} = require('./rest-api.js');

const { localFolderContents, restApiFolderContents, compareFolderContents } = require('./folderView.js');

const CustomSasPreviewerProvider = require("./custom-sas-previewer.js");
console.log('(extension.js) typeof CustomSasPreviewerProvider:', typeof CustomSasPreviewerProvider);

console.log('extension.js - before require("./auth.js")');
const { initializeSecretModule, authTokens } = require('./auth.js');
console.log('extension.js - after require("./auth.js")');

async function activate(context) {

    console.log('vscode-lsaf-rest-api starting extension activation!');

    // Initialize secret storage
    const secretStorage = context.secrets;

    // Pass secret storage to other modules
    initializeSecretModule(secretStorage);

    // A Map to store submitted jobs by server and their status
    // let JobSubmissionsByServer = new Map(); // Each key is a server, value is an array of job objects

    // Example of a task object
    // {
    //   jobSubmissionId: 'abc123',
    //   server: 'server1',
    //   status: 'in-progress' // 'COMPLETED_SUCCESSFULLY', 'COMPLETED_ERRORS', 'FAILED', etc.
    // }

    webrRepo = context.asAbsolutePath('webr-repo');
    console.log('webrRepo:', webrRepo);

    console.log('Starting webR...');
    await initWebR(webR, webrRepo);


    // Register the event listener for workspace folder changes
    // Every time one or more folders are being added to the workspace,
    // check for and remove any old folder that does not exist anymore from the workspace
    vscode.workspace.onDidChangeWorkspaceFolders(event => {
        // Run this every time one or more folders are being added to the workspace
        event.added.forEach((newFolder, indx) => {
            console.log(`Folder ${indx} being added to the workspace: ${newFolder}`);
            // if (!fs.existsSync(newFolder.uri.fsPath)) {
            //     // Remove the new folder if it does not exist
            //     vscode.workspace.updateWorkspaceFolders(newFolder.index, 1);
            // }
            if (indx === 0) {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (workspaceFolders) {
                    workspaceFolders.forEach((folder, index) => {
                        // Check if the folder exists - if not, remove it from the workspace
                        if (!fs.existsSync(folder.uri.fsPath)) {
                            console.warn('Removing non-existing workspace folder, index:', index, ', path:', folder.uri.fsPath);
                            vscode.workspace.updateWorkspaceFolders(index, 1);
                        } else {
                            console.log('Keeping existing workspace folder, index:', index, ', path:', folder.uri.fsPath);
                        }
                    });
                }
            }
        });

        // event.removed.forEach(folder => {
        //     // Optionally handle removed folders
        //     console.log(`Folder removed: ${folder.uri.fsPath}`);
        // });
    });

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            'myExtension.customSasDatasetPreviewer', 
            new CustomSasPreviewerProvider(context), 
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );

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
    const restApiSubmitJobCommand = vscode.commands.registerCommand(
        "extension.restApiSubmitJob",
        (param) => restApiSubmitJob(param, context)
    );
    const restApiViewManifestCommand = vscode.commands.registerCommand(
        "extension.restApiViewManifest",
        (param) => restApiViewManifest(param, context)
    );
    const restApiFolderContentsCommand = vscode.commands.registerCommand(
        "extension.restApiFolderContents",
        restApiFolderContents
    );
    const localFolderContentsCommand = vscode.commands.registerCommand(
        "extension.localFolderContents",
        (param) => localFolderContents(param, context)
    );
    const compareFolderContentsCommand = vscode.commands.registerCommand(
        "extension.compareFolderContents",
        (param) => compareFolderContents(param, null, context)
    );

    context.subscriptions.push(restApiUploadCommand);
    context.subscriptions.push(restApiCompareCommand);
    context.subscriptions.push(restApiPropertiesCommand);
    context.subscriptions.push(restApiVersionsCommand);
    context.subscriptions.push(restApiSubmitJobCommand);
    context.subscriptions.push(restApiViewManifestCommand);
    context.subscriptions.push(restApiFolderContentsCommand);
    context.subscriptions.push(localFolderContentsCommand);
    context.subscriptions.push(compareFolderContentsCommand);

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

