const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { getMultiLineText: getMultiLineInput } = require('./multiLineText.js');
const { fileMD5sum, fileMD5sumStripBom } = require('./md5sum.js');
const isBinaryFile = require("isbinaryfile").isBinaryFile;
// const { openFile } = require("./openFile");

const { URL } = require("url");
const beautify = require("js-beautify");
const FormData = require('form-data');
const { Readable } = require('stream');
const { streamToPromise } = require('./stream.js');
const { pipeline } = require('stream/promises'); // Node.js v15+ only
// const { showMultiLineText } = require('./multiLineText.js');
const { showTableView } = require('./json-table-view.js');
const { read_dataset, read_sas, read_xpt, read_rds } = require('./read_dataset.js');
const xml2js = require('xml2js');
const { getObjectView } = require("./object-view.js");
console.log('(rest-api-class.js) typeof getObjectView:', typeof getObjectView);
const crypto = require('crypto');
const { axios } = require("./axios-cookie-jar.js");

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
         param = vscode.window.activeTextEditor?.document?.uri;
      }
      if (param instanceof vscode.Uri) {
         this.localFile = param;
         this.localFileStat = null;
         while(this.localFileStat == null && vscode.Uri.joinPath(param, '..') !== param) {
            this.localFileStat = await this.getFileStat(param);
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

      const workingDir = path.posix.dirname(vscode.Uri.joinPath(this.localFile, '..').path);
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

      console.log("config:\n", config);
      this.config = config;

      const workingWSFolder = vscode.workspace.getWorkspaceFolder(
         (param instanceof vscode.Uri) ?
            param :
            (typeof param === 'string') ?
            vscode.Uri.file(param) :
            vscode.window.activeTextEditor?.document?.uri);
      console.log("workingWSFolder:\n", beautify(JSON.stringify(workingWSFolder)));

      const remoteFile = (this.localFile.path ? this.localFile.path : this.localFile)
         .replace(/\\/g, "/")
         .replace(
            path.posix.join(workingWSFolder.uri ? 
               workingWSFolder.uri.path.replace(/\\/g, "/") :
               workingWSFolder.toString().replace(/\\/g, "/"),
            config.localRootPath.path ?
               config.localRootPath.path.replace(/\\/g, "/") :
               config.localRootPath.replace(/\\/g, "/")),
            ""
         );
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
            debugger;
            console.log(`(logon) Error: ${err}`);
            delete authTokens[this.host];
            return this.logon();
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
         this.localFile = param;
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
      const apiRequest = `${path.posix.join(urlPath, filePath)}?component=contents`;
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


   async getRemoteFileContents(param, pick_multiple = true, expectedMd5sum = null) {
      console.log('\n=== getRemoteFileContents ===');
      console.log('param:', param);
      await this.logon();  // check that authToken is still valid
      console.log('param:', param);
      if (typeof param === 'string') {
         param = vscode.Uri.file(param);
      }
      if (param instanceof URL) {
         param = vscode.Uri.from(param);
         debugger ;
      }
      if (param instanceof vscode.Uri) {
         this.localFile = param;
         this.remoteFile = null;
      }
      console.log(`(getRemoteFileContents) this.localFile: ${this.localFile}`);
      console.log(`(getRemoteFileContents) this.remoteFile: ${this.remoteFile}`);
      if (! this.remoteFile) {
         if (this.localFile) {
            this.getRemoteFilePath();
            console.log(`(getRemoteFileContents) this.remoteFile: ${this.remoteFile}`);
         } else {
            debugger;
            console.log(`(getRemoteFileContents) Missing info, returning: this.remoteFile: ${this.remoteFile}, this.localFile: ${this.localFile}`);
            return;
         }
      }
      const apiUrl = `https://${this.host}/lsaf/api`;
      const urlPath = new URL(this.config.remoteEndpoint.url).pathname
         .replace(/\/lsaf\/webdav\/work\//, '/workspace/files/')
         .replace(/\/lsaf\/webdav\/repo\//, '/repository/files/')
         .replace(/\/$/, '')
         ;
      console.log('urlPath:', urlPath);
      const filePath = this.remoteFile;
      let selectedVersion = null;
      let selectedVersions = null;
      if (/\/repository\/files\//.test(urlPath)) {
         await this.getRemoteFileVersions(param || this.localFile);
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

         const apiRequest = `${path.posix.join(urlPath, filePath)}?component=contents` + (selectedVersions[i]?.label ? `&version=${selectedVersions[i].label}` : '');
         const requestOptions = {
            headers: { "X-Auth-Token": this.authToken },
            maxRedirects: 5 // Optional, axios follows redirects by default
         };
         try {
            const fullUrl = encodeURI(apiUrl + apiRequest);  
            console.log('(getRemoteFileContents) fullUrl:', fullUrl);
            const selectedVersionLabel = selectedVersions[i]?.label || ''; 
            await this.downloadFile(fullUrl, requestOptions, selectedVersionLabel, Array.isArray(expectedMd5sum) ? expectedMd5sum[i] : expectedMd5sum);   
            console.log('this.fileContents.length =', this.fileContents.length);
         } catch (error) {
            console.error("Error fetching Remote File Contents:", error);
            vscode.window.showErrorMessage("Error fetching Remote File Contents:", error.message);
            this.fileContents.push(error.message);
            this.fileVersions.push(null);
         }

      }
      // debugger ;
      console.log('this.fileContents?.length =', this.fileContents?.length);
      console.log('Done === getRemoteFileContents ===\n');
      console.log('');
   };

   async downloadFile(fullUrl, requestOptions, versionLabel, expectedMd5sum = null){
      console.log('\n=== downloadFile ===');
      let response, contentType, contentLength, transferEncoding, result, data, responseType, responseText;
      try {
         console.log('this.config:', this.config);
         console.log('this.config?.localRootPath:', this.config?.localRootPath);
         console.log('this.config?.remoteEndpoint:', this.config?.remoteEndpoint);
         console.log('fullUrl:', fullUrl);
         if (fullUrl instanceof URL) {
            this.remoteFile = fullUrl.pathname
               .replace(`${this.config?.remoteEndpoint?.url?.pathname}`
                     .replace('/lsaf/webdav/repo/', '/lsaf/api/repository/files/')
                     .replace('/lsaf/webdav/work/', '/lsaf/api/workspace/files/')
                     .replace(/\/+$/, '')
                  , '');
            fullUrl = fullUrl.href;
         } else if (typeof fullUrl === 'string') {
            try {
               this.remoteFile = new URL(fullUrl).pathname
                  .replace(`${new URL(this.config?.remoteEndpoint?.url).pathname}`
                        .replace('/lsaf/webdav/repo/', '/lsaf/api/repository/files/')
                        .replace('/lsaf/webdav/work/', '/lsaf/api/workspace/files/')
                        .replace(/\/+$/, '')
                     , '');
            } catch (error) {
               console.log('Unexpected fullUrl:', fullUrl, '->', error);
            }
         }
         console.log('fullUrl:', fullUrl);
         console.log('requestOptions:', beautify(JSON.stringify(requestOptions)));
         console.log('this.remoteFile:', this.remoteFile);
         response = null;
         result = null;
         data = null;
         responseType = null;
         try {
            requestOptions.responseType = 'stream';
            console.log('(downloadFile) calling: await axios.get(fullUrl, requestOptions)');
            response = await axios.get(fullUrl, requestOptions);
            console.log('(downloadFile) await axios.get(fullUrl, requestOptions) returned response:', response);
            contentType = response?.headers['content-type'];
            contentLength = response?.headers['content-length'];
            if (response?.data){
               data = await new Promise((resolve, reject) => {
                  const chunks = [];
                  let n_chunks = 0;
                  response.data.on('data', chunk => {
                     chunks.push(chunk);
                     n_chunks++;
                  });
                  response.data.on('end', () => {
                     console.log(`Received ${n_chunks} chunks, length: ${Buffer.concat(chunks).length}.`);
                     resolve(Buffer.concat(chunks));
                  });
                  response.data.on('error', error => {
                     reject(error);
                  });
               });
               // Create an MD5 hash
               const hash = crypto.createHash('md5');
               // Update the hash with the buffer data
               hash.update(data);
               // Generate the checksum
               const md5sum = hash.digest('hex');
               console.log(`MD5 Checksum: ${md5sum}`);
               if (expectedMd5sum) {
                  if (expectedMd5sum !== md5sum) {
                     debugger;
                     console.warn(`MD5 Checksum DOES NOT MATCH expected md5sum ❌: ${expectedMd5sum} !!!`);
                  } else {
                     console.log(`MD5 Checksum does match expected md5sum ✅ : ${expectedMd5sum}`)
                  }
               }
            }
            if (data) response.data = data;
         } catch(error) {
            debugger;
            console.log(error);
         }
         transferEncoding = response.headers['transfer-encoding'];
         console.log('contentType:', contentType, 'contentLength:', contentLength, 'transferEncoding:', transferEncoding);
         if (contentType.match(/\bjson\b/)) {
            responseType = 'json';
         }
         else if (responseType == null || contentLength < 100_000_000) {
            if (
               /^(text\/|application\/(sas|(ld\+)?json|xml|javascript|html|xhtml\+xml|sql))/.test(contentType) 
               || /^(application\/x-(sas|httpd-php|perl|python|markdown|quarto|latex))(;|$)/.test(contentType)
            ) {
               responseType = 'text';
            } else {
               responseType = 'arraybuffer';
            }
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
            debugger;
            throw new Error(`HTTP error! ${result}`);
         }
         if (transferEncoding?.toLowerCase() === 'chunked' || contentLength < 500_000_000) {
            if (
               /^(text\/|application\/(sas|(ld\+)?json|xml|javascript|html|xhtml\+xml|sql))/.test(contentType) 
               || /^(application\/x-(sas|httpd-php|perl|python|markdown|quarto|latex))(;|$)/.test(contentType)
            ) {
               if ( response.data instanceof ArrayBuffer) {
                  responseText =  new TextDecoder('utf-8').decode(response.data);
               } else {
                  responseText = response.data;
               }
               if (! Array.isArray(this.fileContents)) this.fileContents = [];
               this.fileContents.push(responseText);
            } else  {
               // throw new Error(`File with content-length: ${contentLength} NOT downloaded given unexpected content-type: ${contentType}!`)
               const arrayBuffer = response.data;
               if (! Array.isArray(this.fileContents)) this.fileContents = [];
               this.fileContents.push(Buffer.from(arrayBuffer));
            }
            if (! Array.isArray(this.fileVersions)) this.fileVersions = [];
            this.fileVersions.push(versionLabel || '');
            if (! Array.isArray(this.fileContentLength)) this.fileContentLength = [];
            this.fileContentLength.push(contentLength);
            if (! Array.isArray(this.fileContentType)) this.fileContentType = [];
            this.fileContentType.push(contentType);
         } else {
            debugger;
            throw new Error(`File with content-type: ${contentType} NOT downloaded given unexpected content-length: ${contentLength}!`)
         }
      } catch (error) {
         debugger;
         console.error("Error fetching Remote File Contents:", error);
         vscode.window.showErrorMessage("Error fetching Remote File Contents:", error.message);
         if (! Array.isArray(this.fileContents)) this.fileContents = [];
         this.fileContents.push(error.message);
         if (! Array.isArray(this.fileVersions)) this.fileVersions = [];
         this.fileVersions.push(null);
      }
      console.log('this.remoteFile =', this.remoteFile);      
      console.log('this.fileContents.length =', this.fileContents.length);      
      console.log('\nDone === downloadFile ===');
   };


   async getFileStat(param) {
      let fileStat;
      if (typeof param === 'string') {
         param = vscode.Uri.parse(param);
      }
      if (param instanceof vscode.Uri) {
         // param is a Uri
         try {
            fileStat = await vscode.workspace.fs.stat(param);           
         } catch (error) {
            fileStat = error;
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
         this.localFile = param;
      } else {
         this.localFile = vscode.window.activeTextEditor?.document?.uri;
      }
      if (!this.localFile) {
         console.error('Cannot get Remote File Properties of a non-specified file:', this.localFile);
         vscode.window.showErrorMessage('Cannot get Remote File Properties of a non-specified file:', this.localFile);
         return;
      }
      await this.logon();
      const apiUrl = `https://${this.host}/lsaf/api`;
      let fileStat;
      try{
         fileStat = await this.getFileStat(this.localFile);
      } catch(err) {
         debugger;
         console.log(err);
      }
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
      const filePath = this.remoteFile?.path ? this.remoteFile.path : this.remoteFile;
      const apiRequest = `${path.posix.join(urlPath, filePath)}?component=properties`;
      const requestOptions = {
         headers: { "X-Auth-Token": this.authToken },
         maxRedirects: 5 // Optional, axios follows redirects by default
      };
      try {
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
         this.localFile = param;
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
         // const files = await fs.promises.readdir(folderPath); // Asynchronous read of directory contents
         const files = await vscode.workspace.fs.readDirectory(folderPath);

         folderContents = await Promise.all(
            files.map(async ([name, type]) => {
               const filePath = vscode.Uri.joinPath(folderPath, name);
               const stats = await vscode.workspace.fs.stat(filePath); // Asynchronous stat call
               let isBinary = null;
               let md5sum = '';
               let fileType = '';

               if (type === vscode.FileType.File && filePath.scheme === "file") {
                  fileType = 'file';
                  isBinary = isBinaryFile(filePath.fsPath);
                  if (isBinary) {
                     md5sum = await fileMD5sum(filePath.fsPath);
                  } else {
                     md5sum = fileMD5sumStripBom(filePath.fsPath);
                  }
               } else {
                  if (type === vscode.FileType.Directory) {
                     fileType = 'directory';
                  } else if (type === vscode.FileType.SymbolicLink) {
                     fileType = 'symlink';
                  } 
                  md5sum = '';
               }

               return {
                  name: name,
                  type: fileType,
                  size: stats.size,
                  mtime: new Date(stats.mtime).toISOString(),
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
         this.localFile = param;
      } else {
         this.localFile = vscode.window.activeTextEditor?.document?.uri;
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
      console.log('urlPath:', urlPath);
      const filePath = this.remoteFile;
      const apiRequest = `${path.posix.join(urlPath, filePath)}?component=children&expand=item&limit=10000`;
      const requestOptions = {
         headers: { "X-Auth-Token": this.authToken },
         maxRedirects: 5 // Optional, axios follows redirects by default
      };
      try {
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
      console.log('\n=== getRemoteFileVersions ===');
      // debugger ;
      if (typeof param === 'string') {
         param = vscode.Uri.parse(param);
      }
      if (param instanceof vscode.Uri) {
         this.localFile = param;
      } else if (vscode.window.activeTextEditor?.document?.uri) {
         this.localFile = vscode.window.activeTextEditor?.document?.uri;
      }
      await this.logon();
      const apiUrl = `https://${this.host}/lsaf/api`;
      const urlPath = new URL(this.config?.remoteEndpoint?.url).pathname
         .replace(/\/lsaf\/webdav\/work\//, '/workspace/files/')
         .replace(/\/lsaf\/webdav\/repo\//, '/repository/files/')
         .replace(/\/$/, '')
         ;
      console.log('urlPath:', urlPath)
      const filePath = this.remoteFile.path ? this.remoteFile.path : this.remoteFile;
      const apiRequest = `${path.posix.join(urlPath, filePath)}?component=versions`;
      const requestOptions = {
         headers: { "X-Auth-Token": this.authToken },
         maxRedirects: 5 // Optional, axios follows redirects by default
      };
      try {
         const fullUrl = encodeURI(apiUrl + apiRequest)
         console.log('fullUrl:', fullUrl);
         let response;
         try {
            response = await axios.get(fullUrl, requestOptions);
         } catch(error) {
            debugger;
            console.log(error);
            if (error.status === 404) {
               console.warn('File not found:', filePath);
               vscode.window.showErrorMessage(`File not found: ${filePath}`);
               return error;
            }
         }
         if (! response.headers) {
            debugger;
            console.log('response.headers:', response.headers);
         }
         let contentType = response.headers['content-type'];
         console.log('contentType:', contentType);
         let transferEncoding = response.headers['transfer-encoding'];
         console.log('transferEncoding:', transferEncoding);
         let result = null;
         let data = null;
         try {
            if (transferEncoding === 'chunked') {
               requestOptions.responseType = 'stream';
               response = await axios.get(fullUrl, requestOptions);
               data = await new Promise((resolve, reject) => {
                  let chunks = '';
                  response.data.on('data', (chunk) => {
                     chunks += chunk;
                  });
      
                  response.data.on('end', () => {
                     resolve(chunks);
                  });
      
                  response.data.on('error', (error) => {
                     reject(error);
                  });
               });
               contentType = response.headers['content-type'];
               console.log('contentType:', contentType);
               if (contentType.match(/\bjson\b/)) {
                  const jsonData = JSON.parse(data);
                  if (jsonData && typeof jsonData === 'object') {
                     data = jsonData;
                  }
               }
            } else {
               response = await axios.get(fullUrl, requestOptions);
               data = response.data;
            }
         } catch (error) {
            console.log(error);
         }
         contentType = response.headers['content-type'];
         console.log('contentType:', contentType);
         if (contentType.match(/\bjson\b/)) {
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
      
      console.log('Done === getRemoteFileVersions ===\n');
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

         // outFile = path.join(folderUri[0].fsPath, filename);
         outFile = vscode.Uri.joinPath(folderUri[0], filename);

      } else if (! outFile) {
         outFile = this.localFile;
      }
      try {
         if (outFile && this.fileContents[0] != null) {
            let outFileExists = false;
            try {
               // Will throw exception if file does not exist
               // await fs.promises.stat(outFile);
               await vscode.workspace.fs.stat(outFile);
               outFileExists = true;
               console.log(`outFile exists: ${outFile}`);
            } catch (error) {
               console.log(`outFile does not exist: ${outFile}, Error:`, error);
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
            // Convert the string content to a Uint8Array which is required by the vscode.workspace.fs.writeFile() method.
            const encoder = new TextEncoder();
            const encodedContent = encoder.encode(this.fileContents[0]);
            await vscode.workspace.fs.writeFile(outFile, encodedContent);  
            console.log(`Saved as ${outFile}`);
            vscode.window.showInformationMessage(`Saved as ${outFile}.`)
         }
      } catch (err) {
         console.error(`Error: ${err.message}`);
         vscode.window.showErrorMessage(`Error: ${err.message}`)
      }
   }

   // eslint-disable-next-line require-await
   async parseXmlString(xmlString) {
      const parser = new xml2js.Parser();
      // Use Promise to handle async parsing
      return new Promise((resolve, reject) => {
         parser.parseString(xmlString, (err, result) => {
            if (err) {
                  return reject(err);  // Reject promise in case of error
            }
            resolve(result);  // Resolve promise with parsed result
         });
      });
   }

   async getRemoteJobParameters(jobFile, submitThisJob = false) {
      try {
         await this.getRemoteFileContents(jobFile);
      } catch (error) {
         console.log(error);
      }
      if (! Array.isArray(this.fileContents)) {
         this.fileContents = [this.fileContents];
      }
      if (!this.fileContents || this.fileContents?.length === 0) {
         await this.getRemoteFileContents()
         if (!this.fileContents) {
            throw new Error("Failed to get remote file contents.");
         }
      }
      try {
         this.jobContents = await this.parseXmlString(this.fileContents); 
         if (this.fileVersions && Array.isArray(this.fileVersions)){
            this.jobVersion = this.fileVersions[0] || '';
         } else {
            this.jobVersion = this.fileVersions || '';
         }
         console.log(this.jobContents);
         // getObjectView(this.jobContents, false);
         let jobParams = [];
         if (this.jobContents?.job?.parameters[0]?.parameter
            && Array.isArray(this.jobContents?.job?.parameters[0]?.parameter)
         ) {
            jobParams = [...jobParams, ...this.jobContents.job.parameters[0].parameter
               .map(p => ({ defaultValue:p._, ...p.$}))
               .map(p => ({...p, value: p.defaultValue || '', defaultValue: undefined}))];
         }
         if (this.jobContents?.job?.parameters[0]['character-parameter']
            && Array.isArray(this.jobContents?.job?.parameters[0]['character-parameter'])) {
               jobParams = [...jobParams, ...this.jobContents.job.parameters[0]['character-parameter']
               .map(p => ({ defaultValue:p._, ...p.$}))
               .map(p => ({...p, value: p.defaultValue || '', defaultValue: undefined}))];
         }
         if (this.jobContents?.job?.parameters[0]['numeric-parameter']
            && Array.isArray(this.jobContents?.job?.parameters[0]['numeric-parameter'])) {
               jobParams = [...jobParams, ...this.jobContents.job.parameters[0]['numeric-parameter']
               .map(p => ({ defaultValue:p._, ...p.$}))
               .map(p => ({...p, value: p.defaultValue || '', defaultValue: undefined}))];
         }
         if (this.jobContents?.job?.parameters[0]['folder-parameter']
            && Array.isArray(this.jobContents?.job?.parameters[0]['folder-parameter'])) {
               jobParams = [...jobParams, ...this.jobContents.job.parameters[0]['folder-parameter']
               .map(p => ({ defaultValue:p._, ...p.$}))
               .map(p => ({...p, value: p.defaultValue || '', defaultValue: undefined}))];
         }
         if (this.jobContents?.job?.parameters[0]['file-parameter']
            && Array.isArray(this.jobContents?.job?.parameters[0]['file-parameter'])) {
               jobParams = [...jobParams, ...this.jobContents.job.parameters[0]['file-parameter']
               .map(p => ({ defaultValue:p._, ...p.$}))
               .map(p => ({...p, value: p.defaultValue || '', defaultValue: undefined}))];
         }
         if (this.jobContents?.job?.parameters[0]['masked-parameter']
            && Array.isArray(this.jobContents?.job?.parameters[0]['masked-parameter'])) {
               jobParams = [...jobParams, ...this.jobContents.job.parameters[0]['masked-parameter']
               .map(p => ({ defaultValue:p._, ...p.$}))
               .map(p => ({...p, value: p.defaultValue || '', defaultValue: undefined}))];
         }
         if (this.jobContents?.job?.parameters[0]['date-parameter']
            && Array.isArray(this.jobContents?.job?.parameters[0]['date-parameter'])) {
               jobParams = [...jobParams, ...this.jobContents.job.parameters[0]['date-parameter']
               .map(p => ({ defaultValue:p._, ...p.$}))
               .map(p => ({...p, value: p.defaultValue || '', defaultValue: undefined}))];
         }
         const editableParams = jobParams.map(p => ({[`[${p.name}] ${p.label}:`]: p.value}));
         console.log('(getRemoteJobParameters) jobParams:\n', jobParams);
         console.log('(getRemoteJobParameters) editableParams:\n', editableParams);
         let newParams = undefined;
         if (jobParams) {
            const editable = true;
            newParams = await getObjectView(editableParams, editable, "Enter Job Parameters", "Job Parameters");
            newParams = Object.entries(newParams).map(([a, b]) => [b, a][0])
               .map(item => Object.entries(item).reduce((acc, [k,v]) => {acc[k.split(/[\[\]]/)[1]]= v; return acc}, {}))
               .reduce((acc, obj)=> ({...acc, ...obj}), {});
         }
         console.log('(getRemoteJobParameters) newParams:\n', newParams);
         if (submitThisJob) {
            await this.submitJob(this.remoteFile, this.jobVersion, newParams);
         }
         return newParams;
      } catch (error) {
         if (error === "Cancelled" || error?.message === "Cancelled") {
            console.log('(getRemoteJobParameters) Cancelling.');
            vscode.window.showErrorMessage('(getRemoteJobParameters) Cancelling.');
         } else {
            console.log('(getRemoteJobParameters) error:', error);
            debugger;
            vscode.window.showErrorMessage('(getRemoteJobParameters) error:', error);
         }
      }
   }


   // viewFileContents
   async viewFileContents(){
      console.log('\n=== viewFileContents ===');
      console.log('this.fileContents.length:', this.fileContents.length);
      // debugger ;
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

         // const fileName = this.remoteFile.slice(this.remoteFile.lastIndexOf("/") + 1);
         const fileName = path.basename(this.remoteFile);
         const ext = path.extname(fileName);
         const versionLabel = this.fileVersions[0] ? ` v${this.fileVersions[0]}` : '';
         const confLabel = `${(this.config.label || this.host.split(".")[0])}`.replace('/','-');

         if (Buffer.isBuffer(this.fileContents[0])
            || /^application\/x-sas-data(;|$)/.test(this.fileContentType) || ext === '.sas7bdat'
            || /^application\/x-sas-xport(;|$)/.test(this.fileContentType) || ext === '.xpt'
            || (/^application\/octet-stream(;|$)/.test(this.fileContentType) && ext === '.rds')
         ) {
            const tempFile = tmp.fileSync({ postfix: ext, discardDescriptor: true });
            const tempFileUri = vscode.Uri.file(tempFile.name);
            let uint8Array;
            try {
               if (Buffer.isBuffer(this.fileContents[0])){
                  // Convert Buffer to Uint8Array
                  uint8Array = new Uint8Array(this.fileContents[0]);
                  // Write the Uint8Array to the file
                  await vscode.workspace.fs.writeFile(tempFileUri, uint8Array);
                  console.log('File written successfully:', tempFileUri);
               } else if (typeof this.fileContents[0] === 'string') {
                  // Convert the string content to a Uint8Array which is required by the vscode.workspace.fs.writeFile() method.
                  uint8Array = new TextEncoder().encode(this.fileContents[0]);
                  await vscode.workspace.fs.writeFile(tempFileUri, uint8Array);  
                  // await fs.promises.writeFile(tempFile.name, this.fileContents[0]);
               } else {
                  debugger ;
                  console.log("(viewFileContents) Unexpected case")
                  await fs.promises.writeFile(tempFile.name, this.fileContents[0]);
               }
            } catch (error) {
               console.log(`Failed to write file ${tempFile.name}: ${error.message}`);
               debugger;
               vscode.window.showErrorMessage(`Failed to write file: ${error.message}`);
            }
            // Set the file to read-only (cross-platform)
            try {
               await fs.promises.chmod(tempFile.name, 0o444);
               console.log(`File is now read-only: ${tempFile.name}`);
            } catch (err) {
               console.error(`Failed to set file as read-only: ${err}`);
            }
            // if (/^application\/x-sas-data(;|$)/.test(this.fileContentType)
            //    || ext === '.sas7bdat'
            // ) {
               let data;
               console.log(`(viewFileContents) calling await read_dataset(${tempFile.name})...`);
               try {
                  ({ data } = await read_dataset(tempFile.name));
               } catch (error) {
                  debugger;
                  console.log(error);
               }
               // console.log('(viewFileContents) Returned data:', beautify(JSON.stringify(data)));
               await showTableView(`Imported Dataset from ${confLabel} remote file: ${this.remoteFile}`, data,
                                    undefined, `${this.remoteFile}`.split(/[/\\]/).pop()+` (${confLabel})`);
               // await showMultiLineText(beautify(JSON.stringify(data)), "Imported SAS data", `from ${confLabel} remote file: ${this.remoteFile}`);
               // openFile(vscode.Uri.file(tempFile.name));
            // } else if (/^application\/x-sas-xport(;|$)/.test(this.fileContentType) || ext === '.xpt') {
            //    let data;
            //    console.log(`(viewFileContents) calling await read_xpt(${tempFile.name})...`);
            //    try {
            //       data = await read_xpt(tempFile.name);
            //    } catch (error) {
            //       debugger;
            //       console.log(error);
            //    }
            //    console.log('(viewFileContents) Returned data:', beautify(JSON.stringify(data)));
            //    await showTableView(`Imported SAS Xpt from ${confLabel} remote file: ${this.remoteFile}`, data,
            //       undefined, `${this.remoteFile}`.split(/[/\\]/).pop()+` (${confLabel})`);
            //    // await showMultiLineText(beautify(JSON.stringify(data)), "Imported SAS Xpt", `from ${confLabel} remote file: ${this.remoteFile}`);
            //    // openFile(vscode.Uri.file(tempFile.name));
            // } else if (/^application\/octet-stream(;|$)/.test(this.fileContentType) && ext === '.rds') {
            //    let data;
            //    console.log(`(viewFileContents) calling await read_rds(${tempFile.name})...`);
            //    try {
            //       data = await read_rds(tempFile.name);
            //    } catch (error) {
            //       debugger;
            //       console.log(error);
            //    }
            //    console.log('(viewFileContents) Returned data:', beautify(JSON.stringify(data)));
            //    await showTableView(`Imported R dataset from ${confLabel} remote file: ${this.remoteFile}`, data,
            //       undefined, `${this.remoteFile}`.split(/[/\\]/).pop()+` (${confLabel})`);
            //    // await showMultiLineText(beautify(JSON.stringify(data)), "Imported R dataset", `from ${confLabel} remote file: ${this.remoteFile}`);
            //    // openFile(vscode.Uri.file(tempFile.name));
            // }
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
      console.log('Done === viewFileContents ===\n');
   }

   async compareFileContents() {
      // Write the remote file to a local temporary file
      const extension = this.localFile ?
         path.extname(this.localFile?.path ? this.localFile.path : this.localFile) :
         path.extname(this.remoteFile?.path ? this.remoteFile.path : this.remoteFile);
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
               if (!this.localFile) {
                  debugger;
                  console.log('(compareFileContents) unexpected this.localFile:', this.localFile);
               }         
               await vscode.commands.executeCommand(
                  "vscode.diff",
                  vscode.Uri.file(path.normalize(this.tempFiles[i].name)),
                  i === 0 ?
                     (this.localFile?.path ?
                        this.localFile :
                        vscode.Uri.file(path.normalize(this.localFile))) :
                     vscode.Uri.file(path.normalize(this.tempFiles[i - 1].name)),
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

   // eslint-disable-next-line require-await
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
      // if (filePath instanceof vscode.Uri) {
      //    filePath = filePath.fsPath;
      // }
      filePath = filePath || this.localFile || this.remoteFile;
      if (filePath === this.remoteFile) {
         debugger;
         console.log('Valid case? filePath = this.remoteFile =', filePath);
      }
      if (filePath && typeof filePath === 'string') {
         filePath = vscode.Uri.file(filePath);
      }
      console.log("filePath:", filePath);
      const formdata = new FormData();
      if (useEditorContents) {

         // Create a Buffer from the string content and convert it to a Readable Stream
         const bufferStream = new Readable();
         bufferStream._read = () => { }; // No operation needed for the _read method
         bufferStream.push(this.fileContents); // Push the content to the stream
         bufferStream.push(null);    // Signal end of the stream

         // filename = this.localFile;
         filename = ((filePath.path || this.localFile.path) ?? 'editorContents.txt')?.split(/[\\/]/).slice(-1)[0];
         console.log('filename:', filename);

         // Append the file-like content to the FormData object with the key 'uploadFile'
         formdata.append('uploadFile', bufferStream, { filename });
         // formdata.append('uploadFile', new Blob([this.fileContents]), filename);    // fails because Blob is not a stream
         console.log('formdata:', formdata);
      } else {
         filename = filePath.path.split(/[\\/]/).slice(-1)[0];
         console.log('filename:', filename);
         // Read the file contents using vscode workspace filesystem
         let fileUri;
         if (filePath && typeof filePath === 'string') {
            fileUri = vscode.Uri.file(filePath);
         } else if (filePath && filePath instanceof vscode.Uri) {
            fileUri = filePath;
         } else if (this.localFile.path) {
            fileUri = this.localFile;
         } else {
            fileUri = vscode.Uri.file(this.localFile);
         }
         const fileContents = await vscode.workspace.fs.readFile(fileUri);
         // Convert Uint8Array to Buffer
         const buffer = Buffer.from(fileContents);
         // Append the file to the FormData
         formdata.append('uploadFile', buffer, filename);
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
      const remoteFile = (this.localFile.fsPath || this.localFile.path || `${this.localFile}`)
         .replace(/\\/g, "/")
         .replace(
            path.posix.join((workingWSFolder?.uri.fsPath || workingWSFolder?.uri.path || '').replace(/\\/g, "/"),
            this.config.localRootPath.path ?
               this.config.localRootPath.path.replace(/\\/g, "/") :
               `${this.config.localRootPath}`.replace(/\\/g, "/")),
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
         const filePath = `${this.remoteFile}`.replace(/[/\\]+$/, '');  // remove any trailing (back)slash(es)
         console.log('filePath:', filePath);
         let apiRequest = `${path.posix.join(urlPath, filePath)}?action=uploadandexpand&createParents=true&overwrite=true`;
         // await this.enterComment(`Add / Update ${(this.localFile?.split(/[\\\/]/)??'...').slice(-1)}`);
         await this.enterMultiLineComment(comment || `Add / Update ${(this.localFile?.split(/[\\/]/) ?? '...').slice(-1)}\n\n`);
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
         return {issues: 1, message: `Invalid parameter ${param}, aborting uploadAndExpand.`};
      }
   }

   async uploadFile(param) {
      // debugger ;
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
            this.localFile = param;
         } else if (fileStat.type === vscode.FileType.Directory) {
            return vscode.window.showWarningMessage(`Upload File: ${param.path} is a folder!`);
         } else {
            return vscode.window.showWarningMessage(`Upload File: ${param.path} is neither a file nor a folder!`);
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
         if (!this.getFileStat(this.localFile)) {
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
      let apiRequest = `${path.posix.join(urlPath, filePath)}?action=upload&version=MINOR&createParents=true&overwrite=true`;
      await this.enterMultiLineComment(`Add / Update ${((this.localFile.path || this.localFile).toString().split(/[\\/]/) || '...').slice(-1)}\n\n`);
      if (this.comment) {
         apiRequest = `${apiRequest}&comment=${encodeURIComponent(this.comment)}`;
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
         console.log('(uploadFile) result:', result);
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
   }

   
   async submitJob(argJob, argVersion, argParams) {
      // debugger ;
      console.log('job:', argJob, 'version:', argVersion, '\nparams:\n', argParams);
      if (argJob instanceof vscode.Uri) {
         argJob = argJob.path;
      }
      if (typeof argJob !== 'string') {
         console.warn(`(submitJob) invalid argJob type: ${typeof argJob} ${argJob}`);
         throw new Error(`(submitJob) invalid argJob type: ${typeof argJob} ${argJob}`);
      }
      await this.logon();
      const apiUrl = `https://${this.host}/lsaf/api`;
      const submitHost = new URL(this.config.remoteEndpoint.url).hostname.split('.')[0];
      const urlPath = new URL(this.config.remoteEndpoint.url).pathname
         .replace(/\/lsaf\/webdav\/work\//, '/jobs/workspace/')
         .replace(/\/lsaf\/webdav\/repo\//, '/jobs/repository/')
         .replace(/\/$/, '')
      const jobType = /\/repository\//.test(urlPath) ? "repo" : /\/workspace\//.test(urlPath) ? "work" : undefined;
      const jobPathPrefix = urlPath.replace(/^\/jobs\/(workspace|repository)/, '');
      console.log('submitHost:', submitHost, 'jobType:', jobType, 'urlPath:', urlPath, 'jobPathPrefix:', jobPathPrefix);
      const jobPath = this.remoteFile;
      const jobName = path.basename(jobPath);
      const fullJobPath = path.posix.join(jobPathPrefix, jobPath);
      console.log('fullJobPath:', fullJobPath);
      let apiRequest = `${path.posix.join(urlPath, encodeURI(jobPath))}?action=run`;
      if (/\d+\.\d+/.test(`${argVersion}`.trim())) {
         apiRequest = `${apiRequest}&version=${argVersion.toString().trim()}`;
      }
      apiRequest = `${apiRequest}&expand=status`;
      const fullUrl = apiUrl + apiRequest
      console.log('fullUrl:', fullUrl);
      let requestOptions;
      requestOptions = {
         method: 'put',
         maxBodyLength: Infinity,
         url: fullUrl,
         headers: {
            "X-Auth-Token": this.authToken,
            'Content-Type': 'application/json'
         },
         maxRedirects: 5 
      };
      if (typeof argParams === 'object') {
         requestOptions.data = JSON.stringify(argParams);
      } else if (typeof argParams === 'string') {
         requestOptions.data = argParams;
      }
      let response;
      let result;
      let status;
      let message;
      let submissionId;
      let data;
      let prev_message = '';
      let submitStarted = new Date();
      const intervalId = setInterval(async () => {
         if (requestOptions.url) {
            try {
               const controller = new AbortController();
               const timeout = 10_000;
               const timeoutId = setTimeout(() => controller.abort(), timeout);
               try {
                  response = await axios.request({ ...requestOptions, signal: controller.signal });
                  clearTimeout(timeoutId); // clear timeout when the request completes
                  requestOptions.url = null; // prevent re-launching same job continuously
               } catch (error) {
                  clearInterval(intervalId);
                  debugger;
                  if (error.code === 'ECONNABORTED') {
                     console.error(`(submitJob) Http request timed out after ${timeout/1000} seconds.`);
                     throw new Error(`(submitJob) Http request timed out after ${timeout/1000} seconds.`);
                  } else {
                     console.error('(submitJob) Http request failed:', error);
                     debugger;
                     throw new Error('(submitJob) Http request failed:', error.message);
                  }
               }
               console.log('response.status:', response.status, response.statusText);
               
               if (!response.status === 200) {
                  const responseText = response.data;
                  console.log("responseText:", responseText);
                  vscode.window.showErrorMessage(`HTTP error submitting ${jobType} job! Status: ${response.status}  ${response.statusText}`);
                  throw new Error(`HTTP error submitting ${jobType} job! Status: ${response.status}  ${response.statusText}`);
               }
               const contentType = response.headers['content-type'];
               console.log('contentType:', contentType);
               if (response.headers['content-type'].match(/\bjson\b/)) {
                  data = response.data;
                  status = data.status || (data.state ? { type: `${data.state}`.toUpperCase(), message: data.message } : undefined) ;
                  console.log('status:', status);
                  submissionId = data.submissionId || data.id || submissionId;
                  // change URL toget submission status
                  if (submissionId) {
                     requestOptions.url = apiUrl + `/jobs/submissions/${submissionId}`;
                     requestOptions.method = 'get';
                  } 
                  if (! submissionId || ! status || !data ) {
                     debugger;
                  }
                  result = beautify(JSON.stringify(data), {
                     indent_size: 2,
                     space_in_empty_paren: true,
                  });
               } else {
                  result = response.data;
               }
               if (status?.type === 'FAILURE') {
                  message = `${jobType} job "${jobName}" submission **failed**:\n\n` + (status?.message || result) + `\n\nat ${fullJobPath}`;
                  clearInterval(intervalId);
               } else if (status?.type === 'CANCELED') {
                  message = `${jobType} job "${jobName}" submission **canceled**:\n\n` + (status?.message || result) + `\n\nat ${fullJobPath}`;
                  clearInterval(intervalId);
               } else if (status?.type === 'COMPLETED') {
                  const submitCompleted = new Date();
                  const diffInMs = submitCompleted - submitStarted ;
                  const diffInSeconds = Math.floor(diffInMs / 1000);
                  const diffInMinutes = Math.floor(diffInSeconds / 60);
                  const diffInHours = Math.floor(diffInMinutes / 60);
                  const diffInDays = Math.floor(diffInHours / 24);

                  const hours = diffInHours % 24;
                  const minutes = diffInMinutes % 60;
                  const seconds = diffInSeconds % 60;
                  let duration;
                  if (diffInDays) {
                     duration = `${diffInDays} days, ${hours} hours`;
                  } else if (hours) {
                     duration = `${hours} hours, ${minutes} minutes`;
                  } else if (minutes) {
                     duration = `${minutes} minutes, ${seconds} seconds`;
                  } else if (seconds) {
                     duration = `${seconds} seconds`;
                  } else {
                     duration = `${diffInMs} milliseconds`;
                  }
                  console.log(`Completed after: ${duration}`);
                  message = `${jobType} job "${jobName}" *completed* in ${duration}:\n\n` + (status?.message || result) + `\n\nat ${fullJobPath}`;
                  clearInterval(intervalId);
               } else {
                  if (status?.type === 'STARTED') {
                     message = `${jobType} job "${jobName}" started:` + (status?.message || result) + `\n\nat ${fullJobPath}`;
                  } else if (status?.type === 'RUNNING') {
                     message = `${jobType} job "${jobName}" running: ` + (status?.message || result) + `\n\nat ${fullJobPath}`;
                  } else if (status?.type === 'PUBLISHING') {
                     message = `${jobType} job "${jobName}" publishing: ` + (status?.message || result) + `\n\nat ${fullJobPath}`;
                  } else {
                     message = `${jobType} job "${jobName}" Status type: ${status?.type} ` + (status?.message || result) + `\n\nat ${fullJobPath}`;
                     debugger;
                     console.log(message);
                  }
               } 
               console.log('submissionId:', submissionId);
               console.log('  result:', result);
               console.log('  '+message);
               if (message !== prev_message) {
                  if (/with program errors/i.test(message)) {
                     vscode.window.showErrorMessage(message);
                  } else if (/with program warnings/i.test(message)) {
                     vscode.window.showWarningMessage(message);
                  } else {
                     vscode.window.showInformationMessage(message);
                  }
               }
               prev_message = message;
               if (status?.type === 'COMPLETED') {
                  const location = `${jobType || 'repository'}`
                     .replace(/^repo$/, 'repository')
                     .replace(/^work$/, 'workspace')
                     ;
                  this.manifest = await this.getJobSubmissionManifest(submissionId, location);
                  const editable = false;
                  if (this.manifest){
                     try{
                        await getObjectView(this.manifest, editable, "Job Submission Manifest", "Job Submission Manifest", this.context, this);
                     } catch(error) {
                        debugger;
                        if (error === "cancelled") {
                           console.log('(submitJob) Cancelled.');
                        } else {
                           console.log('(submitJob) Error in getObjectView():', error);
                        }
                     }
                  }
                  console.log('this.manifest:', beautify(JSON.stringify(this.manifest)));
                  console.log('done');
               }
            } catch (error) {
               vscode.window.showErrorMessage(`Error submitting ${jobType} job ${jobName} at "${fullJobPath || argJob}":`, error);
               debugger;
               console.error(`Error submitting ${jobType} job ${jobName} at "${fullJobPath || argJob}":`, error);
            }
         }
      }, 3000)
   }

   removeNulls(obj) {
      for (const key in obj) {
         if (obj[key] == null || key === 'null') {
            console.log('--> deleting Object key:', key, 'with value:', obj[key]);
            delete obj[key]; // Remove the property if it's null
         } else if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
            // If it's a nested object, recursively remove nulls from it
            this.removeNulls(obj[key]);

            // After recursion, check if the nested object is now empty, and delete if so
            if (Object.keys(obj[key]).length === 0) {
                  delete obj[key];
            }
         }
      }
      return obj;
   }

   async getJobSubmissionManifest(submissionId, location = 'repository') {
      await this.logon();
      const apiUrl = `https://${this.host}/lsaf/api`;
      let requestOptions, response, manifestPath, data;
      // Get manifest metadata
      requestOptions = {
         method: 'get',
         url: apiUrl + `/jobs/submissions/${submissionId}/manifest`,
         headers: {
            "X-Auth-Token": this.authToken
         },
         maxRedirects: 5 
      };
      try {
         response = await axios.request(requestOptions);
      } catch (error) {
         console.error('(getJobSubmissionManifest) Http request failed:', error);
         debugger;
         throw new Error('(getJobSubmissionManifest) Http request failed:', error.message);
      }
      console.log('response.status:', response.status, response.statusText);
      if (!response.status === 200) {
         const responseText = response.data;
         console.log("responseText:", responseText);
         vscode.window.showErrorMessage(`HTTP error retrieving job submission manifest! submissionId: ${submissionId}, Status: ${response.status}  ${response.statusText}`);
         throw new Error(`HTTP error retrieving job submission manifest! submissionId: ${submissionId}, Status: ${response.status}  ${response.statusText}`);
      }
      const contentType = response.headers['content-type'];
      console.log('contentType:', contentType);
      if (response.headers['content-type'].match(/\bjson\b/)) {
         manifestPath = response.data.path;
         location = location || response.data.schematype;
         console.log('response.data:', response.data);
         console.log('location:', location, 'manifestPath:', manifestPath);
         // Get manifest contents
         requestOptions.url = apiUrl + `/${location}/files${manifestPath}?component=contents`;
         console.log('requestOptions.url:', requestOptions.url);
         try {
            response = await axios.request(requestOptions);
            console.log('response.status:', response.status, response.statusText);
            if (!response.status === 200) {
               const responseText = response.data;
               console.log("responseText:", responseText);
               vscode.window.showErrorMessage(`HTTP error retrieving job submission manifest! submissionId: ${submissionId}, Status: ${response.status}  ${response.statusText}`);
               throw new Error(`HTTP error retrieving job submission manifest! submissionId: ${submissionId}, Status: ${response.status}  ${response.statusText}`);
            }
            const contentType = response.headers['content-type'];
            console.log('contentType:', contentType);
            if (contentType === 'application/octet-stream;charset=UTF-8'
               && /^<\?xml /.test(response.data)
            ) {
               data = await this.parseManifestXml (response.data);
            }
            console.log('response.status:', response.status, response.statusText);
         } catch (error) {
            console.error('Http request failed retrieving manifest contents:', error);
            debugger;
            throw new Error('Http request failed retrieving manifest contents:', error.message);
         }
         console.log('response.status:', response.status, response.statusText);
         if (!response.status === 200) {
            const responseText = response.data;
            console.log("responseText:", responseText);
            vscode.window.showErrorMessage(`HTTP error retrieving job submission manifest! submissionId: ${submissionId}, Status: ${response.status}  ${response.statusText}`);
            throw new Error(`HTTP error retrieving job submission manifest! submissionId: ${submissionId}, Status: ${response.status}  ${response.statusText}`);
         }
         const contentType = response.headers['content-type'];
         console.log('contentType:', contentType);
      }
      return data;
   }

   async getUrlFromManifestItem(o, origin, retry=2) {
      // let headUrl;
      let contentsUrl, propertiesUrl, versionsUrl, properties, id, date, versioned, version;
      if (o["repository-file"]) {
         id = o["repository-file"][0].$.id;
         date = o["repository-file"][0].$.date;
         propertiesUrl =  `${origin}/lsaf/api/repository/files${o["repository-file"][0]._}?component=properties`;
         contentsUrl =  `${origin}/lsaf/api/repository/files${o["repository-file"][0]._}?component=contents`;
         versionsUrl =  `${origin}/lsaf/api/repository/files${o["repository-file"][0]._}?component=versions`;
      } else if (o["workspace-file"]) {
         id = o["workspace-file"][0].$.id;
         date = o["workspace-file"][0].$.date;
         propertiesUrl =  `${origin}/lsaf/api/workspace/files${o["workspace-file"][0]._}?component=properties`;
         contentsUrl =  `${origin}/lsaf/api/workspace/files${o["workspace-file"][0]._}?component=contents`;
         versionsUrl =  `${origin}/lsaf/api/workspace/files${o["workspace-file"][0]._}?component=versions`;
      } else {
         debugger;
         console.log('(getUrlFromManifest) unexpected Object.keys(o):', Object.keys(o));
         console.log('o:', o);
      }
      let exists = false;
      try {
         properties = await axios.get(propertiesUrl, { headers: { "X-Auth-Token": this.authToken }, maxRedirects: 5 });
         if (properties.status === 200) {
            if (properties?.data?.id === id && properties?.data?.lastModified === date) {
               exists = true;
               versioned = properties.data.versioned;
               console.log('versioned:', versioned);
               if (versioned) {
                  const versions = await axios.get(versionsUrl, { headers: { "X-Auth-Token": this.authToken }, maxRedirects: 5 });
                  console.log('versions:', versions);
                  const v = versions.data.filter(v => v?.id === id)[0];
                  version = v?.version || '';
                  console.log('version:', v);
                  debugger ;
                  console.log('version:', version);
               } else {
                  version = "";
               }
               if (version) contentsUrl = contentsUrl + `&version=${version}`
            }
            console.log('properties:', properties);
            console.log('');
         }
      } catch(error) {
         if (error.code === "ECONNRESET" && retry > 0) {
            retry = retry -1;
            this.logon();
            return this.getUrlFromManifestItem(o, origin, retry);
         } else {
            //debugger;
            console.log('(getUrlFromManifestItem) error:', error.message);
         }
      }
      return {contentsUrl, exists};
   }

   async parseManifestXml (xmldata) {
      let manifestContent, manifestOutputs, manifestLog, manifestLst, manifestInputs, manifestInputExternalRefs;
      let manifestOutputExternalRefs, manifestPrograms, manifestParameters, manifestMetrics, submission, data;
      let location;
      if (/\/repo\//.test(this.config.remoteEndpoint.url)) {
         location = 'repository';
      } else if (/\/work\//.test(this.config.remoteEndpoint.url)) {
         location = 'workspace';
      }
      const getUrl = async o => ({
         path: o["repository-file"][0]._,
         ...o["repository-file"][0].$,
         ...(await this.getUrlFromManifestItem(o, `https://${this.host}`))
      });
      manifestContent = await this.parseXmlString(xmldata); 
      console.log('manifestContent:', manifestContent);
      if (manifestContent.manifest) {
         manifestOutputs = manifestContent.manifest.outputs[0].file.map(o => ({
            ...o.$,
            path: new URL(o.$.uri).pathname,
            contentsUrl: `https://${this.host}/lsaf/api/${location}/files${new URL(o.$.uri).pathname}?component=contents`
         }));
         console.log('manifestOutputs:', manifestOutputs);
         manifestInputs = manifestContent.manifest.inputs[0].file.map(o => ({
            ...o.$,
            path: new URL(o.$.uri).pathname,
            contentsUrl: `https://${this.host}/lsaf/api/${location}/files${new URL(o.$.uri).pathname}?component=contents`
         }));
         console.log('manifestInputs:', manifestInputs);
         manifestPrograms = manifestContent.manifest.tasks[0].file.map(o => ({
            ...o.$,
            path: new URL(o.$.uri).pathname,
            contentsUrl: `https://${this.host}/lsaf/api/${location}/files${new URL(o.$.uri).pathname}?component=contents`
         }));
         console.log('manifestPrograms:', manifestPrograms);
         manifestLog = {
            ...manifestContent.manifest.log[0].$,
            contentsUrl: `https://${this.host}/lsaf/api/${location}/files${new URL(manifestContent.manifest.log[0].$.uri).pathname}?component=contents`
         }
         console.log('manifestLog:', manifestLog);
         manifestLst = {
            ...manifestContent.manifest.lst[0].$,
            contentsUrl: `https://${this.host}/lsaf/api/${location}/files${new URL(manifestContent.manifest.lst[0].$.uri).pathname}?component=contents`
         }
         console.log('manifestLst:', manifestLst);
         data = {
            submission,
            metrics: manifestMetrics,
            programs: manifestPrograms,
            parameters: manifestParameters,
            log: manifestLog,
            lst: manifestLst,
            outputs: manifestOutputs,
            outputExternalRefs: manifestOutputExternalRefs,
            inputs: manifestInputs,
            inputExternalRefs: manifestInputExternalRefs
         }
      } else {
         manifestOutputs = (await Promise.allSettled(manifestContent["job-manifest"].job[0].outputs[0].output.map(getUrl))).map(o => o.value);
         console.log('manifestOutputs:', manifestOutputs);
         manifestLog = (await Promise.allSettled(manifestContent["job-manifest"].job[0].logs[0].log.map(getUrl))).map(o => o.value)[0];
         console.log('manifestLog:', manifestLog);
         manifestLst = (await Promise.allSettled(manifestContent["job-manifest"].job[0].results[0].result.map(getUrl))).map(o => o.value)[0];
         console.log('manifestLst:', manifestLst);
         manifestInputs = (await Promise.allSettled(manifestContent["job-manifest"].job[0].inputs[0].input.map(getUrl)))
            .map(o => o.value)
            .filter(o => o != null)
            ;
         manifestInputExternalRefs = manifestContent["job-manifest"].job[0].inputs[0]["external-ref"].map(p => p.$);
         manifestOutputExternalRefs = manifestContent["job-manifest"].job[0].outputs[0]["external-ref"].map(p => p.$);
         console.log('manifestInputs:', manifestInputs);
         manifestPrograms = (await Promise.allSettled(manifestContent["job-manifest"].job[0].programs[0].program.map(getUrl))).map(o => o.value);
         console.log('manifestPrograms:', manifestPrograms);
         manifestParameters = {};
         for (const key in manifestContent["job-manifest"].job[0].parameters[0]) {
            manifestParameters = { 
            ...manifestParameters,
            [key]: manifestContent["job-manifest"].job[0].parameters[0][key].map(p => ({...p.$, value: p._ || ''}))}
         }
         manifestMetrics = {
            transferMetrics: manifestContent["job-manifest"].metrics[0].transferMetrics[0].transferMetric.map(p => p.$)
         };
         submission = {
            ...manifestContent["job-manifest"]["job-submission"][0].$,
            ...manifestContent["job-manifest"]["job-submission"].reduce((acc, p) => {
                  Object.keys(p).forEach(k => {
                     if (k !== '$') {
                     acc = { ...acc, [k]: p[k][0]}
                     }
                  })
                  return acc;
               }, {})
            };
         delete submission.$;
         data = {
            jobPath: manifestContent["job-manifest"].job[0]['repository-file'][0]._,
            ...manifestContent["job-manifest"].job[0]['repository-file'][0].$,
            "job-manifest-version": manifestContent["job-manifest"].$.version,
            type: manifestContent["job-manifest"].type[0],
            ...(['owner', 'run-as-owner', 'description'].reduce((acc, key) => {
               acc = {...acc, [key]: manifestContent["job-manifest"].job[0][key][0]}
               return acc;
            }, {})),
            ...manifestContent["job-manifest"].$,
            submission,
            metrics: manifestMetrics,
            programs: manifestPrograms,
            parameters: manifestParameters,
            log: manifestLog,
            lst: manifestLst,
            outputs: manifestOutputs,
            outputExternalRefs: manifestOutputExternalRefs,
            inputs: manifestInputs,
            inputExternalRefs: manifestInputExternalRefs
         };
      }
      return data;
   }

} // End of Class RestApi definition


module.exports = { RestApi };
