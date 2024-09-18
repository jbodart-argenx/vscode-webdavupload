const vscode = require("vscode");
const fs = require("fs");
// const os = require("os");
const findConfig = require("find-config");
const path = require("path");
// const CredentialStore = require("../credentialstore/credentialstore.js");
const keytar = require('keytar');
const { getMultiLineText:getMultiLineInput, showMultiLineText } = require('./multiLineText.js');
const { showFolderView } = require('./folderView.js');
const { fileMD5sum, fileMD5sumStripBom } = require('./md5sum.js');
const isBinaryFile = require("isbinaryfile").isBinaryFile;
// const languageEncoding = require("detect-file-encoding-and-language");

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


// Global variable to store authentication tokens (in memory only)
let authTokens = {};

// const credStore = new CredentialStore.CredentialStore(
//     "vscode-lsaf-rest-api:",
//     ".lsaf-rest-api",
//     "lsaf-rest-api-secrets.json"
// );

class CredentialStore{
    constructor(){
        this.app = 'jbodart-argenx.lsaf-rest-api';
    }

    async GetCredential(key){
        const jsonCreds = await keytar.getPassword(this.app, key);
        if (!jsonCreds) return null;
        try {
            const creds = JSON.parse(jsonCreds);
            const newCreds = {
                newCredentials: false,
                _username: creds.username,
                _password: creds.password,
            };
            return newCreds;
        } catch (error) {
            console.error(error.message)
        }
    }

    async SetCredential(key, username, password){
        await keytar.setPassword(this.app, key, JSON.stringify({username, password}));
    }
}

const credStore = new CredentialStore();

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

    context.subscriptions.push(restApiUploadCommand);
    context.subscriptions.push(restApiCompareCommand);
    context.subscriptions.push(restApiPropertiesCommand);
    context.subscriptions.push(restApiVersionsCommand);
    context.subscriptions.push(restApiFolderContentsCommand);
    context.subscriptions.push(localFolderContentsCommand);
}

exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() { 
    // Clean up by removing the tokens (optional, as they will be cleared anyway when the extension is deactivated)
    authTokens = undefined;
}

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
        this.localFileStat = null;
        this.tempFile = null;
        this.fileContents = null;
        this.fileVersion = null;
        this.config = null;
        this.comment = null;
        this.fileProperties = null;
        this.fileVersions = null;
        this.folderContents = null;
        this.remoteFolderContents = null;
    }

    get apiUrl () {
        return this.host ? `https://${this.host}/lsaf/api` : null;
    }

    async getEndPointConfig(param, onlyRepo = false) {
        if (param instanceof vscode.Uri) {
            console.log('(getEndPointConfig) param:', param);
            this.localFile = param.fsPath;
            this.localFileStat = await vscode.workspace.fs.stat(param);

        } else if (vscode.window.activeTextEditor) {
            this.localFile = vscode.window.activeTextEditor.document.uri.fsPath;
            this.localFileStat = await vscode.workspace.fs.stat(vscode.window.activeTextEditor.document.uri);
        }
        else {
            this.localFile = null;
            this.localFileStat = null;
            this.config = null;
            vscode.window.showErrorMessage("Cannot identify local file from selection nor from active text editor...");
            return;
        }
    
        const workingDir = this.localFile.slice(0, this.localFile.lastIndexOf(path.sep));
        console.log('(getEndPointConfig) workingDir:', workingDir);
    
        // Read configuration
        const config = await getEndpointConfigForCurrentPath(workingDir, onlyRepo);
    
        if (!config) {
            vscode.window.showErrorMessage(
                "Configuration not found for the current path."
            );
            
            this.config = null;
            return;
        }
    
        console.log("config:", config);
        this.config = config;

        const workingWSFolder = vscode.workspace.getWorkspaceFolder(
            (param instanceof vscode.Uri) ?
            param :
            vscode.window.activeTextEditor.document.uri);
        
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
        /*
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
        */
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
        if (this.host && authTokens[this.host]) {
            // Check that token is still valid
            const url = `https://${this.host}/lsaf/api/workspace/folders/?component=children`;
            const requestOptions = {
                method: "GET",
                headers: { "X-Auth-Token": authTokens[this.host] },
                redirect: "follow",
            };
            try {
                const response = await fetch(url, requestOptions);
                if (response.status !== 401) {
                    console.log(response.status, response.statusText);
                    if (response.ok){
                        this.authToken = authTokens[this.host];
                        console.log(`Reusing stored Auth Token for host ${this.host}: ${this.authToken}`);
                        return;
                    } else {
                        console.log(`Unexpected HTTP response status ${response.status} ${response.statusText}:`);
                        response.headers.forEach((value, name) => {
                            console.log(`${name}: ${value}`);
                        });
                        if (response.headers.get('content-type').match(/\bjson\b/)) {
                            const data = await response.json();
                            console.log(beautify(JSON.stringify(data), {
                                indent_size: 2,
                                space_in_empty_paren: true,
                            }));
                        }
                    }
                } else {
                    delete authTokens[this.host];
                }
            } catch(err) {
                console.log(err);
            }
        }
        if (!this.encryptedPassword) {
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
                console.log(`Storing Auth Token for host ${this.host}: ${this.authToken}`);
                authTokens[this.host] = authToken;
                // Store the password only if there is no HTTP error and the credentials contain at least a user name
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

    async getRemoteFileContents (param) {
        if (param instanceof vscode.Uri) {
            this.localFile = param.fsPath;
        }
        await this.logon();  // check that authToken is still valid
        const apiUrl = `https://${this.host}/lsaf/api`;
        const urlPath = new URL(this.config.remoteEndpoint.url).pathname
            .replace(/\/lsaf\/webdav\/work\//, '/workspace/files/')
            .replace(/\/lsaf\/webdav\/repo\//, '/repository/files/')
            .replace(/\/$/, '')
            ;
        console.log('urlPath:', urlPath)
        const filePath = this.remoteFile;
        let selectedVersion = null;
        let selectedVersions = null;
        let compareVersion = null;
        if (/\/repository\/files\//.test(urlPath)) {
            await this.getRemoteFileVersions();
            let versions = this.fileVersions;
            const MAX_ITEMS = 30;
            const PICK_MULTIPLE = true;
            if (Array.isArray(versions.items) && versions.items.length > 1) {
                const allVersions = versions.items.slice(0, MAX_ITEMS).map(item => 
                    {
                        return ({
                            label: `${item.version}`, 
                            description: `size: ${item.size}, created: ${item.created} by ${item.createdBy}`, 
                            detail: item.comment
                        })
                    });
                selectedVersions = await vscode.window.showQuickPick(allVersions, 
                    {canPickMany: PICK_MULTIPLE, title: 'Select a version', placeHolder: allVersions[0].label, ignoreFocusOut: true,});
                if (!!PICK_MULTIPLE) {
                    selectedVersion = selectedVersions[0];
                    compareVersion = selectedVersions[1];
                    console.log('compareVersion:', compareVersion);}
                } else {
                    selectedVersion = selectedVersions;
                }
            } else {
                selectedVersion = null;
            }

        const apiRequest = `${urlPath}${filePath}?component=contents` + (selectedVersion?.label ? `&version=${selectedVersion.label}` : '');
        const requestOptions = {
            method: "GET",
            headers: { "X-Auth-Token": this.authToken },
            redirect: "follow",
        };
        try {
            const response = await fetch(apiUrl + apiRequest, requestOptions);
            const contentType = response.headers.get('content-type');
            console.log('contentType:', contentType);
            let result = null;
            let data  = null;
            if (!response.ok) {
                if (contentType.match(/\bjson\b/)) {
                    data = await response.json();
                    /*
                    if (data.status){
                        status = data.status;
                        status.httpStatus = { code: response.status, text: response.statusText };
                    } else {
                        status = { httpStatusCode: response.status, httpStatusText: response.statusText };
                    }
                    */
                    if (data.message) {
                        result = data.details||data.message;
                        if (data.remediation && data.remediation !== "No remediation message is available.") {
                            result =`${result.trim()}, remediation: ${data.remediation}`;
                        }
                    } else {
                        result = beautify(JSON.stringify(data), {
                            indent_size: 2,
                            space_in_empty_paren: true,
                        });
                    }
                } else {
                    result = await response.text();
                    result = `${response.status}, ${response.statusText}: Result: ${result}`;
                }
                throw new Error(`HTTP error! ${result}`);
            }
            const responseText = await response.text();
            console.log("responseText", responseText);
            this.fileContents = responseText;
            this.fileVersion = selectedVersion?.label || null;
        } catch (error) {
            console.error("Error fetching Remote File Contents:", error);
            vscode.window.showErrorMessage("Error fetching Remote File Contents:", error.message);
            this.fileContents = null;
        }
    };

    async getFileStat(param) {
        let fileStat;
        if (param instanceof vscode.Uri) {
            // param is a Uri
            fileStat = await vscode.workspace.fs.stat(param);
        } else if (typeof param === 'string') {
            // assuming param is a file
            fileStat = await vscode.workspace.fs.stat(vscode.Uri.file(param));
        }
        return fileStat;
    }

    async getRemoteFileProperties (param) {
        if (param instanceof vscode.Uri) {
            this.localFile = param.fsPath;
        } else {
            this.localFile = vscode.window.activeTextEditor.document.uri.fsPath;
        }
        if (! this.localFile) {
            console.error('Cannot get Remote File Properties of a non-specified file:', this.localFile);
            vscode.window.showErrorMessage('Cannot get Remote File Properties of a non-specified file:', this.localFile);
            return;
        }
        await this.logon();
        const apiUrl = `https://${this.host}/lsaf/api`;
        const fileStat = await this.getFileStat(this.localFile);
        console.log('Local File:', this.localFile, 'fileStat:', fileStat);
        let itemType;
        if (fileStat.type === vscode.FileType.File) {
            itemType = 'file';
        } else if (fileStat.type === vscode.FileType.Directory) {
            if (this.config.remoteEndpoint.url.match(/\/lsaf\/webdav\/repo\//)) {
                itemType = 'container';
            } else  {
                itemType = 'folder';
            }
        } else {
            return vscode.window.showWarningMessage(`Get Remote File Properties: ${this.localFile} is neither a file nor a folder!`);
        }
        const urlPath = new URL(this.config.remoteEndpoint.url).pathname
            .replace(/\/lsaf\/webdav\/work\//, `/workspace/${itemType}s/`)
            .replace(/\/lsaf\/webdav\/repo\//, `/repository/${itemType}s/`)
            .replace(/\/$/, '')
            ;
        console.log('urlPath:', urlPath)
        const filePath = this.remoteFile;
        // console.log('filePath:', filePath)
        const apiRequest = `${urlPath}${filePath}?component=properties`;
        const requestOptions = {
            method: "GET",
            headers: { "X-Auth-Token": this.authToken },
            redirect: "follow",
        };
        try {
            const response = await fetch(apiUrl + apiRequest, requestOptions);
            const contentType = response.headers.get('content-type');
            console.log('contentType:', contentType);
            let result = null;
            let data  = null;
            if (contentType.match(/\bjson\b/)) {
                data = await response.json();
                if (data.message) {
                    result = data.details||data.message;
                    if (data.remediation && data.remediation !== "No remediation message is available.") {
                        result =`${result.trim()}, remediation: ${data.remediation}`;
                    }
                } else {
                    result = beautify(JSON.stringify(data), {
                        indent_size: 2,
                        space_in_empty_paren: true,
                    });
                }
            } else {
                result = await response.text();
                result = `${response.status}, ${response.statusText}: Result: ${result}`;
            }
            if (!response.ok) {
                throw new Error(`HTTP error! ${result}`);
            } else {
                if (data) {
                    this.fileProperties = data;
                } else {
                    this.fileProperties = result;    
                }            
            }

        } catch (error) {
            console.error("Error fetching Remote File Properties:", error);
            vscode.window.showErrorMessage("Error fetching Remote File Properties:", error.message);
            this.fileProperties = null;
        }
    };

    async getRemoteFolderContents (param) {
        if (param instanceof vscode.Uri) {
            this.localFile = param.fsPath;
        } else {
            this.localFile = vscode.window.activeTextEditor.document.uri.fsPath;
        }
        if (! this.localFile) {
            console.error('Cannot get Remote Folder Contents of a non-specified path:', this.localFile);
            vscode.window.showErrorMessage('Cannot get Remote Folder Contents of a non-specified path:', this.localFile);
            return;
        }
        await this.logon();
        const apiUrl = `https://${this.host}/lsaf/api`;
        const fileStat = await this.getFileStat(this.localFile);
        console.log('Local File:', this.localFile, 'fileStat:', fileStat);
        let itemType;
        if (fileStat.type === vscode.FileType.File) {
            return vscode.window.showWarningMessage(`Get Remote Folder Contents: ${this.localFile} is not a folder!`);
        } else if (fileStat.type === vscode.FileType.Directory) {
            if (this.config.remoteEndpoint.url.match(/\/lsaf\/webdav\/repo\//)) {
                itemType = 'container';
            } else  {
                itemType = 'folder';
            }
        } else {
            return vscode.window.showWarningMessage(`Get Remote Folder Contents: ${this.localFile} is neither a file nor a folder!`);
        }
        const urlPath = new URL(this.config.remoteEndpoint.url).pathname
            .replace(/\/lsaf\/webdav\/work\//, `/workspace/${itemType}s/`)
            .replace(/\/lsaf\/webdav\/repo\//, `/repository/${itemType}s/`)
            .replace(/\/$/, '')
            ;
        console.log('urlPath:', urlPath)
        const filePath = this.remoteFile;
        // console.log('filePath:', filePath)
        const apiRequest = `${urlPath}${filePath}?component=children&expand=item&limit=10000`;
        const requestOptions = {
            method: "GET",
            headers: { "X-Auth-Token": this.authToken },
            redirect: "follow",
        };
        try {
            const response = await fetch(apiUrl + apiRequest, requestOptions);
            const contentType = response.headers.get('content-type');
            console.log('contentType:', contentType);
            let result = null;
            let data  = null;
            if (contentType.match(/\bjson\b/)) {
                data = await response.json();
                if (data.message) {
                    result = data.details||data.message;
                    if (data.remediation && data.remediation !== "No remediation message is available.") {
                        result =`${result.trim()}, remediation: ${data.remediation}`;
                    }
                } else {
                    result = beautify(JSON.stringify(data), {
                        indent_size: 2,
                        space_in_empty_paren: true,
                    });
                }
            } else {
                result = await response.text();
                result = `${response.status}, ${response.statusText}: Result: ${result}`;
            }
            if (!response.ok) {
                throw new Error(`HTTP error! ${result}`);
            } else {
                if (data) {
                    this.remoteFolderContents = data;
                } else {
                    this.remoteFolderContents = result;    
                }            
            }

        } catch (error) {
            console.error("Error fetching Remote Folder Contents:", error);
            vscode.window.showErrorMessage("Error fetching Remote Folder Contents:", error.message);
            this.remoteFolderContents = null;
        }
    };


    async getRemoteFileVersions (param) {
        if (param instanceof vscode.Uri) {
            this.localFile = param.fsPath;
        }
        await this.logon();
        const apiUrl = `https://${this.host}/lsaf/api`;
        const urlPath = new URL(this.config.remoteEndpoint.url).pathname
            .replace(/\/lsaf\/webdav\/work\//, '/workspace/files/')
            .replace(/\/lsaf\/webdav\/repo\//, '/repository/files/')
            .replace(/\/$/, '')
            ;
        console.log('urlPath:', urlPath)
        const filePath = this.remoteFile;
        const apiRequest = `${urlPath}${filePath}?component=versions`;
        const requestOptions = {
            method: "GET",
            headers: { "X-Auth-Token": this.authToken },
            redirect: "follow",
        };
        try {
            const response = await fetch(apiUrl + apiRequest, requestOptions);
            const contentType = response.headers.get('content-type');
            console.log('contentType:', contentType);
            let result = null;
            let data  = null;
            if (contentType.match(/\bjson\b/)) {
                data = await response.json();
                if (data.message) {
                    result = data.details||data.message;
                    if (data.remediation && data.remediation !== "No remediation message is available.") {
                        result =`${result.trim()}, remediation: ${data.remediation}`;
                    }
                } else {
                    result = beautify(JSON.stringify(data), {
                        indent_size: 2,
                        space_in_empty_paren: true,
                    });
                }
            } else {
                result = await response.text();
                result = `${response.status}, ${response.statusText}: Result: ${result}`;
            }
            if (!response.ok) {
                throw new Error(`HTTP error! ${result}`);
            } else {
                if (data) {
                    this.fileVersions = data;
                } else {
                    this.fileVersions = result;    
                }            
            }

        } catch (error) {
            console.error("Error fetching Remote File Versions:", error);
            vscode.window.showErrorMessage("Error fetching Remote File Versions:", error.message);
            this.fileVersions = null;
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
                const versionLabel = this.fileVersion ? ` (v${this.fileVersion})` : '';
                vscode.window.showInformationMessage(
                    `Comparing: ${fileName} with ${this.config.label || this.host.split(".")[0]} remote file ${versionLabel}`
                );
                await vscode.commands.executeCommand(
                    "vscode.diff",
                    vscode.Uri.file(path.normalize(this.tempFile.name)),
                    vscode.Uri.file(this.localFile),
                    fileName + ` (${this.config.label || this.host.split(".")[0]}${versionLabel} ↔ local)`,
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
                throw new Error(error);
            }
        } catch (err) {
            console.error(`Error: ${err.message}`);
            vscode.window.showErrorMessage(`Error: ${err.message}`)
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

    
        vscode.window.showInformationMessage(`Enter a (multi-line) comment and click 'submit' when done.`);
    
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
        return [formdata, filename];
    }
    
    async uploadFile (param) {
        console.log('param:', param);
        let useEditorContents = false;
        if (typeof param === 'boolean') {
            useEditorContents = param;
        } else if (param instanceof vscode.Uri) {
            const fileStat = await this.getFileStat(param);
            if (fileStat.type === vscode.FileType.File) {
                this.localFile = param.fsPath;
            }else if (fileStat.type === vscode.FileType.Directory) {
                return vscode.window.showWarningMessage(`Upload File: ${param.fsPath} is a folder!`);
            } else {
                return vscode.window.showWarningMessage(`Upload File: ${param} is neither a file nor a folder!`);
            }
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
            if (! this.localFile) {
                console.log(`No local File specified, aborting upload.`);
                vscode.window.showWarningMessage(`No local File specified, aborting upload.`);
                return;
            }
            if (! fs.existsSync(this.localFile)) {
                console.log(`Local File "${this.localFile}" not found, aborting upload.`);
                vscode.window.showWarningMessage(`Local File "${this.localFile}" not found, aborting upload.`);
                return;
            }
        }
        await this.logon();
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
        let filename;
        let requestOptions;
        [formdata, filename] = await this.getFormData(useEditorContents);
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
                    [formdata, filename] = await this.getFormData(useEditorContents);
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
                message = `File "${filename}" upload failed: ` + status?.message || result;
            } else  if (status?.type === 'SUCCESS') {
                message = `File "${filename}" uploaded: ` + status?.message || result;
            } else  {
                console.log('result:', result);
                message = `File "${filename}" upload result: ${result}`;
            }
            console.log(message);
            vscode.window.showInformationMessage(message);
        } catch (error) {
            vscode.window.showErrorMessage(`Error uploading file "${filename}":`, error);
            console.error(`Error uploading file "${filename}":`, error);
            this.fileContents = null;
        }
    };

}


// 

async function restApiUpload(param) {
    const restApi = new RestApi(); 
    if (param instanceof vscode.Uri) {
        vscode.window.showInformationMessage(`Rest API: Uploading File URI: ${param.fsPath}`);
    }
    try {
        await restApi.getEndPointConfig(param); // based on the passed Uri (if defined)
                                                // otherwise based on the path of the local file open in the active editor
                                                // also sets remoteFile
        if (!restApi.config) {
            return;
        }
        await restApi.uploadFile(param);
    } catch (err) {
        console.log(err);
    }
}

async function restApiCompare(param) {
    const restApi = new RestApi();
    try {
        await restApi.getEndPointConfig(param); // based on the passed Uri (if defined)
                                                // otherwise based on the path of the local file open in the active editor
                                                // also sets remoteFile
        if (!restApi.config) {
            return;
        }
        await restApi.getRemoteFileContents();
        await restApi.compareFileContents();
    } catch (err) {
        console.log(err);
    }
}

async function restApiProperties(param) {
    const restApi = new RestApi();
    try {
        await restApi.getEndPointConfig(param); // based on the passed Uri (if defined)
                                                // otherwise based on the path of the local file open in the active editor
                                                // also sets remoteFile
        if (!restApi.config) {
            return;
        }
        await restApi.getRemoteFileProperties(param);
        let properties = restApi.fileProperties;
        if (typeof properties === 'object') {
            properties = beautify(JSON.stringify(properties), {
                indent_size: 2,
                space_in_empty_paren: true,
            });
        }
        console.log("File properties:\n", properties);
        // vscode.window.showInformationMessage(properties);
        showMultiLineText(properties, "Remote File Properties", `${restApi.config.label} file properties: ${restApi.remoteFile}`);
    } catch (err) {
        console.log(err);
    }
}

// restApiVersions
async function restApiVersions(param) {
    const restApi = new RestApi();
    try {
        const onlyRepo = true;
        await restApi.getEndPointConfig(param, onlyRepo);   // based on the passed Uri (if defined)
                                                            // otherwise based on the path of the local file open in the active editor
                                                            // also sets remoteFile
        if (!restApi.config) {
            return;
        }
        await restApi.getRemoteFileVersions();
        let versions = restApi.fileVersions;
        if (typeof versions === 'object') {
            versions = beautify(JSON.stringify(versions), {
                indent_size: 2,
                space_in_empty_paren: true,
            });
        }
        console.log("File versions:\n", versions);
        // vscode.window.showInformationMessage(versions);
        showMultiLineText(versions, "Remote File Versions", `${restApi.config.label} file versions: ${restApi.remoteFile}`);
    } catch (err) {
        console.log(err);
    }
}


async function restApiFolderContents(param) {
    const showFolderContents = true;
    await remoteFolderContents(param, showFolderContents);
}


async function remoteFolderContents(param) {
    const restApi = new RestApi();
    try {
        await restApi.getEndPointConfig(param); // based on the passed Uri (if defined)
                                                // otherwise based on the path of the local file open in the active editor
                                                // also sets remoteFile
        if (!restApi.config) {
            return;
        }
        await restApi.getRemoteFolderContents(param);
        let folderContents = restApi.remoteFolderContents;
        let folderContentsText;
        if (typeof folderContents === 'object') {
            folderContentsText = beautify(JSON.stringify(folderContents), {
                indent_size: 2,
                space_in_empty_paren: true,
            });
        }
        let folderPath;
        if (param instanceof vscode.Uri) {
            folderPath = param.fsPath;
        } else if (typeof param === 'string') {
            folderPath = param;
        } else {
            folderPath = null;
        }
        console.log('restApi.filePath:', restApi.filePath);
        console.log('restApi.remoteFile:', restApi.remoteFile);
        const remoteFolderPath = new URL(restApi.config.remoteEndpoint.url).pathname
        .replace(/\/lsaf\/webdav\/(work|repo)\//, '/')
        .replace(/\/$/, '') + restApi.remoteFile;
        console.log("remoteFolderPath:\n", remoteFolderPath);
        console.log("Folder contents:\n", folderContentsText);
        
        // vscode.window.showInformationMessage(folderContents);
        const isLocal = false;
        if (Array.isArray(folderContents.items)) {
            showFolderView(
                remoteFolderPath, 
                folderContents.items.map(file => { 
                    return ({
                                ...file, 
                                name: file.name.toString() + (file.schemaType === 'folder' ? '/' : ''),
                                path: (file.path != null ? file.path : path.join(remoteFolderPath, file.name)),
                                mtime: file.mtime ?? file.lastModified,
                                size: file.size ?? 0,
                                md5sum: (file.digest || '').toLowerCase()
                            });
                }),
                isLocal,
                restApi.config
            );
        } else {
            showMultiLineText(folderContentsText, "Remote Folder Contents", `${restApi.config.label} folder contents: ${restApi.remoteFile}`);
        }
    } catch (err) {
        console.log(err);
    }
}


async function localFolderContents(param) {
    const restApi = new RestApi();
    let folderPath;
    if (! param instanceof vscode.Uri) {
        if (! typeof param === 'string') {
            console.log('Cannot get local folder contents of ${param}')
            return;
        } else {
            folderPath = param;
        }
    } else {
        const fileStat = await restApi.getFileStat(param);
        if (fileStat.type === vscode.FileType.File) {
            return vscode.window.showWarningMessage(`Local Folder Contents: ${param.fsPath} is a file!`);
        }else if (fileStat.type === vscode.FileType.Directory) {
            restApi.localFile = param.fsPath;
            folderPath = param.fsPath;
        } else {
            return vscode.window.showWarningMessage(`Upload File: ${param} is neither a file nor a folder!`);
        }
    }
    let folderContents, folderContentsText;
    try {
        const files = await fs.promises.readdir(folderPath); // Asynchronous read of directory contents

        folderContents = await Promise.all(
            files.map(async file => {
                const filePath = path.join(folderPath, file);
                const stats = await fs.promises.stat(filePath); // Asynchronous stat call
                const isBinary = isBinaryFile(filePath);

                let md5sum = '';
                if (stats.isFile()) {
                    
                    // languageEncoding(filePath).then((fileInfo) => console.log(filePath+':', JSON.stringify(fileInfo)));

                    // Calculate MD5 using the previously defined calculateMD5WithLF() function
                    if (isBinary) {
                        md5sum = await fileMD5sum(filePath);
                    } else {
                        // md5sum = await fileMD5sumConvertCRLF(filePath);
                        md5sum = fileMD5sumStripBom(filePath);
                    }
                } else {
                    md5sum = '';
                }

                return {
                    name: file,
                    size: stats.size,
                    mtime: stats.mtime.toISOString(),
                    md5sum: md5sum, // Add MD5 checksum to the returned object
                };
            })
        );
        if (typeof folderContents === 'object') {
            folderContentsText = beautify(JSON.stringify(folderContents), {
                indent_size: 2,
                space_in_empty_paren: true,
            });
            restApi.folderContents = folderContents;
        } else {
            folderContentsText = folderContents;
        }
        console.log("Folder contents:\n", folderContentsText);
        // vscode.window.showInformationMessage(folderContents);
        if (Array.isArray(folderContents)) {
            const updatedFolderContents = await Promise.all(folderContents.map(async file => { 
                const filePath = path.join(folderPath, file.name);
                console.log('filePath:', filePath);
                const fileStat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
                const newFile = {
                    ...file, 
                    name: file.name.toString() + (fileStat.type === vscode.FileType.Directory ? '/' : ''),
                    path: file.path != null ? file.path : path.join(folderPath, file.name),
                    mtime: file.mtime ?? file.lastModified,
                    size: file.size ?? 0
                };
                return newFile;
            }));
            const isLocal = true;
            showFolderView(
                    folderPath, 
                    updatedFolderContents,
                    isLocal,
                    restApi.config
                );
        } else {
            showMultiLineText(folderContentsText, "Local Folder Contents", `Local folder contents: ${folderPath}`);
        }
    } catch (err) {
        console.log(err);
    }
}



async function getEndpointConfigForCurrentPath(absoluteWorkingDir, onlyRepo = false) {
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
        if (onlyRepo) {
            restApiConfig = restApiConfig.filter(conf => {
                return (/\/repo\b/.test(conf?.label ||'') || /\/repo\b/.test(conf?.["/"] || ''));
            });
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Error parsing config File: ${configFile}, ${error.message}`)
    }
    
    let allEndpointsConfig;
    let config = {};
    if (Array.isArray(restApiConfig)) {
        const configChoices = restApiConfig.map((config, index) =>
            config.label || "Config " + (index + 1).toString()
        );
        const selectedConfig = await vscode.window.showQuickPick(configChoices, {
            placeHolder: "Choose a remote location",
            canPickMany: false,
        });
        allEndpointsConfig =
            restApiConfig[
            configChoices.findIndex((config) => config === selectedConfig)
            ];
        config.label = selectedConfig;
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

        config = {
            ...config,
            localRootPath: currentSearchPath,
            remoteEndpoint: endpointConfig,
        }
        return config;
    }
}

async function getCredentials(key) {
    let credentials;
    try {
        credentials = await credStore.GetCredential(key);
        if (credentials?._username && credentials?._password) {
            return credentials;
        } else {
            credentials = await askForCredentials(key);
            return credentials;
        }
    } catch (error) {
        console.error(error.message)
    }         
}

async function askForCredentials(key) {
    try {
        const username = await vscode.window.showInputBox({ prompt: "Username for " + key + " ?" });
        if (!username) {
            return(EMPTY_CREDENTIALS);
        }
    
        const password = await vscode.window.showInputBox({ prompt: "Password ?", password: true });
        if (!password) {
            return(EMPTY_CREDENTIALS);
        }
    
        return({
                    newCredentials: true,
                    _username: username,
                    _password: password,
                });
    } catch (error) {
        console.error(error.message);
    }
}

async function storeCredentials(key, username, password) {
    await credStore.SetCredential(key, username, password);
}
