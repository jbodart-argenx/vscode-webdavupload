const vscode = require("vscode");
const fs = require("fs");
// const os = require("os");
const findConfig = require("find-config");
const path = require("path");
const CredentialStore = require("./credentialstore/credentialstore.js");
const { getMultiLineInput } = require('./getMultiLineInput');
const { URL } = require("url");
// const webdavFs = require("webdav-fs");
const beautify = require("js-beautify");
const fetch = require("node-fetch"); // Node.js equivalent to native Browser fetch 
                                     // need to stick to version 2.x (CommonJS)
                                     // since version 3.x uses ESM 
const FormData = require('form-data');
const { Readable } = require('stream');
// const { Blob } = require('buffer');

// require('events').EventEmitter.defaultMaxListeners = 20;  // temporary fix

const tmp = require("tmp");
tmp.setGracefulCleanup();   // remove all controlled temporary objects on process exit

// const Headers = require("./headers"); // custom Headers class equivalent to native Browser Headers
// const { rest } = require("underscore");

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
    const restApiUploadCommand = vscode.commands.registerCommand(
        "extension.restApiUpload",
        restApiUpload
    );
    const restApiCompareCommand = vscode.commands.registerCommand(
        "extension.restApiCompare",
        restApiCompare
    );

    context.subscriptions.push(restApiUploadCommand);
    context.subscriptions.push(restApiCompareCommand);
}

exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() { }

exports.deactivate = deactivate;

// REST API functions
class RestApi {

    constructor(username = null, host = null) {
        this.username = username;
        this.host = host;
        this.encryptedPassword = null;
        this.authToken = null;
        this.remoteFile = null;
        this.localFile = null;
        this.tempFile = null;
        this.fileContents = null;
        this.config = null;
        this.comment = null;
    }

    get apiUrl () {
        return this.host ? `https://${this.host}/lsaf/api` : null;
    }

    async getEndPointConfig() {
        if (!vscode.window.activeTextEditor) {
            vscode.window.showErrorMessage("Cannot find an active text editor...");
            return;
        }
    
        this.localFile = vscode.window.activeTextEditor.document.uri.fsPath;
        const workingDir = this.localFile.slice(0, this.localFile.lastIndexOf(path.sep));
    
        // Read configuration
        const config = await getEndpointConfigForCurrentPath(workingDir);
    
        if (!config) {
            vscode.window.showErrorMessage(
                "Configuration not found for the current path."
            );
            return;
        }
    
        console.log("config:", config);
        this.config = config;

        const workingWSFolder = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri);
        
        const remoteFile = this.localFile
            .replace(/\\/g, "/")
            .replace(
                workingWSFolder.uri.fsPath.replace(/\\/g, "/") + config.localRootPath,
                ""
            );
        console.log('remoteFile:', remoteFile);
        this.remoteFile = remoteFile;
        console.log('this.remoteFile:', this.remoteFile);

        const url = new URL(this.config.remoteEndpoint.url);
        this.host = url.hostname;
        const credentialsKey = url.port
            ? url.hostname + ":" + url.port
            : url.hostname;
        console.log('credentialsKey:', credentialsKey);
        // Get credentials
        const creds = await getCredentials(credentialsKey);
        const { _username:username, _password:password}  = creds;
        this.username = username;
        if (password.toString().slice(0,4) === '{P21}') {
            this.encryptedPassword = password; // already encrypted
        } else {
            await this.encryptPassword(password);
        }
    }


    async encryptPassword(password) {
        const url = `${this.apiUrl}/encrypt`;
        console.log('password:', password);
        if (password === '') {
            console.error('encryptPassword(): no password provided, aborting.');
            this.encryptedPassword = null;
            return;
        }
        if (password.toString().slice(0,4) === '{P21}') {
            this.encryptedPassword = password; // already encrypted
            return;
        }
        const requestOptions = {
            method: "GET",
            headers: {
                "Authorization": "Basic " + btoa(this.username + ":" + password)
            },
            redirect: "follow",
        };
        try {
            const response = await fetch(url, requestOptions);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status} ${response.statusText}`);
            }
            const result = await response.text(); 
            console.log('(encryptPassword) result:', result);
            this.encryptedPassword = result;
        } catch (error) {
            console.error('Error fetching encrypted password:', error);
        }
    }

    async logon() {
        if (!this.encryptedPassword) {
            // const password = "abc123";
            const creds  = await getCredentials(this.host);
            const { _username:username, _password:password}  = creds;
            this.username = username;
            await this.encryptPassword(password);
            if (! this.encryptedPassword) {
                throw new Error('No encrypted password, aborting logon.');
            }
        }
        const url = `https://${this.host}/lsaf/api/logon`;
        const requestOptions = {
            method: "POST",
            headers: {
                "Authorization": "Basic " + btoa(this.username + ":" + this.encryptedPassword)
            },
            // redirect: "follow",
            redirect: 'manual' // Handle redirection manually to prevent changing method to GET
        };
        try {
            let response = await fetch(url, requestOptions);
            // Check if there's a redirect (3xx status code)
            const maxRedirects = 20;
            let redirects = 1;
            while (response.status >= 300 && response.status < 400 && redirects < maxRedirects) {
                const redirectUrl = response.headers.get('location');
                if (redirectUrl) {
                    console.log(`Response status: ${response.status} ${response.statusText}, Redirecting (${redirects}) to: ${redirectUrl}`);
                    vscode.window.showInformationMessage(`Redirecting (${redirects}) to: ${redirectUrl}`);
                    // Perform the request again at the new location
                    response = await fetch(redirectUrl, requestOptions);
                }
                redirects+=1;
            }
            if (response.ok) {
                const authToken = response.headers.get("x-auth-token");
                console.log("authToken", authToken, "response", response);
                this.authToken = authToken;
                // Store the password only if there is no WebDAV error and the credentials contain at least a user name
                await storeCredentials(
                    this.host, // credentialsKey
                    this.username,
                    this.encryptedPassword
                );
            } else {
                console.log(`${response.status} ${response.statusText}`);
                const text = await response.text();
                console.log('response text:', text);
                throw new Error(`HTTP error! Status: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error fetching x-auth-token:', error)
        }
    }

    async getRemoteFileContents () {
        if (!this.authToken) {
            await this.logon();
        }
        const apiUrl = `https://${this.host}/lsaf/api`;
        const urlPath = new URL(this.config.remoteEndpoint.url).pathname
            .replace(/\/lsaf\/webdav\/work\//, '/workspace/files/')
            .replace(/\/lsaf\/webdav\/repo\//, '/repository/files/')
            .replace(/\/$/, '')
            ;
        console.log('urlPath:', urlPath)
        const filePath = this.remoteFile;
        const apiRequest = `${urlPath}${filePath}?component=contents`;
        const requestOptions = {
            method: "GET",
            headers: { "X-Auth-Token": this.authToken },
            redirect: "follow",
        };
        try {
            const response = await fetch(apiUrl + apiRequest, requestOptions);
            if (!response.ok) {
                const responseText = await response.text();
                console.log("responseText", responseText);
                throw new Error(`HTTP error! Status: ${response.status}  ${response.statusText}`);
            }
            const responseText = await response.text();
            console.log("responseText", responseText);
            this.fileContents = responseText;
        } catch (error) {
            console.error("Error fetching Remote File Contents:", error);
            this.fileContents = null;
        }
    };

    async compareFileContents() {
        // Write the remote file to a local temporary file
        const extension = this.localFile.slice(this.localFile.lastIndexOf("."));
        // Simple synchronous temporary file creation, the file will be closed and unlinked on process exit.
        this.tempFile = tmp.fileSync({ postfix: extension });
        console.log("tempFile:", this.tempFile);
        try {
            if (!this.fileContents) {
                await this.getRemoteFileContents ()
                if (!this.fileContents) {
                    throw new Error("Failed to get remote file contents.");
                }
            }    
            await fs.promises.writeFile(this.tempFile.name, this.fileContents)
            console.log(`Downloaded as ${this.tempFile.name}`);
            // Set the file to read-only (cross-platform)
            try {
                await fs.promises.chmod(this.tempFile.name, 0o444);
                console.log(`File is now read-only: ${this.tempFile.name}`);
            } catch(err) {
                console.error(`Failed to set file as read-only: ${err}`);
            }
            
            // Compare after successfully writing the file
            try {
                const fileName = this.remoteFile.slice(
                    this.remoteFile.lastIndexOf("/") + 1
                );
                vscode.window.showInformationMessage(
                    `Comparing: ${fileName} with ${this.host.split(".")[0]} remote file`
                );
                await vscode.commands.executeCommand(
                    "vscode.diff",
                    vscode.Uri.file(path.normalize(this.tempFile.name)),
                    vscode.Uri.file(this.localFile),
                    fileName + ` (${this.host.split(".")[0]} Compare)`,
                    {
                        preview: false, 
                        selection: null, // Don't select any text in the compare
                    }
                );
                // Listen for the diff editor closing
                const documentCloseListener = vscode.workspace.onDidCloseTextDocument(async (document) => {
                    console.log(`Closing document URI: ${document.uri.toString()}`);
                    let normDocPath = path.normalize(document.uri.fsPath);
                    let normTempFile = path.normalize(this.tempFile.name);
                    if ( // os.platform() === 'win32' &&
                        fs.existsSync(normTempFile.toLowerCase()) &&
                        fs.existsSync(normTempFile.toUpperCase())
                        ) 
                    {
                        // console.log('FileSystem is case-insensitive!');
                        normDocPath = normDocPath.toLowerCase();
                        normTempFile = normTempFile.toLowerCase();
                    }
                    // If the document being closed is the temp file, delete it
                    if (normDocPath === normTempFile) {
                        // Change permissions to writable (0o666 allows read and write for all users)
                        try {
                            await fs.promises.chmod(this.tempFile.name, 0o666);
                            // console.log(`File permissions changed to writable: ${this.tempFile.name}`);
                        } catch (error) {
                            console.error(`Error: ${error.message}`);
                        }
                        // Delete the temporary file
                        this.tempFile.removeCallback();
                        this.tempFile = null;
                        // Clean up listener
                        documentCloseListener.dispose();
                    }
                });
            } catch (error) {
                console.log(error);
            }
        } catch (err) {
            console.error(`Error: ${err.message}`);
        }
    }

    async getEditorContents () {
        // Get the active text editor
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
        return;
        }
        // Get the file content
        const document = editor.document;
        const fileContent = document.getText(); // Get all the content of the current file
        const fileName = document.fileName;     // Get the file name
        this.localFile = fileName;
        this.fileContents = fileContent;
    }

    async enterComment (defaultValue) {
        // Show an input box where the user can enter a comment
        const userInput = await vscode.window.showInputBox({
            placeHolder: 'Enter your comment here',
            prompt: 'Please provide a comment',
            value: `${defaultValue || ''}`,
            ignoreFocusOut: true // Keeps the input box open even when focus is lost
        });
        // Check if user canceled the input
        if (userInput === undefined) {
            console.log('Comment input was canceled');
            // vscode.window.showInformationMessage('Comment input was canceled');
            this.comment = null;
        } else {
            console.log(`Comment entered: ${userInput}`);
            // vscode.window.showInformationMessage(`Comment entered: ${userInput}`);
            this.comment = userInput;
        }
    }

    async enterMultiLineComment(defaultValue) {

    
        vscode.window.showInformationMessage('Enter a (multi-line) comment and close the editor when done.');
    
        const userInput = await getMultiLineInput(defaultValue);

        if (userInput.trim()) {
            console.log(`Comment entered: ${userInput}`);
            vscode.window.showInformationMessage(`Comment entered: ${userInput}`);
            this.comment = userInput;
        } else {
            console.log('No comment provided.');
            // vscode.window.showInformationMessage('No comment provided.');
            this.comment = null;
        }
        console.log('Entered comment:\n',  this.comment);
    }

    async getFormData(useEditorContents = true) {
        let filename;
        const filePath = this.remoteFile;
        const formdata = new FormData();
        if (useEditorContents) {
            
            // Create a Buffer from the string content and convert it to a Readable Stream
            const bufferStream = new Readable();
            bufferStream._read = () => {}; // No operation needed for the _read method
            bufferStream.push(this.fileContents); // Push the content to the stream
            bufferStream.push(null);    // Signal end of the stream

            // filename = this.localFile;
            filename = (this.localFile??'editorContents.txt')?.split(/[\\\/]/).slice(-1)[0];
            console.log('filename:', filename);

            // Append the file-like content to the FormData object with the key 'uploadFile'
            formdata.append('uploadFile', bufferStream, { filename });
            // formdata.append('uploadFile', new Blob([this.fileContents]), filename);    // fails because Blob is not a stream
            console.log('formdata:', formdata);
        } else {
            filename = filePath.split(/[\\\/]/).slice(-1)[0];
            console.log('filename:', filename);
            /*
            const data = await fs.promises.readFile(this.localFile);
            const decoder = new TextDecoder('utf-8');
            const fileContents = decoder.decode(data);
            console.log('fileContents:', fileContents);
            formdata.append('uploadFile', Buffer.from(fileContents), filename);    // works
            */
            // formdata.append('uploadFile', new Blob([fileContents]), filename);  // fails because Blob is not a stream
            formdata.append('uploadFile', fs.createReadStream(this.localFile), filename);
            console.log('formdata:', formdata);
        }
        return formdata;
    }
    
    async uploadFile (param) {
        console.log('param:', param);
        let useEditorContents = false;
        if (typeof param === 'boolean') {
            useEditorContents = param;
        } else if (param instanceof vscode.Uri) {
            this.localFile = param.fsPath;
        } else if (param === undefined) {
            useEditorContents = true;
        }
        console.log('useEditorContents:', useEditorContents);
        if (useEditorContents) {
            await this.getEditorContents();
            if (!this.fileContents == null) {
                console.log(`Null or Undefined Editor Contents, aborting upload.`);
                vscode.window.showWarningMessage(`Null or Undefined Editor Contents, aborting upload.`);
                return;
            }
        } else {
            if (! this.localFile || ! fs.existsSync(this.localFile)) {
                console.log(`Local File "${this.localFile}" not found, aborting upload.`);
                vscode.window.showWarningMessage(`Local File "${this.localFile}" not found, aborting upload.`);
                return;
            }
        }
        if (!this.authToken) {
            await this.logon();
        }
        const apiUrl = `https://${this.host}/lsaf/api`;
        const urlPath = new URL(this.config.remoteEndpoint.url).pathname
            .replace(/\/lsaf\/webdav\/work\//, '/workspace/files/')
            .replace(/\/lsaf\/webdav\/repo\//, '/repository/files/')
            .replace(/\/$/, '')
            ;
        console.log('urlPath:', urlPath)
        const filePath = this.remoteFile;
        console.log('filePath:', filePath);
        let apiRequest = `${urlPath}${filePath}?action=upload&version=MAJOR&createParents=true&overwrite=true`;
        // await this.enterComment(`Add / Update ${(this.localFile?.split(/[\\\/]/)??'...').slice(-1)}`);
        await this.enterMultiLineComment(`Add / Update ${(this.localFile?.split(/[\\\/]/)??'...').slice(-1)}\n\n`);
        if (this.comment) {
            apiRequest = `${apiRequest}&comment=${encodeURIComponent(this.comment)}`;
        }
        apiRequest = `${apiRequest}&expand=item,status`;
        console.log('useEditorContents:', useEditorContents);
        let formdata;
        let requestOptions;
        formdata = await this.getFormData(useEditorContents);
        requestOptions = {
            method: "PUT",
            body: formdata,
            headers: { 
                ...formdata.getHeaders(),
                "X-Auth-Token": this.authToken
            },
            // redirect: "follow",
            redirect: 'manual' // Handle redirection manually to prevent changing method to GET
        };
        // console.log(JSON.stringify(requestOptions));
        try {
            const fullUrl = apiUrl + apiRequest
            console.log('fullUrl:', fullUrl);
            let response = await fetch(apiUrl + apiRequest, requestOptions);
            console.log('response.status:', response.status, response.statusText);
            // Check if there's a redirect (3xx status code)
            const maxRedirects = 20;
            let redirects = 1;
            while (response.status >= 300 && response.status < 400 && redirects < maxRedirects) {
                const redirectUrl = response.headers.get('location');
                if (redirectUrl) {
                    console.log(`Response status: ${response.status} ${response.statusText}, Redirecting (${redirects}) to: ${redirectUrl}`);
                    vscode.window.showInformationMessage(`Redirecting (${redirects}) to: ${redirectUrl}`);
                    // re-create the formdata and file stream (they can only be used once!)
                    formdata = await this.getFormData(useEditorContents);
                    requestOptions = {
                        method: "PUT",
                        body: formdata,
                        headers: { 
                            ...formdata.getHeaders(),
                            "X-Auth-Token": this.authToken
                        },
                        // redirect: "follow",
                        redirect: 'manual' // Handle redirection manually to prevent changing method to GET
                    };
                    // Perform the PUT request again at the new location
                    try {
                        response = await fetch(redirectUrl, requestOptions);
                    } catch (error) {
                        console.log('error:', error);
                    }
                }
                redirects+=1;
            }
            if (!response.ok) {
                if (redirects >= maxRedirects) {
                    vscode.window.showErrorMessage(`HTTP error uploading file, too many redirects! Status: ${response.status}  ${response.statusText}`);
                    throw new Error(`HTTP error uploading file, too many redirects! Status: ${response.status}  ${response.statusText}`);
                }
                const responseText = await response.text();
                console.log("responseText:", responseText);
                vscode.window.showErrorMessage(`HTTP error uploading file! Status: ${response.status}  ${response.statusText}`);
                throw new Error(`HTTP error uploading file! Status: ${response.status}  ${response.statusText}`);
            }
            let result;
            let status;
            let message;
            const contentType = response.headers.get('content-type');
            console.log('contentType:', contentType);
            if (response.headers.get('content-type').match(/\bjson\b/)) {
                const data = await response.json();
                status = data.status;
                result = beautify(JSON.stringify(data), {
                    indent_size: 2,
                    space_in_empty_paren: true,
                });
            } else {
                result = await response.text();
            }
            if (status?.type === 'FAILURE') {
                message = "File Upload failed: " + status?.message || result;
            } else  if (status?.type === 'SUCCESS') {
                message = "File Upload success: " + status?.message || result;
            } else  {
                console.log('result:', result);
                message = `File "${filename}" upload result: ${result}`;
            }
            console.log(message);
            vscode.window.showInformationMessage(message);
        } catch (error) {
            vscode.window.showErrorMessage("Error Uploading File:", error);
            console.error("Error Uploading File:", error);
            this.fileContents = null;
        }
    };

}


// 

async function restApiUpload(param) {
    if (param instanceof vscode.Uri) {
        vscode.window.showInformationMessage(`Rest API: Uploading File URI: ${param.fsPath}`);
    }
    const restApi = new RestApi();
    try {
        await restApi.getEndPointConfig();  // also sets remoteFile based on the contents of the active editor
        await restApi.uploadFile(param);
    } catch (err) {
        console.log(err);
    }
}

async function restApiCompare() {
    const restApi = new RestApi();
    try {
        await restApi.getEndPointConfig();  // also sets remoteFile based on the contents of the active editor
        await restApi.getRemoteFileContents();
        await restApi.compareFileContents();
    } catch (err) {
        console.log(err);
    }
}

async function getEndpointConfigForCurrentPath(absoluteWorkingDir) {
    // Finds the first matching config file, if any, in the current directory, nearest ancestor, or user's home directory.
    const configFile = findConfig("webdav.json", { cwd: absoluteWorkingDir });

    if (configFile == null) {
        vscode.window.showErrorMessage(
            "Endpoint config file for WebDAV (webdav.json) not found in current VScode root folder..."
        );
        return null;
    }
    let restApiConfig;
    try {
        restApiConfig = JSON.parse(fs.readFileSync(configFile));
    } catch (error) {
        vscode.window.showErrorMessage(`Error parsing config File: ${configFile}, ${error.message}`)
    }
    
    let allEndpointsConfig;
    if (Array.isArray(restApiConfig)) {
        const configChoices = restApiConfig.map((config, index) =>
            config.label ? ": " + config.label : "Config " + (index + 1).toString()
        );
        const selectedConfig = await vscode.window.showQuickPick(configChoices, {
            placeHolder: "Choose a remote location",
            canPickMany: false,
        });
        allEndpointsConfig =
            restApiConfig[
            configChoices.findIndex((config) => config === selectedConfig)
            ];
    } else {
        allEndpointsConfig = restApiConfig;
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
