const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const findConfig = require("find-config");
const path = require("path");
const CredentialStore = require("./credentialstore/credentialstore.js");
const { URL } = require("url");
const webdavFs = require("webdav-fs");
const beautify = require("js-beautify");
const fetch = require("node-fetch"); // Node.js equivalent to native Browser fetch 
                                     // need to stick to version 2.x (CommonJS)
                                     // since version 3.x uses ESM 

const tmp = require("tmp");
tmp.setGracefulCleanup();   // remove all controlled temporary objects on process exit

const Headers = require("./headers"); // custom Headers class equivalent to native Browser Headers

const credStore = new CredentialStore.CredentialStore(
    "vscode-webdav:",
    ".webdav",
    "webdav-secrets.json"
);

const EMPTY_CREDENTIALS = {
    newCredentials: true,
    _username: "",
    _password: "",
};

function activate(context) {
    const uploadCommand = vscode.commands.registerCommand(
        "extension.webdavUpload",
        upload
    );
    const compareCommand = vscode.commands.registerCommand(
        "extension.webdavCompare",
        compare
    );

    context.subscriptions.push(uploadCommand);
    context.subscriptions.push(compareCommand);
}

exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() { }

exports.deactivate = deactivate;

// REST API functions
class RestApi {


    constructor(username, host) {
        this.username = username;
        this.host = host;
        this.apiUrl = `https://${this.host}/api`;
        this.encryptPassword = null;
        this.authToken = null;
        this.fileContents = null;
    }

    async encryptPassword(password) {
        const url = `${this.apiUrl}/encrypt`;
        const myHeaders = new Headers();
        myHeaders.append(
            "Authorization",
            "Basic " + btoa(this.username + ":" + password)
        );
        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow",
        };
        fetch(url, requestOptions)
            .then((response) => response.text())
            .then((result) => {
                console.log(result);
                this.encryptedPassword = result;
            })
            .catch((error) => console.error(error));
    }

    async logon() {
        if (!this.encryptPassword) {
            // const password = "abc123";
            const { _username:username, _password:password}  = getCredentials(`${this.host}.ondemand.sas.com`);
            this.username = username;
            await this.encryptPassword(password);
        }
        const url = `https://${this.host}.ondemand.sas.com/lsaf/api/logon`;
        const myHeaders = new Headers();
        myHeaders.append(
            "Authorization",
            "Basic " + btoa(this.username + ":" + this.encryptedPassword)
        );
        const requestOptions = {
            method: "POST",
            headers: myHeaders,
            redirect: "follow",
        };

        fetch(url, requestOptions)
            .then((response) => {
                const authToken = response.headers.get("x-auth-token");
                console.log("authToken", authToken, "response", response);
                this.authToken = authToken;
            })
            .catch((error) => console.error(error));
    }

    async getFileContents (filePath) {
        if (!this.authToken) {
            await this.logon();
        }
        const url = `https://${this.host}.ondemand.sas.com/lsaf/api`;
        const myHeaders = new Headers();
        const apiRequest = `/repository/files/${filePath}?component=contents`;
        myHeaders.append("X-Auth-Token", this.authToken);
        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow",
        };

        fetch(url + apiRequest, requestOptions)
            .then((response) => {
                console.log("response", response);
                return response.text();
            })
            .then((responseText) => {
                console.log("responseText", responseText);
                this.fileContents = responseText;
            })
            .catch((error) => console.error(error));
    };

}

async function upload() /*: Promise<void>*/ {
    try {
        await doWebdavAction(async (webdav, workingFile, remoteFile) => {
            const editor = vscode.window.activeTextEditor;

            if (!editor) {
                throw new Error("No active text editor");
            }

            // Promisify the writeFile call
            await new Promise(
        /*<void>*/(resolve, reject) => {
                    webdav.writeFile(remoteFile, editor.document.getText(), (err) => {
                        if (err == null) {
                            const fileName = remoteFile.slice(
                                remoteFile.lastIndexOf("/") + 1
                            );
                            vscode.window.showInformationMessage(
                                `Uploaded: ${fileName} to ${webdav.config.hostname}`
                            );
                            resolve();
                        } else {
                            console.error(err);
                            vscode.window.showErrorMessage(
                                `Failed to upload file to remote host ${webdav.config.hostname}: ` +
                                err.message
                            );
                            reject(err);
                        }
                    });
                }
            );
        });
    } catch (err) {
        console.error("Error during upload:", err);
        vscode.window.showErrorMessage("Error during upload:", err);
    }
}

async function compare() {
    try {
        await doWebdavAction(async (webdav, workingFile, remoteFile) => {
            return new Promise((resolve, reject) => {
                // Write the remote file to a local temporary file
                const extension = workingFile.slice(workingFile.lastIndexOf("."));
                // Simple synchronous temporary file creation, the file will be closed and unlinked on process exit.
                const tmpFile = tmp.fileSync({ postfix: extension });
                console.log("tmpFile:", tmpFile);
                console.log(
                    "Reading remote file " +
                    remoteFile +
                    ` from ${webdav.config.hostname}...`
                );
                vscode.window.showInformationMessage(
                    "Reading remote file " +
                    remoteFile +
                    ` from ${webdav.config.hostname}...`
                );

                webdav.readFile(remoteFile, "utf8", (error, data) => {
                    if (error) {
                        console.log(error);
                        vscode.window.showErrorMessage(error);
                        return reject(error); // Ensure execution stops
                    }

                    if (!data) {
                        vscode.window.showErrorMessage(
                            `Cannot download remote file ${remoteFile} from ${webdav.config.hostname}`
                        );
                        return reject(
                            `Cannot download remote file ${remoteFile} from ${webdav.config.hostname}`
                        );
                    }
                    console.log(data);
                    console.log(typeof data);
                    if (typeof data === "object") {
                        data = JSON.stringify(data);
                        data = beautify(data, {
                            indent_size: 2,
                            space_in_empty_paren: true,
                        });
                    }
                    // console.log(data);
                    // console.log(typeof data);
                    // Write contents to temp file
                    fs.writeFile(tmpFile.name, data, async (err) => {
                        if (err) {
                            console.log(err);
                            vscode.window.showErrorMessage(error);
                            return reject(err); // Ensure execution stops
                        }
                        console.log(`Downloaded as ${tmpFile.name}`);
                        // Set the file to read-only (cross-platform)
                        try {
                            await fs.promises.chmod(tmpFile.name, 0o444);
                            // console.log(`File is now read-only: ${tmpFile.name}`);
                        } catch(err) {
                            console.error(`Failed to set file as read-only: ${err}`);
                        }
                        
                        // Compare after successfully writing the file
                        try {
                            const fileName = remoteFile.slice(
                                remoteFile.lastIndexOf("/") + 1
                            );

                            vscode.window.showInformationMessage(
                                `Comparing: ${fileName} with ${webdav.config.hostname}`
                            );
                            await vscode.commands.executeCommand(
                                "vscode.diff",
                                vscode.Uri.file(path.normalize(tmpFile.name)),
                                vscode.Uri.file(workingFile),
                                fileName + ` (${webdav.config.hostname.split(".")[0]} Compare)`,
                                {
                                    preview: true, // false, // Open the diff in an additional tab instead of replacing the current one
                                    selection: null, // Don't select any text in the compare
                                }
                            );

                            // Listen for the diff editor closing
                            const documentCloseListener = vscode.workspace.onDidCloseTextDocument(async (document) => {
                                // console.log(`Closing document ${path.normalize(document.uri.fsPath)} ...`);
                                console.log(`Closing document URI: ${document.uri.toString()}`);
                                // console.log(`Closing document fsPath: ${document.uri.fsPath}`);
                                // console.log(`Temp file is: ${path.normalize(tmpFile.name)}`);
                                let normDocPath = path.normalize(document.uri.fsPath);
                                let normTempFile = path.normalize(tmpFile.name);
                                if ( // os.platform() === 'win32' &&
                                    fs.existsSync(normTempFile.toLowerCase()) &&
                                    fs.existsSync(normTempFile.toUpperCase())
                                    ) 
                                {
                                    // console.log('FileSystem is case-insensitive!');
                                    normDocPath = normDocPath.toLowerCase();
                                    normTempFile = normTempFile.toLowerCase();
                                }
                                // console.log(`Same file: ${normDocPath === normTempFile}`);
                                // If the document being closed is the temp file, delete it
                                if (normDocPath === normTempFile) {
                                    // Change permissions to writable (0o666 allows read and write for all users)
                                    try {
                                        // console.log(`Changing file permissions to writable: ${tmpFile.name}`);
                                        await fs.promises.chmod(tmpFile.name, 0o666);
                                        // console.log(`File permissions changed to writable: ${tmpFile.name}`);
                                    } catch (error) {
                                        console.error(`Error: ${error.message}`);
                                    }
                                    
                                    // Delete the temporary file
                                    tmpFile.removeCallback();
                                    // fs.unlink(tmpFile.name, (err) => {
                                    //     if (err) {
                                    //         console.error(`Failed to delete temporary file: ${err.message}`);
                                    //     } else {
                                    //         console.log(`Temporary file deleted: ${tmpFile.name}`);
                                    //     }
                                    // });

                                    // Clean up listener
                                    documentCloseListener.dispose();
                                }
                            });
                            // setTimeout(tmpFile.removeCallback, 3000); // Cleanup the temporary file after comparison
                            resolve(undefined);
                        } catch (error) {
                            console.log(error);
                            reject(error);
                        }
                    });
                });
            });
        });
    } catch (err) {
        console.error(`Error during compare:`, err);
        vscode.window.showErrorMessage("Error during compare:", err);
    }
}

async function doWebdavAction(
    webdavAction /*: (webdav: any, workingFile: string, remoteFile: string) => Promise<void>*/
) /*: Promise<void>*/ {
    if (!vscode.window.activeTextEditor) {
        vscode.window.showErrorMessage("Cannot find an active text editor...");
        return;
    }

    const workingFile = vscode.window.activeTextEditor.document.uri.fsPath;
    const workingDir = workingFile.slice(0, workingFile.lastIndexOf(path.sep));
    const workingWSFolder = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri);
    console.log('workspaceFolders:', vscode.workspace.workspaceFolders);
    console.log('workingWSFolder:', workingWSFolder);

    // Read configuration
    const config = await getEndpointConfigForCurrentPath(workingDir);

    if (!config) {
        vscode.window.showErrorMessage(
            "Configuration not found for the current path."
        );
        return;
    }

    console.log("config:", config);

    // Ignore SSL errors, needed for self-signed certificates
    if (config.remoteEndpoint?.ignoreSSLErrors) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }

    console.log('vscode.workspace.rootPath:', vscode.workspace.rootPath);
    console.log('vscode.workspace.workspaceFolders:', vscode.workspace.workspaceFolders);
    

    // Initialize WebDAV and remote file path
    const remoteFile = workingFile
        .replace(/\\/g, "/")
        .replace(
            vscode.workspace.rootPath.replace(/\\/g, "/") + config.localRootPath,
            ""
        );
    const url = new URL(config.remoteEndpoint.url);
    config.remoteEndpoint.hostname = url.hostname;
    const credentialsKey = url.port
        ? url.hostname + ":" + url.port
        : url.hostname;

    try {
        // Get WebDAV credentials
        const credentials = await getCredentials(credentialsKey);

        if (!credentials) {
            vscode.window.showWarningMessage("WebDAV login cancelled...");
            vscode.window.showErrorMessage("WebDAV login cancelled...");
            return;
        }

        const webdav = webdavFs(config.remoteEndpoint.url, {
            username: credentials._username,
            password: credentials._password,
        });

        webdav.config = config.remoteEndpoint;

        // Perform WebDAV action
        await webdavAction(webdav, workingFile, remoteFile);

        // Store the password only if there is no WebDAV error and the credentials contain at least a user name
        if (credentials.newCredentials && credentials._username) {
            await storeCredentials(
                credentialsKey,
                credentials._username,
                credentials._password
            );
        }
    } catch (error) {
        console.error("Error in WebDAV action:", error);
        vscode.window.showErrorMessage(
            "Error during WebDAV operation: " + error.message
        );
    }
}

async function getEndpointConfigForCurrentPath(absoluteWorkingDir) {
    const configFile = findConfig("webdav.json", { cwd: absoluteWorkingDir });

    if (configFile == null) {
        vscode.window.showErrorMessage(
            "Endpoint config file for WebDAV (webdav.json) not found in current VScode root folder..."
        );
        return null;
    }
    const webdavConfig = JSON.parse(fs.readFileSync(configFile));
    let allEndpointsConfig;
    if (Array.isArray(webdavConfig)) {
        const configChoices = webdavConfig.map((config, index) =>
            config.label ? ": " + config.label : "Config " + (index + 1).toString()
        );
        const selectedConfig = await vscode.window.showQuickPick(configChoices, {
            placeHolder: "Choose an action to execute",
            canPickMany: false,
        });
        allEndpointsConfig =
            webdavConfig[
            configChoices.findIndex((config) => config === selectedConfig)
            ];
    } else {
        allEndpointsConfig = webdavConfig;
    }
    console.log("allEndpointsConfig:", allEndpointsConfig);
    console.log("configFile:", configFile);

    if (configFile != null && allEndpointsConfig) {
        const endpointConfigDirectory = configFile.slice(
            0,
            configFile.lastIndexOf(path.sep)
        );

        const relativeWorkingDir = absoluteWorkingDir
            .slice(endpointConfigDirectory.length)
            .replace(/\\/g, "/"); // On Windows replace \ with /

        let endpointConfig = null;
        let currentSearchPath = relativeWorkingDir;
        let configOnCurrentSearchPath = null;

        while (!endpointConfig) {
            configOnCurrentSearchPath = allEndpointsConfig[currentSearchPath];

            if (!configOnCurrentSearchPath) {
                // Maybe the path in the configuration has a trailing '/'
                configOnCurrentSearchPath = allEndpointsConfig[currentSearchPath + "/"];
            }

            if (configOnCurrentSearchPath) {
                endpointConfig = configOnCurrentSearchPath;
            } else {
                currentSearchPath = currentSearchPath.slice(
                    0,
                    currentSearchPath.lastIndexOf("/")
                );

                if (currentSearchPath === "") {
                    // issue #1 - check root mapping
                    endpointConfig = allEndpointsConfig["/"];

                    if (!endpointConfig) {
                        vscode.window.showErrorMessage(
                            "Cannot find a remote endpoint configuration for the current working directory " +
                            relativeWorkingDir +
                            " in webdav.json..."
                        );
                        return null;
                    }
                }
            }
        }

        return {
            localRootPath: currentSearchPath,
            remoteEndpoint: endpointConfig,
        };
    }
}

function getCredentials(key) {
    return new Promise((resolve, reject) => {
        credStore.GetCredential(key).then(
            (credentials) => {
                if (credentials !== undefined) {
                    resolve(credentials);
                } else {
                    askForCredentials(key).then(
                        (credentials) => {
                            resolve(credentials);
                        },
                        (error) => reject(error)
                    );
                }
            },
            (error) => reject(error)
        );
    });
}

function askForCredentials(key) {
    return new Promise((resolve, reject) => {
        vscode.window.showInputBox({ prompt: "Username for " + key + " ?" }).then(
            (username) => {
                if (!username) {
                    resolve(EMPTY_CREDENTIALS);
                    return;
                }

                vscode.window
                    .showInputBox({ prompt: "Password ?", password: true })
                    .then(
                        (password) => {
                            if (!password) {
                                resolve(EMPTY_CREDENTIALS);
                                return;
                            }

                            resolve({
                                newCredentials: true,
                                _username: username,
                                _password: password,
                            });
                        },
                        (error) => reject(error)
                    );
            },
            (error) => reject(error)
        );
    });
}

async function storeCredentials(key, username, password) {
    await credStore.SetCredential(key, username, password);
}
