const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { getMultiLineText: getMultiLineInput } = require('./multiLineText.js');
const { fileMD5sum, fileMD5sumStripBom } = require('./md5sum.js');
const isBinaryFile = require("isbinaryfile").isBinaryFile;
const { openFile } = require("./openFile");

const { URL } = require("url");
const beautify = require("js-beautify");
const FormData = require('form-data');
const { Readable } = require('stream');
const { streamToPromise } = require('./stream.js');
const { pipeline } = require('stream/promises'); // Node.js v15+ only
const { showMultiLineText } = require('./multiLineText.js');
const { showTableView } = require('./json-table-view.js');
const { read_sas, read_xpt } = require('./read_sas.js');
const axios = require('axios');

// require('events').EventEmitter.defaultMaxListeners = 20;  // temporary fix

const tmp = require("tmp");
tmp.setGracefulCleanup();   // remove all controlled temporary objects on process exit

const { getEndpointConfigForCurrentPath } = require('./endpointConfig.js');

const { askForCredentials, getCredentials, storeCredentials, authTokens, setAuthTokens } = require('./auth.js')


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
      this.zippedFolderContents = null;
   }

   get apiUrl() {
      return this.host ? `https://${this.host}/lsaf/api` : null;
   }

   async getEndPointConfig(param, onlyRepo = false) {
      if (typeof param === 'string') {
         param = vscode.Uri.file(param);
      } else if (param == null && vscode.window.activeTextEditor) {
         param = vscode.window.activeTextEditor.document.uri;
      }
      if (param instanceof vscode.Uri) {
         this.localFile = param.fsPath;
         this.localFileStat = null;
         while(this.localFileStat == null && vscode.Uri.joinPath(param, '..') !== param) {
            this.localFileStat = this.getFileStat(param);
            if (this.localFileStat == null) {
               param = vscode.Uri.joinPath(param, '..'); // get parent uri
            }
         }
      } 
      else {
         this.localFile = null;
         this.localFileStat = null;
         this.config = null;
         vscode.window.showErrorMessage(`(getEndPointConfig): Cannot identify local file from parameter ${param} nor from active text editor...`);
         return;
      }

      const workingDir = path.dirname(this.localFile);
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

      console.log("config:\n", beautify(JSON.stringify(config)));
      this.config = config;

      const workingWSFolder = vscode.workspace.getWorkspaceFolder(
         (param instanceof vscode.Uri) ?
            param :
            (typeof param === 'string') ?
            vscode.Uri.file(param) :
            vscode.window.activeTextEditor.document.uri);
      console.log("workingWSFolder:\n", beautify(JSON.stringify(workingWSFolder)));

      const remoteFile = this.localFile
         .replace(/\\/g, "/")
         .replace(
            path.posix.join(workingWSFolder.uri.fsPath.replace(/\\/g, "/"), config.localRootPath.replace(/\\/g, "/")),
            ""
         );
      // const remoteFile = this.localFile
      //    .replace(/\\/g, "/")
      //    .replace(
      //       new URL(this.config.remoteEndpoint.url).pathname + config.localRootPath,
      //       ""
      //    );
      console.log('remoteFile:', remoteFile);
      this.remoteFile = remoteFile;
      console.log('this.remoteFile:', this.remoteFile);

      const url = new URL(this.config.remoteEndpoint.url);
      this.host = url.hostname;
   }


   async encryptPassword(password) {
      const url = `${this.apiUrl}/encrypt`;
      console.log('password:', password);
      if (password === '') {
         console.error('encryptPassword(): no password provided, aborting.');
         this.encryptedPassword = null;
         return;
      }
      if (password.toString().slice(0, 5) === '{P21}') {
         this.encryptedPassword = password; // already encrypted
         return;
      }
      try {
         const response = await axios.get(url, {
            headers: {
               'Authorization': 'Basic ' + Buffer.from(this.username + ':' + password).toString('base64')
            },
            maxRedirects: 5 // Optional, axios follows redirects by default
         });

         if (response.status === 401) {
            this.encryptedPassword = { status: response.status, statusText: response.statusText, data: response.data, headers: response.headers };
         } else if (response.status !== 200) {
            throw new Error(`HTTP error! Status: ${response.status} ${response.statusText}`);
         }

         const result = response.data;
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
         try {
            const response = await axios.get(url, {
               headers: { "X-Auth-Token": authTokens[this.host] },
               maxRedirects: 5 // Optional, axios follows redirects by default
            });
            if (response.status !== 401) {
               console.log(response.status, response.statusText);
               if (response.status === 200) {
                  this.authToken = authTokens[this.host];
                  console.log(`Reusing stored Auth Token for host ${this.host}: ${this.authToken}`);
                  return;
               } else {
                  console.log(`Unexpected HTTP response status ${response.status} ${response.statusText}:`);
                  response.headers.forEach((value, name) => {
                     console.log(`${name}: ${value}`);
                  });
                  if (response.header['content-type'].match(/\bjson\b/)) {
                     const data = response.data;
                     console.log(beautify(JSON.stringify(data), {
                        indent_size: 2,
                        space_in_empty_paren: true,
                     }));
                  }
               }
            } else {
               delete authTokens[this.host];
               return this.logon();
            }
         } catch (err) {
            console.log(err);
         }
      }
      if (!this.encryptedPassword || typeof this.encryptedPassword !== 'string') {
         console.log(this.encryptedPassword);
         const creds = await getCredentials(this.host);
         const { _username: username, _password: password } = creds;
         if (typeof username === 'string' 
            && typeof password === 'string'
            && username.trim().length > 1
            && password.trim().length > 6
         ) {
         this.username = username;
         await this.encryptPassword(password);
         } else {
            const creds = await askForCredentials(this.host);
            const { _username: username, _password: password } = creds;
            if (typeof username === 'string' 
               && typeof password === 'string'
               && username.trim().length > 1
               && password.trim().length > 6
            ) {
               this.username = username;
               await this.encryptPassword(password);
            } else {
               this.encryptedPassword = null;
               return this.logon();
            }
         }
         if (typeof this.encryptedPassword === 'object') {
            throw new Error('No encrypted password, aborting logon.');
         }
         if (typeof this.encryptedPassword !== 'string') {
            throw new Error('No encrypted password, aborting logon.');
         }
      }
      const url = `https://${this.host}/lsaf/api/logon`;
      try {
         let response = await axios.post(url, {}, {
            headers: {
               "Authorization": "Basic " + Buffer.from(this.username + ":" + this.encryptedPassword).toString('base64')
            },
            maxRedirects: 0 // Handle redirection manually
         });
         // Check if there's a redirect (3xx status code)
         const maxRedirects = 20;
         let redirects = 1;
         while (response.status >= 300 && response.status < 400 && redirects < maxRedirects) {
            const redirectUrl = response.headers['location'];
            if (redirectUrl) {
               console.log(`Response status: ${response.status} ${response.statusText}, Redirecting (${redirects}) to: ${redirectUrl}`);
               vscode.window.showInformationMessage(`Redirecting (${redirects}) to: ${redirectUrl}`);
               // Perform the request again at the new location
               response = await axios.post(redirectUrl, {}, {
                  headers: {
                     "Authorization": "Basic " + Buffer.from(this.username + ":" + this.encryptedPassword).toString('base64')
                  },
                  maxRedirects: 0 // Handle redirection manually
               });
            }
            redirects += 1;
         }
         if (response.status === 200) {
            const authToken = response.headers["x-auth-token"];
            console.log("authToken", authToken, "response", response);
            this.authToken = authToken;
            console.log(`Storing Auth Token for host ${this.host}: ${this.authToken}`);
            // authTokens[this.host] = authToken;
            setAuthTokens(this.host, authToken)
            // Store the password only if there is no HTTP error and the credentials contain at least a user name
            await storeCredentials(
               this.host, // credentialsKey
               this.username,
               this.encryptedPassword
            );
         } else {
            console.log(`${response.status} ${response.statusText}`);
            const text = response.data;
            console.log('response text:', text);
            throw new Error(`HTTP error! Status: ${response.status} ${response.statusText}`);
         }
      } catch (error) {
         if (error?.response?.status === 401) {
            if (`${error.response?.data?.message}`.match(/credentials.*incorrect/i)) {
               try {
                  this.encryptedPassword = null;
                  const credentials = await askForCredentials(this.host);
                  if (typeof credentials._username === 'string' 
                     && typeof credentials._password === 'string'
                     && credentials._username.trim().length > 1
                     && credentials._password.trim().length > 6
                  ) {
                     this.username = credentials._username;
                     await this.encryptPassword(credentials._password);
                     if (typeof this.encryptedPassword === 'string') {
                        return this.logon();
                     }
                  } else {
                     return this.logon();
                  }
               } catch (error) {
                  console.log(error);
               }
            }
         }
         console.error('Error fetching x-auth-token:', error)
      }
   }



   async getRemoteFolderContentsAsZip(param) {
      if (typeof param === 'string') {
         param = vscode.Uri.file(param);
      }
      if (param instanceof vscode.Uri) {
         this.localFile = param.fsPath;
      }
      await this.logon();  // check that authToken is still valid
      const apiUrl = `https://${this.host}/lsaf/api`;
      const urlPath = new URL(this.config.remoteEndpoint.url).pathname
         .replace(/\/lsaf\/webdav\/work\//, '/workspace/folders/')
         .replace(/\/lsaf\/webdav\/repo\//, '/repository/containers/')
         .replace(/\/$/, '')
         ;
      console.log('urlPath:', urlPath)
      const filePath = this.remoteFile;
      let response, contentType, contentLength, transferEncoding, result, data;
         const apiRequest = `${urlPath}${filePath}?component=contents`;
         const requestOptions = {
            headers: { "X-Auth-Token": this.authToken },
            maxRedirects: 5, // Optional, axios follows redirects by default
            responseType: 'arraybuffer'
         };
         try {
            const fullUrl = encodeURI(apiUrl + apiRequest)
         response = await axios.get(fullUrl, requestOptions);
            contentType = response.headers['content-type'];
            contentLength = response.headers['content-length'];
            transferEncoding = response.headers['transfer-encoding'];
            console.log('contentType:', contentType, 'contentLength:', contentLength, 'transferEncoding:', transferEncoding);
         if (`${transferEncoding}`.toLowerCase() === 'chunked') {
               requestOptions.responseType = 'stream';
            response = await axios.get(fullUrl, requestOptions);
            contentType = response.headers['content-type'];
            contentLength = response.headers['content-length'];
         }
            transferEncoding = response.headers['transfer-encoding'];
            if (response.status != 200) {
               if (contentType.match(/\bjson\b/)) {
                  data = response.data;
                  if (data.message) {
                     result = data.details || data.message;
                     if (data.remediation && data.remediation !== "No remediation message is available.") {
                        result = `${result.trim()}, remediation: ${data.remediation}`;
                     }
                  } else {
                     result = beautify(JSON.stringify(data), {
                        indent_size: 2,
                        space_in_empty_paren: true,
                     });
                  }
               } else {
                  result = response.data;
                  result = `${response.status}, ${response.statusText}: Result: ${result}`;
               }
               throw new Error(`HTTP error! ${result}`);
            }
            if (transferEncoding?.toLowerCase() === 'chunked' || contentLength < 500_000_000) {
               // const arrayBuffer = await response.arrayBuffer();
               try {
                  const tempFile = tmp.fileSync({ postfix: '.zip', discardDescriptor: true });
                  // await fs.promises.writeFile(tempFile.name, Buffer.from(arrayBuffer));
                  // Create a writable stream to save the file
                  const fileStream = fs.createWriteStream(tempFile.name);
                  if (pipeline){
                     await pipeline(response.data, fileStream); // Automatically handles errors (Node.js v15+)
                  } else {
                     // Pipe the response stream directly to the file
                     response.data.pipe(fileStream);
                     // Await the 'finish' and 'error' events using a helper function
                     await streamToPromise(fileStream);
                  }
                  return tempFile.name;
               } catch (error) {
                  throw new Error(`Error downloading to Temporary Zip file! ${error.message}`);
               }
            } else {
               throw new Error(`File with content-type: ${contentType} NOT downloaded given unexpected content-length: ${contentLength}!`)
            }
         } catch (error) {
            console.error("Error fetching Remote Folder Contents as Zip:", error);
            vscode.window.showErrorMessage("Error fetching Remote Folder Contents as Zip:", error.message);
         }

   };


   async getRemoteFileContents(param, pick_multiple = true) {
      if (typeof param === 'string') {
         param = vscode.Uri.file(param);
      }
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
      // let compareVersion = null;
      if (/\/repository\/files\//.test(urlPath)) {
         await this.getRemoteFileVersions();
         let versions = this.fileVersions;
         const MAX_ITEMS = 30;
         if (Array.isArray(versions.items) && versions.items.filter(i => i.version).length > 0) {
            const allVersions = versions.items.slice(0, MAX_ITEMS).map(item => {
               return ({
                  label: `${item.version || ''}`,
                  description: `size: ${item.size}, created: ${item.created} by ${item.createdBy}`,
                  detail: item.comment
               })
            });
            selectedVersions = await vscode.window.showQuickPick(allVersions,
               { canPickMany: pick_multiple, title: 'Select a version', placeHolder: allVersions[0].label, ignoreFocusOut: true, });
            if (pick_multiple) {
               selectedVersion = selectedVersions[0];
               //compareVersion = selectedVersions[1];
               //console.log('compareVersion:', compareVersion);
            } else {
               selectedVersions = [selectedVersions];
               selectedVersion = selectedVersions[0];
            }
         } else {
            console.log("Not versioned: versions = ", versions);
            selectedVersions = [''];
            selectedVersion = selectedVersions[0];
         }
      } else {
         selectedVersions = [''];
         selectedVersion = selectedVersions[0];
      }
      console.log('selectedVersion:\n', selectedVersion);

      this.fileContents = [];
      this.fileVersions = [];
      this.fileContentLength = [];
      this.fileContentType = [];

      for (let i = 0; i < selectedVersions.length; i++) {

         const apiRequest = `${urlPath}${filePath}?component=contents` + (selectedVersions[i]?.label ? `&version=${selectedVersions[i].label}` : '');
         const requestOptions = {
            headers: { "X-Auth-Token": this.authToken },
            maxRedirects: 5 // Optional, axios follows redirects by default
         };
         try {
            // const response = await fetch(apiUrl + apiRequest, requestOptions);
            const fullUrl = encodeURI(apiUrl + apiRequest);            
            let response = null;
            response = await axios.head(fullUrl, requestOptions);
            const contentType = response.headers['content-type'];
            const contentLength = response.headers['content-length'];
            console.log('contentType:', contentType, 'contentLength:', contentLength);
            let result = null;
            let data = null;
            let responseType = null;
            if (contentType.match(/\bjson\b/)) {
               responseType = 'json';
            }
            else if (contentLength && contentLength < 100_000_000) {
               if (
                  /^(text\/|application\/(sas|(ld\+)?json|xml|javascript|xhtml\+xml|sql))/.test(contentType) 
                  || /^(application\/x-(sas|httpd-php|perl|python|markdown|quarto|latex))(;|$)/.test(contentType)
               ) {
                  responseType = 'text';
               } else {
                  responseType = 'arraybuffer';
               }
            }
            if (responseType) {
               response = await axios.get(fullUrl, {...requestOptions, responseType});
            }
            if (response.status != 200) {
               if (contentType.match(/\bjson\b/)) {
                  data = response.data;
                  if (data.message) {
                     result = data.details || data.message;
                     if (data.remediation && data.remediation !== "No remediation message is available.") {
                        result = `${result.trim()}, remediation: ${data.remediation}`;
                     }
                  } else {
                     result = beautify(JSON.stringify(data), {
                        indent_size: 2,
                        space_in_empty_paren: true,
                     });
                  }
               } else {
                  result = response.data;
                  result = `${response.status}, ${response.statusText}: Result: ${result}`;
               }
               throw new Error(`HTTP error! ${result}`);
            }
            if (contentLength && contentLength < 100_000_000) {
               if (
                  /^(text\/|application\/(sas|(ld\+)?json|xml|javascript|xhtml\+xml|sql))/.test(contentType) 
                  || /^(application\/x-(sas|httpd-php|perl|python|markdown|quarto|latex))(;|$)/.test(contentType)
               ) {
                  const responseText = response.data;
                  this.fileContents.push(responseText);
               } else  {
                  // throw new Error(`File with content-length: ${contentLength} NOT downloaded given unexpected content-type: ${contentType}!`)
                  const arrayBuffer = response.data;
                  this.fileContents.push(Buffer.from(arrayBuffer));
               }
               this.fileVersions.push(selectedVersions[i]?.label || '');
               this.fileContentLength.push(contentLength);
               this.fileContentType.push(contentType);
            } else {
               throw new Error(`File with content-type: ${contentType} NOT downloaded given unexpected content-length: ${contentLength}!`)
            }
         } catch (error) {
            console.error("Error fetching Remote File Contents:", error);
            vscode.window.showErrorMessage("Error fetching Remote File Contents:", error.message);
            this.fileContents.push(error.message);
            this.fileVersions.push(null);
         }

      }
   };

   async getFileStat(param) {
      let fileStat;
      if (typeof param === 'string') {
         param = vscode.Uri.file(param);
      }
      if (param instanceof vscode.Uri) {
         // param is a Uri
         try {
            fileStat = await vscode.workspace.fs.stat(param);           
         } catch (error) {
            fileStat = null;
         }
      } 
      return fileStat;
   }

   async getRemoteFileProperties(param) {
      if (typeof param === 'string') {
         param = vscode.Uri.file(param);
      }
      if (param instanceof vscode.Uri) {
         this.localFile = param.fsPath;
      } else {
         this.localFile = vscode.window.activeTextEditor.document.uri.fsPath;
      }
      if (!this.localFile) {
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
         } else {
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
         headers: { "X-Auth-Token": this.authToken },
         maxRedirects: 5 // Optional, axios follows redirects by default
     };
      try {
         // const response = await fetch(apiUrl + apiRequest, requestOptions);
         const fullUrl = encodeURI(apiUrl + apiRequest)
         const response = await axios.get(fullUrl, requestOptions);
         const contentType = response.headers['content-type'];
         console.log('contentType:', contentType);
         let result = null;
         let data = null;
         if (contentType.match(/\bjson\b/)) {
            data = response.data;
            if (data.message) {
               result = data.details || data.message;
               if (data.remediation && data.remediation !== "No remediation message is available.") {
                  result = `${result.trim()}, remediation: ${data.remediation}`;
               }
            } else {
               result = beautify(JSON.stringify(data), {
                  indent_size: 2,
                  space_in_empty_paren: true,
               });
            }
         } else {
            result = response.data;
            result = `${response.status}, ${response.statusText}: Result: ${result}`;
         }
         if (!response.status === 200) {
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


   async getLocalFolderContents(param) {
      let folderPath;
      if (typeof param === 'string') {
         param = vscode.Uri.file(param);
      }
      if (param instanceof vscode.Uri) {
         this.localFile = param.fsPath;
      } else {
         console.error('(getLocalFolderContents) unexpected parameter:', param);
         vscode.window.showErrorMessage('(getLocalFolderContents) unexpected parameter:', param);
         return;
      }
      if (!this.localFile) {
         console.error('Cannot get Local Folder Contents of a non-specified path:', this.localFile);
         vscode.window.showErrorMessage('Cannot get Local Folder Contents of a non-specified path:', this.localFile);
         return;
      }
      const fileStat = await this.getFileStat(this.localFile);
      console.log('Local File:', this.localFile, 'fileStat:', fileStat);
      // let itemType;
      if (fileStat.type === vscode.FileType.File) {
         return vscode.window.showWarningMessage(`Get Local Folder Contents: ${this.localFile} is not a folder!`);
      } else if (fileStat.type === vscode.FileType.Directory) {
         folderPath = this.localFile;
      } else {
         return vscode.window.showWarningMessage(`Get Local Folder Contents: ${this.localFile} is neither a file nor a folder!`);
      }

      let folderContents, folderContentsText;
      try {
         const files = await fs.promises.readdir(folderPath); // Asynchronous read of directory contents

         folderContents = await Promise.all(
            files.map(async file => {
               const filePath = path.join(folderPath, file);
               const stats = await fs.promises.stat(filePath); // Asynchronous stat call
               let isBinary = null;
               let md5sum = '';

               if (stats.isFile()) {
                  // Calculate MD5 using the previously defined calculateMD5WithLF() function
                  isBinary = isBinaryFile(filePath);
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
            this.localFolderContents = folderContents;
         } else {
            folderContentsText = folderContents;
            this.localFolderContents = folderContents;
         }
         console.log("Folder contents:\n", folderContentsText);
      } catch (error) {
         console.error("Error fetching Local Folder Contents:", error);
         vscode.window.showErrorMessage("Error fetching Local Folder Contents:", error.message);
         this.localFolderContents = null;
      }
   };

   async getRemoteFolderContents(param) {
      if (typeof param === 'string') {
         param = vscode.Uri.file(param);
      }
      if (param instanceof vscode.Uri) {
         this.localFile = param.fsPath;
      } else {
         this.localFile = vscode.window.activeTextEditor.document.uri.fsPath;
      }
      if (!this.localFile) {
         console.error('Cannot get Remote Folder Contents of a non-specified path:', this.localFile);
         vscode.window.showErrorMessage('Cannot get Remote Folder Contents of a non-specified path:', this.localFile);
         return;
      }
      await this.logon();
      const apiUrl = `https://${this.host}/lsaf/api`;
      let fileStat;
      let itemType;
      try {
         fileStat = await this.getFileStat(this.localFile);
         if (fileStat.type === vscode.FileType.File) {
            return vscode.window.showWarningMessage(`Get Remote Folder Contents: ${this.localFile} is not a folder!`);
         } else if (fileStat.type === vscode.FileType.Directory) {
            if (this.config.remoteEndpoint.url.match(/\/lsaf\/webdav\/repo\//)) {
               itemType = 'container';
            } else {
               itemType = 'folder';
            }
         } else if (fileStat.error) {
            throw fileStat.error;
         } else {
            return vscode.window.showWarningMessage(`Get Remote Folder Contents: ${this.localFile} is neither a file nor a folder!`);
         }
      } catch (error) {
         if (error.code === 'FileNotFound') {
            // Ignoring the fact that the local path does not exist - this does not prevent to retrieve remote folder contents
         } else {
            console.log(error);
         }
         fileStat = {type: vscode.FileType.Directory};  // assuming remote path is a folder/container (as expected)
         if (this.config.remoteEndpoint.url.match(/\/lsaf\/webdav\/repo\//)) {
            itemType = 'container';
         } else {
            itemType = 'folder';
         }
      }
      console.log('Local File:', this.localFile, 'fileStat:', fileStat);
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
         headers: { "X-Auth-Token": this.authToken },
        maxRedirects: 5 // Optional, axios follows redirects by default
      };
      try {
         // const response = await fetch(apiUrl + apiRequest, requestOptions);
         const fullUrl = encodeURI(apiUrl + apiRequest)
         const response = await axios.get(fullUrl, requestOptions);
         const contentType = response.headers['content-type'];
         console.log('contentType:', contentType);
         let result = null;
         let data = null;
         if (contentType.match(/\bjson\b/)) {
            data = response.data;
            if (data.message) {
               result = data.details || data.message;
               if (data.remediation && data.remediation !== "No remediation message is available.") {
                  result = `${result.trim()}, remediation: ${data.remediation}`;
               }
            } else {
               result = beautify(JSON.stringify(data), {
                  indent_size: 2,
                  space_in_empty_paren: true,
               });
            }
         } else {
            result = response.data;
            result = `${response.status}, ${response.statusText}: Result: ${result}`;
         }
         if (!response.status === 200) {
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


   async getRemoteFileVersions(param) {
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
         headers: { "X-Auth-Token": this.authToken },
        maxRedirects: 5 // Optional, axios follows redirects by default
      };
      try {
         // const response = await fetch(apiUrl + apiRequest, requestOptions);
         const fullUrl = encodeURI(apiUrl + apiRequest)
         const response = await axios.get(fullUrl, requestOptions);
         const contentType = response.headers['content-type'];
         console.log('contentType:', contentType);
         let result = null;
         let data = null;
         if (contentType.match(/\bjson\b/)) {
            data = response.data;
            if (data.message) {
               result = data.details || data.message;
               if (data.remediation && data.remediation !== "No remediation message is available.") {
                  result = `${result.trim()}, remediation: ${data.remediation}`;
               }
            } else {
               result = beautify(JSON.stringify(data), {
                  indent_size: 2,
                  space_in_empty_paren: true,
               });
            }
         } else {
            result = response.data;
            result = `${response.status}, ${response.statusText}: Result: ${result}`;
         }
         if (!response.status === 200) {
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

   async saveFileContentsAs(outFile, overwrite = null) {
      if (! Array.isArray(this.fileContents)) {
         this.fileContents = [this.fileContents];
      }
      if (!this.fileContents || this.fileContents?.length === 0) {
         await this.getRemoteFileContents()
         if (!this.fileContents) {
            throw new Error("Failed to get remote file contents.");
         }
      }
      if (typeof outFile === 'boolean' && outFile) {
         let defaultFilename = this.remoteFile ? path.basename(this.remoteFile) : '';
         // Prompt user to select a folder
         const folderUri = await vscode.window.showOpenDialog({
               canSelectFolders: true,
               canSelectFiles: false,
               canSelectMany: false, 
               title: `Select download folder ${this.remoteFile ? 'for '+ this.remoteFile : ''}`
         });

         if (!folderUri || folderUri.length === 0) {
               vscode.window.showErrorMessage('No download folder selected');
               return;
         }

         // Prompt user to enter a filename with a default value
         const filename = await vscode.window.showInputBox({
               prompt: 'Enter the filename',
               value: defaultFilename
         });

         if (!filename) {
               vscode.window.showErrorMessage('No filename provided');
               return;
         }

         outFile = path.join(folderUri[0].fsPath, filename);

      } else if (! outFile) {
         outFile = this.localFile;
      }
      try {
         if (outFile && this.fileContents[0] != null) {
            let outFileExists = false;
            try {
               await fs.promises.stat(outFile);
               outFileExists = true;
               console.log(`outFile exists: ${outFile}`);
            } catch (error) {
               console.log(`outFile does not exist: ${outFile}`);
            }
            if (outFileExists) {
               if (overwrite == null) {
                  const choice = await vscode.window.showWarningMessage(
                     `File exists: ${outFile}`, 
                     { modal: true},
                     "Overwrite"
                  );
                  overwrite = (choice === "Overwrite");
               }
               if (! overwrite) {
                  console.warn(`Existing file NOT overwritten: ${outFile}`);
                  vscode.window.showWarningMessage(`Existing file NOT overwritten: ${outFile}`);
                  return;
               } 
            }
            await fs.promises.writeFile(outFile, this.fileContents[0]);
            console.log(`Saved as ${outFile}`);
            vscode.window.showInformationMessage(`Saved as ${outFile}.`)
         }
      } catch (err) {
         console.error(`Error: ${err.message}`);
         vscode.window.showErrorMessage(`Error: ${err.message}`)
      }
   }

   // viewFileContents
   async viewFileContents(){
      // Write the remote file to a local temporary file
      // const extension = path.extname(this.remoteFile || this.localFile||'.');
      try {
         if (!this.fileContents || this.fileContents?.length === 0) {
            await this.getRemoteFileContents()
            if (!this.fileContents) {
               throw new Error("Failed to get remote file contents.");
            }
         }
         
         if (!Array.isArray(this.fileContents)) {
            this.fileContents = [this.fileContents];
         }

         /*
         // Simple synchronous temporary file creation, the file will be closed and unlinked on process exit.
         const tempFile = tmp.fileSync({ postfix: extension });
         console.log("tempFile:", tempFile);

         await fs.promises.writeFile(tempFile.name, this.fileContents[0]);
         console.log(`Downloaded as ${tempFile.name}`);
         // Set the file to read-only (cross-platform)
         try {
            await fs.promises.chmod(tempFile.name, 0o444);
            console.log(`File is now read-only: ${tempFile.name}`);
         } catch (err) {
            console.error(`Failed to set file as read-only: ${err}`);
         }
         */

         // const fileName = this.remoteFile.slice(this.remoteFile.lastIndexOf("/") + 1);
         const fileName = path.basename(this.remoteFile);
         const ext = path.extname(fileName);
         const versionLabel = this.fileVersions[0] ? ` v${this.fileVersions[0]}` : '';
         const confLabel = `${(this.config.label || this.host.split(".")[0])}`.replace('/','-');

         if (Buffer.isBuffer(this.fileContents[0]) || /^application\/x-sas-xport(;|$)/.test(this.fileContentType)) {
            const tempFile = tmp.fileSync({ postfix: ext, discardDescriptor: true });
            await fs.promises.writeFile(tempFile.name, this.fileContents[0]);
            if (/^application\/x-sas-data(;|$)/.test(this.fileContentType)) {
               const data = await read_sas(tempFile.name);
               console.log(beautify(JSON.stringify(data)));
               showTableView(`Imported SAS data from ${confLabel} remote file: ${this.remoteFile}`, data);
               showMultiLineText(beautify(JSON.stringify(data)), "Imported SAS data", `from ${confLabel} remote file: ${this.remoteFile}`);
            }
            if (/^application\/x-sas-xport(;|$)/.test(this.fileContentType)) {
               const data = await read_xpt(tempFile.name);
               console.log(beautify(JSON.stringify(data)));
               showTableView(`Imported SAS Xpt from ${confLabel} remote file: ${this.remoteFile}`, data);
               showMultiLineText(beautify(JSON.stringify(data)), "Imported SAS Xpt", `from ${confLabel} remote file: ${this.remoteFile}`);
            }
            openFile(vscode.Uri.file(tempFile.name));
         } else {
            // Create a temporary file URI with a specific extension
            const tempFileUri = vscode.Uri.parse('untitled:' + `(${confLabel}${versionLabel}) ${fileName}`);

            // Open the temporary file in the editor
            const document = await vscode.workspace.openTextDocument(tempFileUri);
            const editor = await vscode.window.showTextDocument(document, { preview: false });

            // Add content to the document
            await editor.edit(editBuilder => {
               editBuilder.insert(new vscode.Position(0, 0), this.fileContents[0]);
            });
            
         }


      } catch(err) {
         console.error(`Error: ${err.message}`);
         vscode.window.showErrorMessage(`Error: ${err.message}`)
      }
   }

   async compareFileContents() {
      // Write the remote file to a local temporary file
      const extension = this.localFile.slice(this.localFile.lastIndexOf("."));
      this.tempFiles = [];
      try {
         if (!this.fileContents || this.fileContents?.length === 0) {
            await this.getRemoteFileContents()
            if (!this.fileContents) {
               throw new Error("Failed to get remote file contents.");
            }
         }

         if (!Array.isArray(this.fileContents)) {
            this.fileContents = [this.fileContents];
         }

         for (let i = 0; i < this.fileContents.length; i++) {

            // Simple synchronous temporary file creation, the file will be closed and unlinked on process exit.
            const tempFile = tmp.fileSync({ postfix: extension });
            console.log("tempFile:", tempFile);
            this.tempFiles.push(tempFile);

            await fs.promises.writeFile(tempFile.name, this.fileContents[i]);
            console.log(`Downloaded as ${tempFile.name}`);
            // Set the file to read-only (cross-platform)
            try {
               await fs.promises.chmod(tempFile.name, 0o444);
               console.log(`File is now read-only: ${tempFile.name}`);
            } catch (err) {
               console.error(`Failed to set file as read-only: ${err}`);
            }

            // Compare after successfully writing the file
            try {
               const fileName = this.remoteFile.slice(this.remoteFile.lastIndexOf("/") + 1);
               const baseVersionLabel = i === 0 ? ' (local)' : this.fileVersions[i - 1] ? ` (v${this.fileVersions[i - 1]})` : '';
               const compVersionLabel = this.fileVersions[i] ? ` (v${this.fileVersions[i]})` : '';
               if (i === 0) {
                  vscode.window.showInformationMessage(
                     `Comparing: ${fileName}${baseVersionLabel} with ${this.config.remoteLabel || this.config.label || this.host.split(".")[0]} remote file ${compVersionLabel}`
                  );
               } else {
                  vscode.window.showInformationMessage(
                     `Comparing: ${this.config.label || this.host.split(".")[0]} remote file ${fileName}${baseVersionLabel} with ${compVersionLabel}`
                  );
               }
               await vscode.commands.executeCommand(
                  "vscode.diff",
                  vscode.Uri.file(path.normalize(this.tempFiles[i].name)),
                  vscode.Uri.file(i === 0 ? this.localFile : path.normalize(this.tempFiles[i - 1].name)),
                  fileName + ` (${this.config.label || this.host.split(".")[0]}${compVersionLabel} ↔ ${baseVersionLabel})`,
                  {
                     preview: false,
                     selection: null, // Don't select any text in the compare
                  }
               );
               // Listen for the diff editor closing
               const documentCloseListener = vscode.workspace.onDidCloseTextDocument(async (document) => {
                  console.log(`Closing document URI: ${document.uri.toString()}`);
                  let normDocPath = path.normalize(document.uri.fsPath);
                  let normTempFile = path.normalize(tempFile.name);
                  if ( // os.platform() === 'win32' &&
                     fs.existsSync(normTempFile.toLowerCase()) &&
                     fs.existsSync(normTempFile.toUpperCase())
                  ) {
                     // console.log('FileSystem is case-insensitive!');
                     normDocPath = normDocPath.toLowerCase();
                     normTempFile = normTempFile.toLowerCase();
                  }
                  // If the document being closed is the temp file, delete it
                  if (normDocPath === normTempFile) {
                     // Change permissions to writable (0o666 allows read and write for all users)
                     try {
                        await fs.promises.chmod(tempFile.name, 0o666);
                        // console.log(`File permissions changed to writable: ${this.tempFile.name}`);
                     } catch (error) {
                        console.error(`Error: ${error.message}`);
                     }
                     // Delete the temporary file
                     tempFile.removeCallback();
                     this.tempFiles[i] = null;
                     // Clean up listener
                     documentCloseListener.dispose();
                  }
               });
            } catch (error) {
               console.log(error);
               throw new Error(error);
            }

         }
      } catch (err) {
         console.error(`Error: ${err.message}`);
         vscode.window.showErrorMessage(`Error: ${err.message}`)
      }
   }

   async getEditorContents() {
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

   async enterComment(defaultValue) {
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
      console.log('Entered comment:\n', this.comment);
   }

   async getFormData(useEditorContents = true, filePath) {
      let filename;
      if (filePath instanceof vscode.Uri) {
         filePath = filePath.fsPath;
      }
      filePath = filePath || this.localFile || this.remoteFile;
      console.log("filePath:", filePath);
      const formdata = new FormData();
      if (useEditorContents) {

         // Create a Buffer from the string content and convert it to a Readable Stream
         const bufferStream = new Readable();
         bufferStream._read = () => { }; // No operation needed for the _read method
         bufferStream.push(this.fileContents); // Push the content to the stream
         bufferStream.push(null);    // Signal end of the stream

         // filename = this.localFile;
         filename = ((filePath || this.localFile) ?? 'editorContents.txt')?.split(/[\\\/]/).slice(-1)[0];
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
         formdata.append('uploadFile', fs.createReadStream(filePath || this.localFile), filename);
         console.log('formdata:', formdata);
      }
      return [formdata, filename];
   }

   getRemoteFilePath(){
      if (! this.localFile || ! this.config || this.config.localRootPath == null || ! this.config.remoteEndpoint) {
         this.localFile = this.localFile || null;
         this.config = this.config || null;
         if (this.config) {
            this.config.localRootPath = this.config.localRootPath || null;
            this.config.remoteEndpoint = this.config.remoteEndpoint || null;
         }
         throw new Error(`(RestApi.getRemoteFilePath): Invalid localFile: ${this.localFile} and/or config: ${beautify(JSON.stringify(this.config))}`);
      }
      const workingWSFolder = vscode.workspace.getWorkspaceFolder(
         (this.localFile instanceof vscode.Uri) ?
         this.localFile :
         vscode.Uri.file(this.localFile)
      );
      // const remoteFile = this.localFile
      //    .replace(/\\/g, "/")
      //    .replace(
      //       workingWSFolder.uri.fsPath.replace(/\\/g, "/") + this.config.localRootPath,
      //       ""
      //    );
      const remoteFile = this.localFile
         .replace(/\\/g, "/")
         .replace(
            path.posix.join(workingWSFolder.uri.fsPath.replace(/\\/g, "/"), this.config.localRootPath.replace(/\\/g, "/")),
            ""
         );

      console.log('remoteFile:', remoteFile);
      this.remoteFile = remoteFile;
      console.log('this.remoteFile:', this.remoteFile);

      const url = new URL(this.config.remoteEndpoint.url);
      this.host = url.hostname;
   }

   async uploadAndExpand(param, comment) {
      if (typeof param === 'string') {
         param = vscode.Uri.file(param);
      }
      if (param instanceof vscode.Uri) {
         const fileStat = await this.getFileStat(param);
         if (fileStat.type === vscode.FileType.File) {
            this.localFile = param.fsPath;
         } else if (fileStat.type === vscode.FileType.Directory) {
            return vscode.window.showWarningMessage(`uploadAndExpand File: ${param.fsPath} is a folder!`);
         } else {
            return vscode.window.showWarningMessage(`uploadAndExpand File: ${param} is neither a file nor a folder!`);
         }
         
         await this.logon();
         const apiUrl = `https://${this.host}/lsaf/api`;
         const urlPath = new URL(this.config.remoteEndpoint.url).pathname
            .replace(/\/lsaf\/webdav\/work\//, '/workspace/folders/')
            .replace(/\/lsaf\/webdav\/repo\//, '/repository/containers/')
            .replace(/\/$/, '')
            ;
         console.log('urlPath:', urlPath)
         const filePath = `${this.remoteFile}`.replace(/[\/\\]+$/, '');  // remove any trailing (back)slash(es)
         console.log('filePath:', filePath);
         let apiRequest = `${urlPath}${filePath}?action=uploadandexpand&createParents=true&overwrite=true`;
         // await this.enterComment(`Add / Update ${(this.localFile?.split(/[\\\/]/)??'...').slice(-1)}`);
         await this.enterMultiLineComment(comment || `Add / Update ${(this.localFile?.split(/[\\\/]/) ?? '...').slice(-1)}\n\n`);
         if (this.comment) {
            apiRequest = `${apiRequest}&comment=${encodeURIComponent(this.comment)}`;
         }
         apiRequest = `${apiRequest}&expand=failures.items,warnings.items,successes.items`;
         let formdata;
         let filename;
         let requestOptions;
         const useEditorContents = false;
         [formdata, filename] = await this.getFormData(useEditorContents, param);
         requestOptions = {
            headers: {
               ...formdata.getHeaders(),
               "X-Auth-Token": this.authToken
           },
           maxRedirects: 0 // Handle redirection manually
         };
         // console.log(JSON.stringify(requestOptions));
         try {
            const fullUrl = encodeURI(apiUrl + apiRequest);
            console.log('fullUrl:', fullUrl);
            let response = await axios.put(fullUrl, formdata, requestOptions);
            console.log('response.status:', response.status, response.statusText);
            // Check if there's a redirect (3xx status code)
            const maxRedirects = 20;
            let redirects = 1;
            while (response.status >= 300 && response.status < 400 && redirects < maxRedirects) {
               const redirectUrl = response.headers['location'];
               if (redirectUrl) {
                  console.log(`Response status: ${response.status} ${response.statusText}, Redirecting (${redirects}) to: ${redirectUrl}`);
                  vscode.window.showInformationMessage(`Redirecting (${redirects}) to: ${redirectUrl}`);
                  // re-create the formdata and file stream (they can only be used once!)
                  [formdata, filename] = await this.getFormData(useEditorContents, param);
                  requestOptions = {
                     headers: {
                        ...formdata.getHeaders(),
                        "X-Auth-Token": this.authToken
                    },
                    maxRedirects: 0 // Handle redirection manually
                  };
                  // Perform the PUT request again at the new location
                  try {
                     response = await axios.put(redirectUrl, formdata, requestOptions);
                  } catch (error) {
                     console.log('error:', error);
                  }
               }
               redirects += 1;
            }
            if (!response.status === 200) {
               if (redirects >= maxRedirects) {
                  vscode.window.showErrorMessage(`HTTP error uploading Zip file, too many redirects! Status: ${response.status}  ${response.statusText}`);
                  throw new Error(`HTTP error uploading Zip file, too many redirects! Status: ${response.status}  ${response.statusText}`);
               }
               const responseText = response.data;
               console.log("responseText:", responseText);
               vscode.window.showErrorMessage(`HTTP error uploading Zip file! Status: ${response.status}  ${response.statusText}`);
               throw new Error(`HTTP error uploading Zip file! Status: ${response.status}  ${response.statusText}`);
            }
            let result;
            let successes, warnings, failures;
            let message, issues;
            const contentType = response.headers['content-type'];
            console.log('contentType:', contentType);
            if (response.headers['content-type'].match(/\bjson\b/)) {
               const data = response.data;
               ({ successes, warnings, failures } = data);
               result = beautify(JSON.stringify(data), {
                  indent_size: 2,
                  space_in_empty_paren: true,
               });
            } else {
               result = response.data;
            }
            if (typeof successes.count === 'number' && typeof warnings.count === 'number' && typeof failures.count === 'number') {
               issues = warnings.count + failures.count;
               const details = `(successes: ${successes.count}, warnings: ${warnings.count}, failures: ${failures.count})`;
               if (successes.count > 0 && warnings.count === 0 && failures.count === 0) {
                  message = `uploaded and expanded successfully ${details}`; 
               } else if (failures.count >0) {
                  message = `uploaded and expanded with failures ${details}`; 
               } else if (warnings.count) {
                  message = `uploaded and expanded with warnings ${details}`; 
               } else {
                  message = `uploaded but no files were extracted ${details}`; 
                  issues = 1;
               }
            } else {
               message = `upload: unexpected response format: ${result}`;
            } 
            console.log(message);
            return {issues, message};
         } catch (error) {
            // vscode.window.showErrorMessage(`Error uploading & expanding Zip file "${filename}":`, error);
            console.error(`Error uploading & expanding Zip file "${filename}":`, error);
            this.fileContents = null;
            return {issues: 1, message: `Error uploading & expanding Zip file "${filename}": ${error.message}`};
         }
      } else {
         console.log(`Invalid parameter ${param}, aborting uploadAndExpand.`);
         // vscode.window.showWarningMessage(`Invalid parameter ${param}, aborting uploadAndExpand.`);
         return {issues: 1, message: `Invalid parameter ${param}, aborting uploadAndExpand.`};
      }
   }

   async uploadFile(param) {
      console.log('param:', param);
      let useEditorContents = false;
      if (typeof param === 'string') {
         param = vscode.Uri.file(param);
      }
      if (typeof param === 'boolean') {
         useEditorContents = param;
      } else if (param instanceof vscode.Uri) {
         const fileStat = await this.getFileStat(param);
         if (fileStat.type === vscode.FileType.File) {
            this.localFile = param.fsPath;
         } else if (fileStat.type === vscode.FileType.Directory) {
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
         if (!this.localFile) {
            console.log(`No local File specified, aborting upload.`);
            vscode.window.showWarningMessage(`No local File specified, aborting upload.`);
            return;
         }
         if (!fs.existsSync(this.localFile)) {
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
      await this.enterMultiLineComment(`Add / Update ${(this.localFile?.split(/[\\\/]/) ?? '...').slice(-1)}\n\n`);
      if (this.comment) {
         apiRequest = `${apiRequest}&comment=${encodeURIComponent(this.comment)}`;
         // apiRequest = `${apiRequest}&comment=${this.comment}`;
      }
      apiRequest = `${apiRequest}&expand=item,status`;
      console.log('useEditorContents:', useEditorContents);
      let formdata;
      let filename;
      let requestOptions;
      [formdata, filename] = await this.getFormData(useEditorContents, param);
      requestOptions = {
         headers: {
            ...formdata.getHeaders(),
            "X-Auth-Token": this.authToken
        },
        maxRedirects: 0 // Handle redirection manually
      };
      // console.log(JSON.stringify(requestOptions));
      let response;
      try {
         const fullUrl = apiUrl + apiRequest
         console.log('fullUrl:', fullUrl);
         const controller = new AbortController();
         const timeout = 10_000;
         const timeoutId = setTimeout(() => controller.abort(), timeout);
         try {
            // const fullUrl = encodeURI(apiUrl + apiRequest);
            const fullUrl = apiUrl + apiRequest;
            response = await axios.put(fullUrl, formdata, { ...requestOptions, signal: controller.signal });
            clearTimeout(timeoutId); // clear timeout when the request completes
         } catch (error) {
            if (error.code === 'ECONNABORTED') {
               console.error(`Fetch request timed out after ${timeout/1000} seconds.`);
               throw new Error(`Fetch request timed out after ${timeout/1000} seconds.`);
            } else {
               console.error('Fetch request failed:', error);
               throw new Error('Fetch request failed:', error.message);
            }
         }
         console.log('response.status:', response.status, response.statusText);
         // Check if there's a redirect (3xx status code)
         const maxRedirects = 20;
         let redirects = 1;
         while (response.status >= 300 && response.status < 400 && redirects < maxRedirects) {
            const redirectUrl = response.headers['location'];
            if (redirectUrl) {
               console.log(`Response status: ${response.status} ${response.statusText}, Redirecting (${redirects}) to: ${redirectUrl}`);
               vscode.window.showInformationMessage(`Redirecting (${redirects}) to: ${redirectUrl}`);
               // re-create the formdata and file stream (they can only be used once!)
               [formdata, filename] = await this.getFormData(useEditorContents, param);
               requestOptions = {
                  headers: {
                     ...formdata.getHeaders(),
                     "X-Auth-Token": this.authToken
                 },
                 maxRedirects: 0 // Handle redirection manually
               };
               // Perform the PUT request again at the new location
               try {
                  response = await axios.put(redirectUrl, formdata, requestOptions);
               } catch (error) {
                  console.log('error:', error);
                  throw error;
               }
            }
            redirects += 1;
         }
         if (!response.status === 200) {
            if (redirects >= maxRedirects) {
               vscode.window.showErrorMessage(`HTTP error uploading file, too many redirects! Status: ${response.status}  ${response.statusText}`);
               throw new Error(`HTTP error uploading file, too many redirects! Status: ${response.status}  ${response.statusText}`);
            }
            const responseText = response.data;
            console.log("responseText:", responseText);
            vscode.window.showErrorMessage(`HTTP error uploading file! Status: ${response.status}  ${response.statusText}`);
            throw new Error(`HTTP error uploading file! Status: ${response.status}  ${response.statusText}`);
         }
         let result;
         let status;
         let message;
         const contentType = response.headers['content-type'];
         console.log('contentType:', contentType);
         if (response.headers['content-type'].match(/\bjson\b/)) {
            const data = response.data;
            status = data.status;
            result = beautify(JSON.stringify(data), {
               indent_size: 2,
               space_in_empty_paren: true,
            });
         } else {
            result = response.data;
         }
         if (status?.type === 'FAILURE') {
            message = `File "${filename}" upload failed: ` + status?.message || result;
         } else if (status?.type === 'SUCCESS') {
            message = `File "${filename}" uploaded: ` + status?.message || result;
         } else {
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


module.exports = { RestApi };
