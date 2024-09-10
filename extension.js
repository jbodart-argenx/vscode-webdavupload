const vscode            = require('vscode');
const fs                = require("fs");
const findConfig        = require('find-config');
const path              = require('path');
const tmp               = require('tmp');
const CredentialStore   = require('./credentialstore/credentialstore.js');
const nodeUrl           = require('url');
const webdavFs          = require("webdav-fs")

const credStore = new CredentialStore.CredentialStore("vscode-webdav:", ".webdav", "webdav-secrets.json");

const EMPTY_CREDENTIALS = {
    newCredentials: true,
    _username: '',
    _password: ''
}

function activate(context) {
    const uploadCommand = vscode.commands.registerCommand('extension.webdavUpload', upload);
    const compareCommand = vscode.commands.registerCommand('extension.webdavCompare', compare);

    context.subscriptions.push(uploadCommand);
    context.subscriptions.push(compareCommand);
}

exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {}

exports.deactivate = deactivate;

async function upload()/*: Promise<void>*/ {
    try {
        await doWebdavAction(async (webdav, workingFile, remoteFile) => {
            const editor = vscode.window.activeTextEditor;

            if (!editor) {
                throw new Error("No active text editor");
            }

            // Promisify the writeFile call
            await new Promise/*<void>*/((resolve, reject) => {
                webdav.writeFile(remoteFile, editor.document.getText(), err => {
                    if (err == null) {
                        const fileName = remoteFile.slice(remoteFile.lastIndexOf('/') + 1);
                        vscode.window.showInformationMessage(`Uploaded: ${fileName} to ${webdav.config.hostname}`);
                        resolve();
                    } else {
                        console.error(err);
                        vscode.window.showErrorMessage(`Failed to upload file to remote host ${webdav.config.hostname}: ` + err.message);
                        reject(err);
                    }
                });
            });
        });
    } catch (err) {
        console.error('Error during upload:', err);
        vscode.window.showErrorMessage('Error during upload:', err);
    }
}


async function compare() {
    try {
        await doWebdavAction(async (webdav, workingFile, remoteFile) => {
            return new Promise((resolve, reject) => {
                // Write the remote file to a local temporary file
                const extension = workingFile.slice(workingFile.lastIndexOf('.'));
                const tmpFile = tmp.fileSync({ postfix: extension });
                webdav.readFile(remoteFile, "utf8", (error, data) => {

                    if (error != null) {
                        console.log(error);
                        reject(error);
                    }

                    fs.writeFileSync(tmpFile.name, data, err => {
                        if(err) {
                            console.log(err);
                            reject(error);
                        }
                    });

                    if (!data) {
                        reject("Cannot download remote file " + remoteFile + ` from ${webdav.config.remoteEndpoint.hostname}`);
                        return;
                    }

                    // Compare!
                    try {
                        const fileName = remoteFile.slice(remoteFile.lastIndexOf('/') + 1);

                        vscode.commands.executeCommand('vscode.diff',
                            vscode.Uri.file(tmpFile.name),
                            vscode.Uri.file(workingFile),
                            fileName + ' (WebDAV Compare)',
                            {
                                preview: false, // Open the diff in an additional tab instead of replacing the current one
                                selection: null // Don't select any text in the compare
                            }
                        );
                        vscode.window.showInformationMessage(`Comparing: ${fileName} with ${webdav.config.hostname}`);
                        resolve(undefined);
                    } catch (error) {
                        console.log(error);
                        reject(error);
                    }
                });
            });
        });
    } catch (err) {
        console.error(`Error during compare:`, err);
        vscode.window.showErrorMessage('Error during compare:', err);
    }
}

async function doWebdavAction(webdavAction /*: (webdav: any, workingFile: string, remoteFile: string) => Promise<void>*/ ) /*: Promise<void>*/ {

    if (!vscode.window.activeTextEditor) {
        vscode.window.showErrorMessage('Cannot find an active text editor...');
        return;
    }

    const workingFile = vscode.window.activeTextEditor.document.uri.fsPath;
    const workingDir = workingFile.slice(0, workingFile.lastIndexOf(path.sep));

    // Read configuration
    const config = await getEndpointConfigForCurrentPath(workingDir);

    if (!config) {
        vscode.window.showErrorMessage('Configuration not found for the current path.');
        return;
    }

    console.log('config:', config);

    // Ignore SSL errors, needed for self-signed certificates
    if (config.remoteEndpoint?.ignoreSSLErrors) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }

    // Initialize WebDAV and remote file path
    const remoteFile = workingFile.replace(/\\/g, '/').replace(vscode.workspace.rootPath.replace(/\\/g, '/') + config.localRootPath, '');
    const url = nodeUrl.parse(config.remoteEndpoint.url);
    config.remoteEndpoint.hostname = url.hostname;
    const credentialsKey = url.port ? url.hostname + ":" + url.port : url.hostname;

    try {
        // Get WebDAV credentials
        const credentials = await getWebdavCredentials(credentialsKey);

        if (!credentials) {
            vscode.window.showWarningMessage('WebDAV login cancelled...');
            vscode.window.showErrorMessage('WebDAV login cancelled...');
            return;
        }

        const webdav = webdavFs(config.remoteEndpoint.url, {
            username: credentials._username,
            password: credentials._password
        });

        webdav.config = config.remoteEndpoint;

        // Perform WebDAV action
        await webdavAction(webdav, workingFile, remoteFile);

        // Store the password only if there is no WebDAV error and the credentials contain at least a user name
        if (credentials.newCredentials && credentials._username) {
            await storeCredentials(credentialsKey, credentials._username, credentials._password);
        }
    } catch (error) {
        console.error('Error in WebDAV action:', error);
        vscode.window.showErrorMessage('Error during WebDAV operation: ' + error.message);
    }
}

async function getEndpointConfigForCurrentPath(absoluteWorkingDir) {
    const configFile = findConfig('webdav.json', {cwd: absoluteWorkingDir});

    if (configFile == null) {
        vscode.window.showErrorMessage('Endpoint config file for WebDAV (webdav.json) not found in current VScode root folder...');
        return null;
    }
    const webdavConfig = JSON.parse(fs.readFileSync(configFile));
    let allEndpointsConfig;
    if (Array.isArray(webdavConfig)) {
        const configChoices = webdavConfig.map((config, index) => (config.label ? ": "+config.label : 'Config '+(index+1).toString()));
        const selectedConfig = await vscode.window.showQuickPick(configChoices, {
            placeHolder: 'Choose an action to execute',
            canPickMany: false
        });
        allEndpointsConfig = webdavConfig[configChoices.findIndex(config => config === selectedConfig)];
    } else {
        allEndpointsConfig = webdavConfig;
    }
    console.log('allEndpointsConfig:', allEndpointsConfig);
    console.log('configFile:', configFile);

    if (configFile != null && allEndpointsConfig) {
        const endpointConfigDirectory = configFile.slice(0, configFile.lastIndexOf(path.sep));

        const relativeWorkingDir = absoluteWorkingDir.slice(endpointConfigDirectory.length).replace(/\\/g, '/'); // On Windows replace \ with /

        let endpointConfig = null;
        let currentSearchPath = relativeWorkingDir;
        let configOnCurrentSearchPath = null;

        while (!endpointConfig) {
            configOnCurrentSearchPath = allEndpointsConfig[currentSearchPath];

            if (!configOnCurrentSearchPath) {
                // Maybe the path in the configuration has a trailing '/'
                configOnCurrentSearchPath = allEndpointsConfig[currentSearchPath + '/'];
            }

            if (configOnCurrentSearchPath) {
                endpointConfig = configOnCurrentSearchPath;
            } else {
                currentSearchPath = currentSearchPath.slice(0, currentSearchPath.lastIndexOf("/"));

                if (currentSearchPath === "") {
                    // issue #1 - check root mapping
                    endpointConfig = allEndpointsConfig["/"]

                    if (!endpointConfig) {
                        vscode.window.showErrorMessage('Cannot find a remote endpoint configuration for the current working directory ' + relativeWorkingDir + ' in webdav.json...');
                        return null;
                    }
                }
            }
        }

        return {
            localRootPath: currentSearchPath,
            remoteEndpoint: endpointConfig
        }
    }
}

function getWebdavCredentials(key) {
    return new Promise((resolve, reject) => {
        credStore.GetCredential(key).then(credentials => {
            if (credentials !== undefined) {
                resolve(credentials);
            } else {
                askForCredentials(key).then(credentials => {
                    resolve(credentials);
                }, error => reject(error));
            }
        }, error => reject(error))
    });
}

function askForCredentials(key) {
    return new Promise((resolve, reject) => {
        vscode.window.showInputBox({prompt: 'Username for ' + key + ' ?'}).then(username => {
            if (!username) {
                resolve(EMPTY_CREDENTIALS);
                return;
            }

            vscode.window.showInputBox({prompt: 'Password ?', password: true}).then(password => {
                if (!password) {
                    resolve(EMPTY_CREDENTIALS);
                    return;
                }

                resolve({
                    newCredentials: true,
                    _username: username,
                    _password: password
                });
            }, error => reject(error));
        }, error => reject(error));
    });
}

async function storeCredentials(key, username, password) {
    await credStore.SetCredential(key, username, password);
}