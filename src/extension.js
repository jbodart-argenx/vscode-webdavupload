const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { initWebR, webR } = require('./read_dataset.js');
const { uriFromString, pathFromUri } = require('./uri.js');

let webrRepo;

console.log('Starting extension.js');

// require('events').EventEmitter.defaultMaxListeners = 20;  // temporary fix

const tmp = require("tmp");
tmp.setGracefulCleanup();   // remove all controlled temporary objects on process exit


// REST API functions
const {  restApiVersions, restApiCompare, restApiUpload, restApiProperties, restApiSubmitJob,
    restApiViewManifest, restApiCopyRemoteFilePath, restApiCopyRemoteFileUri, getXAuthToken, restApiDeleteCredentials
} = require('./rest-api.js');

const { localFolderContents, restApiFolderContents, compareFolderContents } = require('./folderView.js');

const CustomDatasetPreviewerProvider = require("./custom-dataset-previewer.js");
console.log('(extension.js) typeof CustomDatasetPreviewerProvider:', typeof CustomDatasetPreviewerProvider);

console.log('extension.js - before require("./auth.js")');
const { initializeSecretModule, deleteAuthTokens } = require('./auth.js');
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
                        // Check if the folder Uri exists using vscode.workspace.fs methods - if not, remove it from the workspace
                        vscode.workspace.fs.stat(folder.uri).then(
                            (stats) => {
                                // console.log('Folder exists:', folder.uri.fsPath);
                                if (stats) console.log('Keeping existing workspace folder, index:', index, ', path:', pathFromUri(folder.uri), 'stats:', stats);
                            },
                            (error) => {
                                // console.warn('Folder does not exist:', folder.uri.fsPath);
                                if (error) {
                                    console.warn(
                                        'Removing non-existing workspace folder, index:', index,
                                        ', path:', pathFromUri(folder.uri),
                                        ', message:', error.message
                                    );
                                    vscode.workspace.updateWorkspaceFolders(index, 1);
                                }
                            }
                        );
                    });
                }
            }
        });

        // event.removed.forEach(folder => {
        //     // Optionally handle removed folders
        //     console.log(`Folder removed: ${pathFromUri(folder.uri)}`);
        // });
    });

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            "jbodart-argenx-lsaf-restapi-upload-extension.customDatasetPreviewer", 
            new CustomDatasetPreviewerProvider(context), 
            {
                webviewOptions: {
                    enableScripts: true,
                    localResourceRoots: context ? [uriFromString(path.join(context.extensionPath, 'media'))] : [] ,
                    retainContextWhenHidden: true,
                    enableCommandUris: true // Enable registered commands to be called as URIs from webview HTML e.g.:
											// <a href="command:table-viewer.showMessage?%22Hello%22">Say 'Hello' with Command Uri</a>

                }
            }
        )
    );


    // react-big-table app
    context.subscriptions.push(
        vscode.commands.registerCommand("jbodart-argenx-lsaf-restapi-upload-extension.showReactBigTableWebview", () => {
            const panel = vscode.window.createWebviewPanel(
                'ReactBigTableWebview',
                'React Big Table Webview',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    localResourceRoots: context ? [uriFromString(path.join(context.extensionPath, 'react-big-table/build'))] : []
                }
            );

            const appPath = path.join(context.extensionPath, 'react-big-table', 'build', 'index.html');
            let html = fs.readFileSync(appPath, 'utf8');

            // Update the paths to the static files
            html = html.replace(/\/static\//g, `${panel.webview.asWebviewUri(uriFromString(path.join(context.extensionPath, 'react-big-table', 'build', 'static'))).toString()}/`);

            panel.webview.html = html;
        })
    );

    const restApiUploadCommand = vscode.commands.registerCommand(
        "jbodart-argenx-lsaf-restapi-upload-extension.restApiUpload",
        restApiUpload
    );
    const restApiCopyRemoteFileUriCommand = vscode.commands.registerCommand(
        "jbodart-argenx-lsaf-restapi-upload-extension.restApiCopyRemoteFileUri",
        (param) => restApiCopyRemoteFileUri(param, null, context)
    );
    const restApiCopyRemoteFilePathCommand = vscode.commands.registerCommand(
        "jbodart-argenx-lsaf-restapi-upload-extension.restApiCopyRemoteFilePath",
        (param) => restApiCopyRemoteFilePath(param, null, context)
    );
    const restApiCompareCommand = vscode.commands.registerCommand(
        "jbodart-argenx-lsaf-restapi-upload-extension.restApiCompare",
        restApiCompare
    );
    const restApiPropertiesCommand = vscode.commands.registerCommand(
        "jbodart-argenx-lsaf-restapi-upload-extension.restApiProperties",
        restApiProperties
    );
    const restApiVersionsCommand = vscode.commands.registerCommand(
        "jbodart-argenx-lsaf-restapi-upload-extension.restApiVersions",
        restApiVersions
    );
    const restApiSubmitJobCommand = vscode.commands.registerCommand(
        "jbodart-argenx-lsaf-restapi-upload-extension.restApiSubmitJob",
        (param) => restApiSubmitJob(param, context)
    );
    const restApiViewManifestCommand = vscode.commands.registerCommand(
        "jbodart-argenx-lsaf-restapi-upload-extension.restApiViewManifest",
        (param) => restApiViewManifest(param, context)
    );
    const restApiFolderContentsCommand = vscode.commands.registerCommand(
        "jbodart-argenx-lsaf-restapi-upload-extension.restApiFolderContents",
        restApiFolderContents
    );
    const localFolderContentsCommand = vscode.commands.registerCommand(
        "jbodart-argenx-lsaf-restapi-upload-extension.localFolderContents",
        (param) => localFolderContents(param, context)
    );
    const compareFolderContentsCommand = vscode.commands.registerCommand(
        "jbodart-argenx-lsaf-restapi-upload-extension.compareFolderContents",
        (param) => compareFolderContents(param, null, context)
    );

    const getXAuthTokenCommand = vscode.commands.registerCommand(
        "jbodart-argenx-lsaf-restapi-upload-extension.getXAuthToken",
        (host) => getXAuthToken(host)
    );

    const deleteCredentialsCommand = vscode.commands.registerCommand(
        "jbodart-argenx-lsaf-restapi-upload-extension.deleteCredentials",
        (host) => restApiDeleteCredentials(host)
    );

    context.subscriptions.push(restApiUploadCommand);
    context.subscriptions.push(restApiCopyRemoteFileUriCommand);
    context.subscriptions.push(restApiCopyRemoteFilePathCommand);
    context.subscriptions.push(restApiCompareCommand);
    context.subscriptions.push(restApiPropertiesCommand);
    context.subscriptions.push(restApiVersionsCommand);
    context.subscriptions.push(restApiSubmitJobCommand);
    context.subscriptions.push(restApiViewManifestCommand);
    context.subscriptions.push(restApiFolderContentsCommand);
    context.subscriptions.push(localFolderContentsCommand);
    context.subscriptions.push(compareFolderContentsCommand);
    context.subscriptions.push(getXAuthTokenCommand);
    context.subscriptions.push(deleteCredentialsCommand);

    console.log('vscode-lsaf-rest-api extension activated!');

    // Log registered LSAF commands 
    const commands = (await vscode.commands.getCommands()).filter(c => /lsaf/i.test(c));
    console.log('LSAF vscode.commands:');
    commands.forEach(c => { console.log(`  ${c}`)});
}

console.log('typeof activate:', typeof activate);

exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
    deleteAuthTokens('*');
}

exports.deactivate = deactivate;

