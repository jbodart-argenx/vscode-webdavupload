const vscode = require("vscode");
const path = require('path');
const os = require('os');
const fs = require('fs');
// const beautify = require("js-beautify");
const isBinaryFile = require("isbinaryfile").isBinaryFile;
const { restApiCompare, restApiDownload, restApiView, restApiDownloadFolderAsZip, restApiZipUploadAndExpand, restApiUpload } = require('./rest-api');
const { RestApi } = require('./rest-api-class');
const { openFile } = require('./openFile');
const beautify = require("js-beautify");
const { showMultiLineText } = require('./multiLineText.js');
const { showTableView } = require('./json-table-view.js');
const { read_sas, read_xpt } = require('./read_sas.js');

async function restApiFolderContents(param, _arg2, config = null) {
   const restApi = new RestApi();
   if (typeof param === 'string') {
      param = vscode.Uri.file(param);
   }
   try {
      if (config && config.localRootPath && config.remoteEndpoint) {
         restApi.config = config;
         if (param instanceof vscode.Uri) {
            console.log('(restApiFolderContents) param:', param);
            restApi.localFile = param;
            restApi.getRemoteFilePath();   // get Remote File Path
         }
      } else {
         await restApi.getEndPointConfig(param);   // based on the passed Uri (if defined)
                                                   // otherwise based on the path of the local file open in the active editor
                                                   // also sets remoteFile
         if (!restApi.config) {
            return;
         }
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
      if (typeof param === 'string') {
         param = vscode.Uri.file(param);
      }
      if (param instanceof vscode.Uri) {
         folderPath = param.fsPath;
      // } else if (typeof param === 'string') {
      //    folderPath = param;
      } else {
         folderPath = null;
      }
      console.log('(restApiFolderContents) Local Folder Path:', folderPath);
      console.log('(restApiFolderContents) restApi.filePath:', restApi.filePath);
      console.log('(restApiFolderContents) restApi.remoteFile:', restApi.remoteFile);
      const remoteFolderPath = new URL(restApi.config.remoteEndpoint.url).pathname
         .replace(/\/lsaf\/webdav\/(work|repo)\//, '/')
         .replace(/\/$/, '') + restApi.remoteFile;
      console.log("(restApiFolderContents) remoteFolderPath:\n", remoteFolderPath);
      console.log("(restApiFolderContents) Folder contents:\n", folderContentsText);

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

console.log('typeof restApiFolderContents:', typeof restApiFolderContents);


async function localFolderContents(param) {
   let folderPath;
   if (typeof param === 'string') {
      param = vscode.Uri.file(param);
   }
   if (param instanceof vscode.Uri) {
      folderPath = param.fsPath;
   // } else if (typeof param === 'string') {
   //    folderPath = param;
   } else {
      folderPath = null;
      console.log('Cannot get local folder contents of ${param}')
      return;
   }

   const restApi = new RestApi();

   try {
      await restApi.getLocalFolderContents(param);
      let folderContents = restApi.localFolderContents;
      let folderContentsText;
      if (typeof folderContents === 'object') {
         folderContentsText = beautify(JSON.stringify(folderContents), {
            indent_size: 2,
            space_in_empty_paren: true,
         });
      } else {
         folderContentsText = folderContents;
      }
      console.log('(localFolderContents) Local Folder Path:', folderPath);
      // console.log('restApi.filePath:', restApi.filePath);   // undefined
      // console.log("(localFolderContents) Folder contents:\n", folderContentsText);

      // vscode.window.showInformationMessage(folderContents);
      if (Array.isArray(folderContents)) {
         const updatedFolderContents = await Promise.all(folderContents.map(async file => {
            const filePath = path.join(folderPath, file.name);
            console.log('filePath:', filePath);
            const fileStat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));  // rejected promise not handled within 1 second: Error: Path provided was not a file!
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

console.log('typeof localFolderContents:', typeof localFolderContents);


// eslint-disable-next-line require-await
async function showFolderView(folderPath, folderContents, isLocal, config) {
   console.log('(showFolderView) folderPath:', folderPath);
   console.log('(showFolderView) isLocal:', isLocal)
   console.log('(showFolderView) folderPath:', folderPath);

   const panel = vscode.window.createWebviewPanel(
      "folderContents",  // webview identifier
      // `${isLocal ? "Local" : "Remote "+config.label} Folder Contents`,
      `${path.basename(folderPath)}/${isLocal ? "" : " ("+config.label+")"}`, // title displayed
      vscode.ViewColumn.One,
      {
         enableScripts: true, // Allow running JavaScript in the Webview
      }
   );

   // provide more details in tooltip displayed when hovering over the tooltip - does not work!
   panel.title = `${path.basename(folderPath)}/${isLocal ? "" : " ("+config.label+")"}`;
   panel.description = `${isLocal ? "local: " : config.label+": "}${folderPath}/`;

   // Set the HTML content
   panel.webview.html = getOneFolderWebviewContent(folderPath, isLocal, folderContents, config);

   // Handle messages from the Webview
   panel.webview.onDidReceiveMessage(
      async (message) => {
         // debugger ;
         console.log('(showFolderView) message:', message);
         if (typeof message.filePath === 'string') {
            message.filePath = message.filePath.replace(/[/\\]$/, '');  // remove trailing (back)slash(es)
         }
         const fileUri = vscode.Uri.file(message.filePath);
         const ext = path.extname(message.filePath).toLowerCase();
         try {
            switch (message.command) {
               case "openFolder":
                  if (config?.remoteEndpoint?.url && config?.workspaceFolder) { // Remote folder
                     const remotePathPrefix = new URL(config.remoteEndpoint.url).pathname.replace(/\/lsaf\/webdav\/(work|repo)(?=\/)/, '').replace(/\/$/, '');
                     console.log('(showFolderView) remotePathPrefix:', remotePathPrefix);
                     // const localPath = path.join(config.workspaceFolder?.uri?.fsPath || config.workspaceFolder,
                     //    config?.localRootPath,
                     //    `|${message.filePath}`.replace(`|${remotePathPrefix}`, '').replace('|', '')
                     // );
                     const localPath = vscode.Uri.joinPath(config.workspaceFolder?.uri || vscode.Uri.parse(config.workspaceFolder),
                        config?.localRootPath?.path || config?.localRootPath,
                        `|${message.filePath}`
                           .replace(`|${remotePathPrefix}`, '')
                           .replace(`|${path.posix.normalize(remotePathPrefix).replaceAll('/', '\\')}`, '')
                           .replace(`|${path.posix.normalize(remotePathPrefix).replaceAll('\\', '/')}`, '')
                           .replace('|', '')
                     );
                     console.log('(showFolderView) localPath:', localPath);
                     let localPathExists = false;
                     try {
                        if (localPath instanceof vscode.Uri){
                           await vscode.workspace.fs.stat(localPath);
                        } else {
                           await fs.promises.stat(localPath);
                        }
                        localPathExists = true;
                        console.log(`localPath exists: ${localPath}`);
                     } catch (error) {
                        console.log(`localPath does not exist: ${localPath},`, error);
                     } 
                     const actions = ['View', 'Download as Zip file'];
                     if (localPathExists) {
                        actions.push('Download & Expand (overwrite) ⚠');
                        actions.push('Compare Local to Remote');
                     } else { 
                        actions.push('Download  & Expand (new)')
                     }
                     const action = await vscode.window.showQuickPick(actions,
                        {
                           title: `Choose action for ${config.label} ${message.filePath}`,
                           placeHolder: "",
                           canPickMany: false,
                           ignoreFocusOut: false
                        });
                     if (action == null) {  // cancelled
                        return;
                     } else if (action.indexOf('Compare') > -1) {
                        return compareFolderContents(localPath, config);
                     } else if (action.indexOf('Download') > -1) {
                        const expand = /expand/i.test(action) || null;
                        return restApiDownloadFolderAsZip(localPath, config, expand, /overwrite/i.test(action));
                     } else if (action === 'View') {
                        // remote folder default action: Open or View
                        if (localPath instanceof vscode.Uri) {
                           restApiFolderContents(localPath, null, config);
                        } else {
                           restApiFolderContents(vscode.Uri.parse(localPath), null, config);
                        }
                     } else {
                        const msg = `Action not yet implemented: ${action} for ${config.label} remote file: ${message.filePath}`;
                        console.log(msg);
                        vscode.window.showWarningMessage(msg);
                     }
                  } else {
                     // Ask what to do with local folder: Open, Upload, Compare to Remote ?
                     const action = await vscode.window.showQuickPick(['Open', 'Upload', 'Compare to Remote'],
                        {
                           title: `Choose action for ${config?.label || 'local'} ${message.filePath}`,
                           placeHolder: "",
                           canPickMany: false,
                           ignoreFocusOut: false
                        });
                     if (action == null) {  // cancelled
                        return;
                     } else if (action === 'Upload') {
                        let remoteConfig = config;
                        if (config?.remoteLabel && config?.label === 'local') {
                           remoteConfig.label = config.remoteLabel;
                        }
                        return restApiZipUploadAndExpand(message.filePath, remoteConfig);
                     } else if (action === 'Compare to Remote') {
                        return compareFolderContents(message.filePath, config);
                     } else if (action === 'Open') {
                        const fileUri = vscode.Uri.file(message.filePath);
                        localFolderContents(fileUri);
                     }
                  }
                  break;

               case "openFile":
                  // debugger ;
                  if (config?.remoteEndpoint?.url && config?.workspaceFolder) { // Remote folder
                     const remotePathPrefix = new URL(config.remoteEndpoint.url).pathname.replace(/\/lsaf\/webdav\/(work|repo)(?=\/)/, '').replace(/\/$/, '');
                     // const localPath = path.join(config.workspaceFolder?.uri?.path || config.workspaceFolder,
                     //    config?.localRootPath?.path || config?.localRootPath,
                     //    `|${message.filePath}`.replace(`|${remotePathPrefix}`, '').replace('|', '')
                     // );
                     const localPath = vscode.Uri.joinPath(config.workspaceFolder?.uri || vscode.Uri.parse(config.workspaceFolder),
                        config?.localRootPath?.path || config?.localRootPath,
                        `|${message.filePath}`
                           .replace(`|${remotePathPrefix}`, '')
                           .replace(`|${path.posix.normalize(remotePathPrefix).replaceAll('/', '\\')}`, '')
                           .replace(`|${path.posix.normalize(remotePathPrefix).replaceAll('\\', '/')}`, '')
                           .replace('|', '')
                     );
                     let localPathExists = false;
                     try {
                        if (localPath instanceof vscode.Uri){
                           await vscode.workspace.fs.stat(localPath);
                        } else {
                           await fs.promises.stat(localPath);
                        }
                        localPathExists = true;
                        console.log(`localPath exists: ${localPath}`);
                     } catch (error) {
                        console.log(`localPath does not exist: ${localPath},`, error);
                     } 
                     const actions = ['View'];
                     if (localPathExists) {
                        actions.push('Download (overwrite) ⚠');
                        actions.push('Compare Local to Remote');
                     } else { 
                        actions.push('Download (new)')
                     }
                     // Ask what to do with remote file: download, compare to local, delete ?
                     const action = await vscode.window.showQuickPick(actions,
                        {
                           title: `Choose action for ${config.label} ${message.filePath}`,
                           placeHolder: "",
                           canPickMany: false,
                           ignoreFocusOut: false
                        });
                     if (action == null) {  // cancelled
                        return;
                     } 
                     if (action === 'Compare Local to Remote') {
                        return restApiCompare(localPath, config);
                     } else if (action.split(' ')[0] === 'Download') {
                        return restApiDownload(localPath, config, /overwrite/i.test(action));
                     } else if (action === 'View') {
                        return restApiView(localPath, config, message?.fileMd5sum);  // View Remote Folder
                     } else {
                        const msg = `(showFolderView) Action not yet implemented: ${action} for ${config?.label} remote file: ${message.filePath}`;
                        console.log(msg);
                        vscode.window.showWarningMessage(msg);
                     };
                  } else {  // Local file
                     // const fileStat = await vscode.workspace.fs.stat(vscode.Uri.file(fPath));
                     const fileStat = await vscode.workspace.fs.stat(fileUri);
                     let itemType, isBinary;
                     if (fileStat.type === vscode.FileType.File) {
                        // Ask what to do with local file: Open, Upload, Compare to Remote ?
                        const action = await vscode.window.showQuickPick(['Open', 'Upload', 'Compare to Remote'],
                           {
                              title: `Choose action for ${config?.label || 'local'} ${message.filePath}`,
                              placeHolder: "",
                              canPickMany: false,
                              ignoreFocusOut: false
                           });
                        if (action == null) {  // cancelled
                           return;
                        } else if (action === 'Upload') {
                           let remoteConfig = config;
                           if (config?.remoteLabel && config?.label === 'local') {
                              remoteConfig.label = config.remoteLabel;
                           }
                           return restApiUpload(message.filePath, remoteConfig);
                        } else if (action === 'Compare to Remote') {
                           return restApiCompare(message.filePath, config);
                        } else if (action === 'Open') {
                           itemType = 'file';
                           let data;
                           // Local file action (default: 'Open')
                           switch (ext) {
                              case '.docx':
                              case '.html':
                              case '.md':
                                 vscode.commands.executeCommand('vscode.open', fileUri);
                                 break;
                              case '.pdf':
                              case '.xlsx':
                              case '.xls':
                              case '.rtf':
                                    openFile(fileUri);
                                 break;
                              case '.sas7bdat':
                                 data = await read_sas(message.filePath);
                                 console.log(beautify(JSON.stringify(data)));
                                 showTableView(`Imported SAS data from local file: ${message.filePath}`, data);
                                 showMultiLineText(beautify(JSON.stringify(data)), "Imported SAS data", `from local file: ${message.filePath}`);
                                 break;
                              case '.xpt':
                                 data = await read_xpt(message.filePath);
                                 console.log(beautify(JSON.stringify(data)));
                                 showTableView(`Imported SAS Xpt from local file: ${message.filePath}`, data);
                                 showMultiLineText(beautify(JSON.stringify(data)), "Imported SAS Xpt", `from local file: ${message.filePath}`);
                                 break;
                              default:
                                 isBinary = await isBinaryFile(message.filePath);
                                 if (! isBinary) {
                                    // Open the local file in the editor
                                    const document = await vscode.workspace.openTextDocument(fileUri);
                                    vscode.window.showTextDocument(document);
                                 } else {
                                    openFile(fileUri);
                                 }
                                 break;
                           }
                        }
                     } else {
                        return vscode.window.showWarningMessage(`folderView: "${message.filePath}" is not a file, but a ${itemType}!`);
                     }
                  }
                  break;
               case("refresh"): 
                  // folderPath, folderContents, isLocal, config
                  if (isLocal) {
                     try {
                        const restApi = new RestApi();
                        restApi.config = config;
                        await restApi.getLocalFolderContents(folderPath);
                        let folderContents = restApi.localFolderContents;
                        console.log('Local Folder Path:', folderPath);
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
                           // Set the updated HTML content
                           panel.webview.html = getOneFolderWebviewContent(folderPath, isLocal, updatedFolderContents, config);
                        }
                     } catch (error) {
                        console.log(error)
                     }
                  } else {
                     try {
                        const restApi = new RestApi();
                        restApi.config = config;
                        const url = new URL(restApi.config.remoteEndpoint.url);
                        restApi.host = url.hostname;
                        restApi.remoteFile = folderPath;
                        const remotePathPrefix = new URL(config.remoteEndpoint.url).pathname.replace(/\/lsaf\/webdav\/(work|repo)(?=\/)/, '').replace(/\/$/, '');
                        // let localPath = path.join(config.workspaceFolder?.uri?.fsPath || config.workspaceFolder,
                        //    config?.localRootPath,
                        //    `|${message.filePath}`.replace(`|${path.posix.normalize(remotePathPrefix)}`, '').replace('|', '')
                        //    );
                        let localPath = vscode.Uri.joinPath(config.workspaceFolder?.uri || vscode.Uri.parse(config.workspaceFolder),
                           config?.localRootPath?.path || config?.localRootPath,
                           `|${message.filePath}`
                              .replace(`|${path.posix.normalize(remotePathPrefix)}`, '')
                              .replace(`|${path.posix.normalize(remotePathPrefix).replaceAll('/', '\\')}`, '')
                              .replace(`|${path.posix.normalize(remotePathPrefix).replaceAll('\\', '/')}`, '')
                              .replace('|', '')
                           );
                        restApi.localFile = localPath;
                        restApi.getRemoteFilePath();   // remove remotePathPrefix from restApi.remoteFile
                        await restApi.getRemoteFolderContents(localPath);
                        let updatedFolderContents = restApi.remoteFolderContents.items.map(file => {
                           return ({
                              ...file,
                              name: file.name.toString() + (file.schemaType === 'folder' ? '/' : ''),
                              path: (file.path != null ? file.path : path.join(folderPath, file.name)),
                              mtime: file.mtime ?? file.lastModified,
                              size: file.size ?? 0,
                              md5sum: (file.digest || file.md5sum || '').toLowerCase()
                           });
                        });
                        // Set the updated HTML content
                        panel.webview.html = getOneFolderWebviewContent(folderPath, isLocal, updatedFolderContents, config);
                     } catch (error) {
                        console.log(error)
                     }
                  }
                  break;
            }
         } catch (error) {
            console.log('(showFolderView) message:', message);
            console.log(`Failed to open file: ${error.message}`);
            debugger;
            vscode.window.showErrorMessage(
               `Failed to open file: ${error.message}`
            );
         }
      },
      undefined,
      undefined
   );

}


function getOneFolderWebviewContent(folderPath, isLocal, files, config) {

   return `
      <html>
         <head>
         <style>
            h2 {
               word-wrap: break-word; /* Ensures long strings break */
            }
            table {
               table-layout: fixed;
               width: 100%;
               border-collapse: separate;
               border-spacing: 3px 0; 
            }
            th, td {
               padding: 2px;
               text-align: left;
               border-bottom: 1px solid #ddd;
            }
            th {
               cursor: pointer;
            }
            /* Apply these styles to all cells in the first column */
            td:nth-child(1), th:nth-child(1) {
               overflow: hidden;
               white-space: nowrap;
               /*
               text-overflow: ellipsis;
               max-width: 30%; 
               */
            }
            td:nth-child(2), th:nth-child(2) { 
               text-align: end;  
            }
            td:nth-child(3), th:nth-child(3), td:nth-child(4), th:nth-child(4) { 
               overflow: hidden;
               white-space: nowrap;
               margin-right: 2px;
            }
            .refresh-btn {
               background-color: transparent;
               padding: 2px 2px;
               color: grey;
               border: none;
               border-radius: 4px;
               cursor: pointer;
            }
         </style>
         </head>
         <body>
         <h2>Contents of ${isLocal ? "local" : config.label} folder: ${folderPath}
            <button class="refresh-btn" id="refreshBtn">⭮</button>
            <span style="color: grey; font-size: 50%;">${new Date()}</span>
         </h2>
         <table id="folderTable">
            <colgroup>
               <col style="width: 50%;">
               <col style="width: 10%;">
               <col style="width: 8ch;">
               <col style="width: 8ch;">
            </colgroup>
            <thead>
               <tr>
               <th onclick="sortTable(0)">Name</th>
               <th onclick="sortTable(1)">Size</th>
               <th onclick="sortTable(2)">Last Modified</th>
               <th onclick="sortTable(3)">MD5sum</th>
               </tr>
            </thead>
            <tbody>
               ${files
               .map(
                  (file) => `
                  <tr>
                     <td><a href="#" class="${/\/$/.test(file.name) ? 'folder-link' : 'file-link'}" data-path="${file.path}|${file.md5sum}">${file.name}</a></td>
                     <td>${file.size}</td>
                     <td>${file.mtime}</td>
                     <td>${file.md5sum}</td>
                  </tr>
                  `
               )
               .join("")}
            </tbody>
         </table>

         <script>
            const vscode = acquireVsCodeApi();

            document.querySelectorAll('.file-link').forEach(link => {
               link.addEventListener('click', event => {
               event.preventDefault();
               const [filePath, fileMd5sum] = event.target.getAttribute('data-path').split('|');
               vscode.postMessage({
                  command: 'openFile',
                  filePath: filePath,
                  fileMd5sum: fileMd5sum
               });
               });
            });

            document.querySelectorAll('.folder-link').forEach(link => {
               link.addEventListener('click', event => {
               event.preventDefault();
               const filePath = event.target.getAttribute('data-path');
               vscode.postMessage({
                  command: 'openFolder',
                  filePath: filePath
               });
               });
            });

            document.getElementById('refreshBtn').addEventListener('click', () => {
               vscode.postMessage({
                  command: 'refresh',
                  filePath: "${folderPath.replaceAll('\\', '\\\\')}"
               });
            });

            function sortTable(n) {
               const table = document.getElementById("folderTable");
               let switching = true, rows, i, x, y, xVal, yVal, shouldSwitch, dir = "asc", switchCount = 0;
               while (switching) {
                  switching = false;
                  rows = table.rows;
                  for (i = 1; i < (rows.length - 1); i++) {
                     shouldSwitch = false;
                     x = rows[i].getElementsByTagName("TD")[n];
                     y = rows[i + 1].getElementsByTagName("TD")[n];
                     xVal = (x?.textContent || '').trim().toLowerCase();
                     yVal = (y?.textContent || '').trim().toLowerCase();

                     // Check if both values are numeric
                     const xNum = xVal === '' ? -1 : parseFloat(xVal);
                     const yNum = yVal === '' ? -1 : parseFloat(yVal);
                     const bothNumeric = !isNaN(xNum) && !isNaN(yNum)  && !xVal.match(/[^\\d]/i);                     

                     if (dir === "asc") {
                        if (bothNumeric) {
                           if (xNum > yNum) {
                              shouldSwitch = true;
                              break;
                           }
                        } else {
                           if (xVal > yVal) {
                              shouldSwitch = true;
                              break;
                           }
                        }
                     } else if (dir === "desc") {
                        if (bothNumeric) {
                           if (xNum < yNum) {
                              shouldSwitch = true;
                              break;
                           }
                        } else {
                           if (xVal < yVal) {
                              shouldSwitch = true;
                              break;
                           }
                        }
                     }
                  }
                  if (shouldSwitch) {
                     rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
                     switching = true;
                     switchCount++;
                  } else {
                     if (switchCount === 0 && dir === "asc") {
                     dir = "desc";
                     switching = true;
                     }
                  }
               }
            }

         </script>
         </body>
      </html>
   `;
}


async function compareFolderContents(param, config = null) {
   let folder1Path, statusMessage;
   if (typeof param === 'string') {
      param = vscode.Uri.file(param);
   }
   if (param instanceof vscode.Uri) {
      folder1Path = param.fsPath;
   // } else if (typeof param === 'string') {
   //    folder1Path = param;
   } else {
      folder1Path = null;
      console.log('(compareFolderContents): Cannot get local folder contents of ${param}');
      return;
   }

   const restApi = new RestApi();
   let bothFoldersContentsText;

   try {
      if (config && config.localRootPath != null && config.remoteEndpoint ) {
         restApi.config = config;
         if (param instanceof vscode.Uri) {
            console.log('(compareFolderContents) param:', param);
            restApi.localFile = param;
            restApi.localFileStat = await vscode.workspace.fs.stat(param);
            restApi.getRemoteFilePath();   // get Remote File Path
         }
      } else {
         await restApi.getEndPointConfig(param);   // based on the passed Uri (if defined)
                                                   // otherwise based on the path of the local file open in the active editor
                                                   // also sets remoteFile
         if (!restApi.config) {
            return;
         }
      }

      vscode.window.withProgress({
         location: vscode.ProgressLocation.Window,
         title: "Processing...",
         cancellable: false
      }, async (progress) => {
         statusMessage = vscode.window.setStatusBarMessage('Fetching first folder contents...');
         progress.report({ message: "Fetching first folder contents...", increment: 10  });

         // folder1 is local Folder
         let folder1Contents, isFolder1Local = true, folder1Config = { ...restApi.config, remoteLabel: restApi.config.label, label: "local" };
         await restApi.getLocalFolderContents(param);
         let localFolderContents = restApi.localFolderContents;
         let localFolderContentsText;
         if (typeof localFolderContents === 'object') {
            localFolderContentsText = beautify(JSON.stringify(localFolderContents), {
               indent_size: 2,
               space_in_empty_paren: true,
            });
         } else {
            localFolderContentsText = localFolderContents;
         }
         console.log('Local Folder Path:', folder1Path);
         // console.log('restApi.filePath:', restApi.filePath);   // undefined
         console.log("Folder contents:\n", localFolderContentsText);
         statusMessage.dispose();

         progress.report({ message: "Fetching other folder contents...", increment: 50  });
         statusMessage = vscode.window.setStatusBarMessage('Fetching other folder contents...');
         // folder2 is remote Folder
         let folder2Path, folder2Contents, isFolder2Local = false, folder2Config = null;
         if (restApi.config?.remoteEndpoint?.url) {
            folder2Config = { ...restApi.config, label: restApi.config.remoteLabel || restApi.config.label };
         } else {
            folder2Config = {};
         }
         const remoteFolderPath = new URL(restApi.config.remoteEndpoint.url).pathname
            .replace(/\/lsaf\/webdav\/(work|repo)\//, '/')
            .replace(/\/$/, '') + restApi.remoteFile;
         console.log("remoteFolderPath:\n", remoteFolderPath);
         folder2Path = remoteFolderPath;
         await restApi.getRemoteFolderContents(param);
         statusMessage.dispose();

         
         progress.report({ message: "Comparing contents...", increment: 80  });
         statusMessage = vscode.window.setStatusBarMessage('Comparing contents...');
         let remoteFolderContents = restApi.remoteFolderContents;
         // folder2Config = restApi.config;
         let remoteFolderContentsText;
         if (typeof remoteFolderContents === 'object') {
            remoteFolderContentsText = beautify(JSON.stringify(remoteFolderContents), {
               indent_size: 2,
               space_in_empty_paren: true,
            });
            if (remoteFolderContents.items) {
               remoteFolderContents = remoteFolderContents.items;
            }
         } else {
            remoteFolderContentsText = remoteFolderContents;
         }
         console.log('Remote Folder Path:', folder2Path);
         console.log("Remote contents:\n", remoteFolderContentsText);


         if (Array.isArray(localFolderContents) && Array.isArray(remoteFolderContents)) {
            folder1Contents = await Promise.all(localFolderContents.map(async file => {
               const fPath = path.join(folder1Path, file.name);
               console.log('folder1Path:', fPath);
               const fileStat = await vscode.workspace.fs.stat(vscode.Uri.file(fPath));  // rejected promise not handled within 1 second: Error: Path provided was not a file!
               const newFile = {
                  ...file,
                  name: file.name.toString() + (fileStat.type === vscode.FileType.Directory ? '/' : ''),
                  path: file.path != null ? file.path : path.join(folder1Path, file.name),
                  mtime: file.mtime ?? file.lastModified,
                  size: file.size ?? 0
               };
               return newFile;
            }));
            folder2Contents = remoteFolderContents.map(file => {
               return ({
                  ...file,
                  name: file.name.toString() + (file.schemaType === 'folder' ? '/' : ''),
                  path: (file.path != null ? file.path : path.join(remoteFolderPath, file.name)),
                  mtime: file.mtime ?? file.lastModified,
                  size: file.size ?? 0,
                  md5sum: (file.digest || file.md5sum || '').toLowerCase()
               });
            });
            const folder1Names = new Set([...(folder1Contents.map(folder => folder.name))]);
            const folder2Names = new Set([...(folder2Contents.map(folder => folder.name))]);
            const uniqueNames = new Set([...folder1Names, ...folder2Names]);
            const bothFoldersContents = [];
            uniqueNames.forEach(name => {
               const folder1index = folder1Contents.findIndex(file => file.name === name);
               const folder2index = folder2Contents.findIndex(file => file.name === name);
               bothFoldersContents.push(
                  {
                     name,
                     name1: folder1Contents[folder1index]?.name || '',
                     size1: folder1Contents[folder1index]?.size || '',
                     mtime1: folder1Contents[folder1index]?.mtime || '',
                     md5sum1: folder1Contents[folder1index]?.md5sum || '',
                     name2: folder2Contents[folder2index]?.name || '',
                     size2: folder2Contents[folder2index]?.size || '',
                     mtime2: folder2Contents[folder2index]?.mtime || '',
                     md5sum2: folder2Contents[folder2index]?.md5sum || folder2Contents[folder2index]?.digest || '',
                  })
            });
            bothFoldersContentsText = beautify(JSON.stringify(bothFoldersContents), {
               indent_size: 2,
               space_in_empty_paren: true,
            });
            statusMessage.dispose();
            progress.report({ message: "Displaying results...", increment: 90  });
            statusMessage = vscode.window.setStatusBarMessage('Displaying results...');
            const webViewReady = true;
            if (webViewReady) {
               showTwoFoldersView(bothFoldersContents,
                  folder1Path, isFolder1Local, folder1Config,
                  folder2Path, isFolder2Local, folder2Config);
            } else {
               showMultiLineText(bothFoldersContentsText,
                  "Both Folders Contents", `Local folder: ${folder1Path}, Remote folder: ${folder2Config.label}: ${remoteFolderPath}`);
            }
            statusMessage.dispose();
         } else {
            showMultiLineText(bothFoldersContentsText,
               "Both Folders Contents", `Local folder: ${folder1Path}, Remote folder: ${folder2Config.label}: ${remoteFolderPath}`);
         }
         statusMessage?.dispose();
         progress.report({ message: "Done.", increment: 100  });
         // Optionally, show a final status message when done
         vscode.window.setStatusBarMessage('Done.', 2000);  // Message disappears after 2 seconds
      });
         
   } catch (err) {
      console.log(err);
      statusMessage?.dispose();
   }
}

console.log('typeof compareFolderContents:', typeof compareFolderContents);


// eslint-disable-next-line require-await
async function showTwoFoldersView(bothFoldersContents, folder1Path, isFolder1Local, folder1Config, folder2Path, isFolder2Local, folder2Config) {

   const panel = vscode.window.createWebviewPanel(
      "folderContents",  // webview identifier
      // `${isLocal ? "Local" : "Remote "+config.label} Folder Contents`,
      `${path.basename(folder1Path)}/${" ("+folder1Config.label+" ↔ "+folder2Config.label+")"}`, // title displayed
      vscode.ViewColumn.One,
      {
         enableScripts: true, // Allow running JavaScript in the Webview
      }
   );

   // provide more details in tooltip displayed when hovering over the tooltip - does not work!
   panel.title = `${path.basename(folder1Path)}/${" ("+folder1Config.label+" ↔ "+folder2Config.label+")"}`;
   panel.description = `${folder1Path}/ (${folder1Config.label}) ↔ ${folder2Path}/ (${folder2Config.label})}`;

   // Set the HTML content
   panel.webview.html = getTwoFoldersWebviewContent(bothFoldersContents, folder1Path, isFolder1Local, folder1Config, folder2Path, isFolder2Local, folder2Config);

   // Handle messages from the Webview
   panel.webview.onDidReceiveMessage(
      async (message) => {
         let folder1Contents, folder2Contents, isBinary;
         console.log(`(showTwoFoldersView) message: ${beautify(JSON.stringify(message))}`);
         // debugger ;
         let fileUri, ext, config, isLocal, isFolder, restApi;
         let folder1Names, folder2Names, uniqueNames, bothFoldersContents, folder1index, folder2index;
         if (message?.filePath) {
            if (typeof message.filePath === 'string') {
               message.filePath = message.filePath.replace(/[/\\]$/, '');  // remove trailing (back)slash(es)
            }
            fileUri = vscode.Uri.file(message?.filePath);
            ext = path.extname(message?.filePath).toLowerCase();
         }
         switch (message?.command) {
            case "openFolder1File":
               isLocal = isFolder1Local;
               isFolder = false;
               if (folder1Config) {
                  config = folder1Config;
               } else {
                  throw new Error("message.command is: \"openFolder1File\", but no config was found");
               }
               break;
            case "openFolder2File":
                  isFolder = false;
                  isLocal = isFolder2Local;
               if (folder2Config) {
                  config = folder2Config;
               } else {
                  throw new Error("message.command is: \"openFolder2File\", but no config was found");
               }
               break;
               case "openFolder1SubFolder":
                  isLocal = isFolder1Local;
                  isFolder = true;
                  if (folder1Config) {
                     config = folder1Config;
                  } else {
                     throw new Error("message.command is: \"openFolder1File\", but no config was found");
                  }
                  break;
               case "openFolder2SubFolder":
                     isFolder = true;
                     isLocal = isFolder2Local;
                  if (folder2Config) {
                     config = folder2Config;
                  } else {
                     throw new Error("message.command is: \"openFolder2File\", but no config was found");
                  }
                  break;
               case("refresh"):
                  restApi = new RestApi();
                  if (isFolder1Local) {
                     await restApi.getLocalFolderContents(folder1Path);
                     folder1Contents = await Promise.all(restApi.localFolderContents.map(async file => {
                        const fPath = path.join(folder1Path, file.name);
                        const fileStat = await vscode.workspace.fs.stat(vscode.Uri.file(fPath));  // rejected promise not handled within 1 second: Error: Path provided was not a file!
                        const newFile = {
                           ...file,
                           name: file.name.toString() + (fileStat.type === vscode.FileType.Directory ? '/' : ''),
                           path: file.path != null ? file.path : path.join(folder1Path, file.name),
                           mtime: file.mtime ?? file.lastModified,
                           size: file.size ?? 0
                        };
                        return newFile;
                     }));
                  } else  {
                     await restApi.getRemoteFolderContents(folder1Path);
                     folder1Contents = restApi.remoteFolderContents.map(file => {
                        return ({
                           ...file,
                           name: file.name.toString() + (file.schemaType === 'folder' ? '/' : ''),
                           path: (file.path != null ? file.path : path.join(folder1Path, file.name)),
                           mtime: file.mtime ?? file.lastModified,
                           size: file.size ?? 0,
                           md5sum: (file.digest || file.md5sum || '').toLowerCase()
                        });
                     });
                  }
                  if (isFolder2Local) {
                     await restApi.getLocalFolderContents(folder2Path);
                     folder2Contents = await Promise.all(restApi.localFolderContents.map(async file => {
                        const fPath = path.join(folder2Path, file.name);
                        const fileStat = await vscode.workspace.fs.stat(vscode.Uri.file(fPath));  // rejected promise not handled within 1 second: Error: Path provided was not a file!
                        const newFile = {
                           ...file,
                           name: file.name.toString() + (fileStat.type === vscode.FileType.Directory ? '/' : ''),
                           path: file.path != null ? file.path : path.join(folder2Path, file.name),
                           mtime: file.mtime ?? file.lastModified,
                           size: file.size ?? 0
                        };
                        return newFile;
                     }));
                  } else  {
                     restApi.remoteFile = folder2Path;
                     restApi.config = folder2Config;
                     restApi.host = new URL(restApi.config.remoteEndpoint.url).host;
                     const remotePathPrefix = new URL(restApi.config.remoteEndpoint.url).pathname.replace(/\/lsaf\/webdav\/(work|repo)(?=\/)/, '').replace(/\/$/, '');
                     // let localPath = path.join(restApi.config.workspaceFolder?.uri?.fsPath || restApi.config.workspaceFolder,
                     //       restApi.config?.localRootPath,
                     //    `|${folder2Path}`.replace(`|${path.posix.normalize(remotePathPrefix)}`, '').replace('|', '')
                     //    );
                     let localPath = vscode.Uri.joinPath(restApi.config.workspaceFolder?.uri || vscode.Uri.parse(restApi.config.workspaceFolder),
                     restApi.config?.localRootPath?.path || restApi.config?.localRootPath,
                        `|${folder2Path}`
                           .replace(`|${path.posix.normalize(remotePathPrefix)}`, '')
                           .replace(`|${path.posix.normalize(remotePathPrefix).replaceAll('/', '\\')}`, '')
                           .replace(`|${path.posix.normalize(remotePathPrefix).replaceAll('\\', '/')}`, '')
                           .replace('|', '')
                        );
                     restApi.localFile = localPath;
                     restApi.getRemoteFilePath();    // remove remotePathPrefix from restApi.remoteFile  
                     await restApi.getRemoteFolderContents(localPath);
                     const remoteFolderContents = restApi.remoteFolderContents?.items || restApi.remoteFolderContents;
                     folder2Contents = remoteFolderContents.map(file => {
                        return ({
                           ...file,
                           name: file.name.toString() + (file.schemaType === 'folder' ? '/' : ''),
                           path: (file.path != null ? file.path : path.join(folder2Path, file.name)),
                           mtime: file.mtime ?? file.lastModified,
                           size: file.size ?? 0,
                           md5sum: (file.digest || file.md5sum || '').toLowerCase()
                        });
                     });
                  }
                  folder1Names = new Set([...(folder1Contents.map(folder => folder.name))]);
                  folder2Names = new Set([...(folder2Contents.map(folder => folder.name))]);
                  uniqueNames = new Set([...folder1Names, ...folder2Names]);
                  bothFoldersContents = [];
                  uniqueNames.forEach(name => {
                     folder1index = folder1Contents.findIndex(file => file.name === name);
                     folder2index = folder2Contents.findIndex(file => file.name === name);
                     bothFoldersContents.push(
                        {
                           name,
                           name1: folder1Contents[folder1index]?.name || '',
                           size1: folder1Contents[folder1index]?.size || '',
                           mtime1: folder1Contents[folder1index]?.mtime || '',
                           md5sum1: folder1Contents[folder1index]?.md5sum || '',
                           name2: folder2Contents[folder2index]?.name || '',
                           size2: folder2Contents[folder2index]?.size || '',
                           mtime2: folder2Contents[folder2index]?.mtime || '',
                           md5sum2: folder2Contents[folder2index]?.md5sum || folder2Contents[folder2index]?.digest || '',
                        })
                  });
                  folder1Config = { ...restApi.config, remoteLabel: restApi.config.label, label: "local" };
                  panel.webview.html = getTwoFoldersWebviewContent(
                     bothFoldersContents,
                     folder1Path, isFolder1Local, folder1Config,
                     folder2Path, isFolder2Local, folder2Config
                  );
               return;
            default:
               break;
         }
         console.log(`(showTwoFoldersView) isLocal: ${isLocal}, isFolder: ${isFolder}, message?.command: ${message?.command}`);
         if (isLocal) { // local folder
            try {
               if (isFolder) {
                  // Ask what to do with local folder: Open, Upload, Compare to Remote ?
                  const action = await vscode.window.showQuickPick(['Open', 'Upload', 'Compare to Remote'],
                     {
                        title: `Choose action for ${config.label} ${message.filePath}`,
                        placeHolder: "",
                        canPickMany: false,
                        ignoreFocusOut: false
                     });
                  if (action == null) {  // cancelled
                     return;
                  } else if (action === 'Upload') {
                     let remoteConfig = config;
                     if (config.remoteLabel && config.label === 'local') {
                        remoteConfig.label = config.remoteLabel;
                     }
                     return restApiZipUploadAndExpand(message.filePath, remoteConfig);
                  } else if (action === 'Compare to Remote') {
                     return compareFolderContents(message.filePath, config);
                  } else if (action === 'Open') {
                     const fileUri = vscode.Uri.file(message.filePath);
                     localFolderContents(fileUri);
                  }
               } else {
                  // Ask what to do with local file: Open, Upload, Compare to Remote ?
                  const action = await vscode.window.showQuickPick(['Open', 'Upload', 'Compare to Remote'],
                     {
                        title: `Choose action for ${config.label} ${message.filePath}`,
                        placeHolder: "",
                        canPickMany: false,
                        ignoreFocusOut: false
                     });
                  if (action == null) {  // cancelled
                     return;
                  } else if (action === 'Upload') {
                     let remoteConfig = config;
                     if (config.remoteLabel && config.label === 'local') {
                        remoteConfig.label = config.remoteLabel;
                     }
                     return restApiUpload(message.filePath, remoteConfig);
                  } else if (action === 'Compare to Remote') {
                     return restApiCompare(message.filePath, config);
                  } else if (action === 'Open') {
                     let data;
                     switch (ext) {
                        case '.docx':
                        case '.html':
                        case '.md':
                           vscode.commands.executeCommand('vscode.open', fileUri);
                           break;
                        case '.pdf':
                        case '.xlsx':
                        case '.xls':
                        case '.rtf':
                              openFile(fileUri);
                           break;
                        case '.sas7bdat':
                           data = await read_sas(message.filePath);
                           console.log(beautify(JSON.stringify(data)));
                           showTableView(`Imported SAS data from local file: ${message.filePath}`, data);
                           showMultiLineText(beautify(JSON.stringify(data)), "Imported SAS data", `from local file: ${message.filePath}`);
                           break;
                        case '.xpt':
                           data = await read_xpt(message.filePath);
                           console.log(beautify(JSON.stringify(data)));
                           showTableView(`Imported SAS Xpt from local file: ${message.filePath}`, data);
                           showMultiLineText(beautify(JSON.stringify(data)), "Imported SAS Xpt", `from local file: ${message.filePath}`);
                           break;
                        default:
                           isBinary = await isBinaryFile(message.filePath);
                           if (! isBinary) {
                              // Open the local file in the editor
                              const document = await vscode.workspace.openTextDocument(fileUri);
                              vscode.window.showTextDocument(document);
                           } else {
                              if (os.platform() === 'win32'){
                                 openFile(fileUri);
                              } else {
                                 vscode.commands.executeCommand('vscode.open', fileUri);
                              }
                           }
                           break;
                     }
                  }
               }
            } catch (error) {
               console.log('(showTwoFoldersView) message:', message);
               console.log(`Failed to open local file: ${error.message}`);
               debugger;
               vscode.window.showErrorMessage(
                  `Failed to open file: ${error.message}`
               );
            }
         } else { // remote folder
            const remotePathPrefix = new URL(config.remoteEndpoint.url).pathname.replace(/\/lsaf\/webdav\/(work|repo)(?=\/)/, '').replace(/\/$/, '');
            let localPath;
            // if (os.platform() === 'win32') {
            //    localPath = path.join(config.workspaceFolder?.uri?.fsPath || config.workspaceFolder,
            //    config?.localRootPath,
            //    `|${message.filePath}`.replace(`|${path.win32.normalize(remotePathPrefix)}`, '').replace('|', '')
            //    );
            // } else {
            //    localPath = path.join(config.workspaceFolder?.uri?.fsPath || config.workspaceFolder,
            //    config?.localRootPath,
            //    `|${message.filePath}`.replace(`|${path.posix.normalize(remotePathPrefix)}`, '').replace('|', '')
            //    );
            // }
            localPath = vscode.Uri.joinPath(config.workspaceFolder?.uri || vscode.Uri.parse(config.workspaceFolder),
                           config?.localRootPath?.path || config?.localRootPath,
                           `|${message.filePath}`
                              .replace(`|${path.posix.normalize(remotePathPrefix).replaceAll('/', '\\')}`, '')
                              .replace(`|${path.posix.normalize(remotePathPrefix).replaceAll('\\', '/')}`, '')
                              .replace('|', '')
                           );
            console.log('(showTwoFoldersView) localPath:', localPath);
            let localPathExists = false;
            try {
               if (localPath instanceof vscode.Uri){
                  await vscode.workspace.fs.stat(localPath);
               } else {
                  await fs.promises.stat(localPath);
               }
               localPathExists = true;
               console.log(`localPath exists: ${localPath}`);
            } catch (error) {
               console.log(`localPath does not exist: ${localPath},`, error);
            } 
            const actions = [];
            if (localPathExists) {
               actions.push('Compare to Local');
               actions.push('Download (overwrite) ⚠');
            } else {
               actions.push('Download (new)');
            }
            try {
               if (isFolder) { // remote subfolder
                        // Ask what to do with remote folder: download, compare to local, delete ?
                        actions.forEach((action, index) => {
                           if (action.indexOf('Download') >= 0) {
                              actions[index] = action.replace('Download', 'Download & Expand');
                           }
                        })
                        actions.push('Open');
                        const action = await vscode.window.showQuickPick(actions,
                           {
                              title: `Choose action for ${config.label} ${message.filePath}`,
                              placeHolder: "",
                              canPickMany: false,
                              ignoreFocusOut: false
                           });
                        if (action == null) {  // cancelled
                           return;
                        } else if (action === 'Compare to Local') {
                           return compareFolderContents(localPath, config);
                        } else if (action.split(' ')[0] === 'Download') {
                           const expand = /expand/i.test(action);
                           return restApiDownloadFolderAsZip(localPath, config, expand, /overwrite/i.test(action));
                        } else if (action === 'Open') {
                           if (localPath instanceof vscode.Uri) {
                              restApiFolderContents(localPath, null, config);
                           } else {
                              restApiFolderContents(vscode.Uri.file(localPath), null, config);
                           }
                        } else {
                           const msg = `(showTwoFoldersView) Action not yet implemented: ${action} for ${message?.config?.label} remote file: ${message.filePath}`;
                           console.log(msg);
                           vscode.window.showWarningMessage(msg);
                        }
               } else {  // remote file

                     // fileUri = vscode.Uri.file(message.filePath);
                     ext = path.extname(message.filePath).toLowerCase();
                     if (message?.config?.remoteEndpoint?.url) {
                        // Ask what to do with remote file: download, compare to local, delete ?
                        actions.push('View');
                        const action = await vscode.window.showQuickPick(actions,
                           {
                              title: `Choose action for ${config.label} ${message.filePath}`,
                              placeHolder: "",
                              canPickMany: false,
                              ignoreFocusOut: false
                           });
                        if (action == null) {  // cancelled
                           return;
                        } else if (action === 'Compare to Local') {
                           console.log(`(showTwoFoldersView) Calling restApiCompare(localPath=${localPath}, config=${beautify(JSON.stringify(config))})`);
                           return restApiCompare(localPath, config);
                        } else if (action.split(' ')[0] === 'Download') {
                           console.log(`(showTwoFoldersView) Calling restApiDownload(localPath=${localPath}, config=${beautify(JSON.stringify(config))}, overwrite=${/overwrite/i.test(action)})`);
                           return restApiDownload(localPath, config, /overwrite/i.test(action));
                        } else if (action === 'View') {
                           console.log(`(showTwoFoldersView) Calling restApiView(localPath=${localPath}, config=${beautify(JSON.stringify(config))})`);
                           return restApiView(localPath, config, message?.fileMd5sum);  // View remote file
                        } else {
                           const msg = `(showTwoFoldersView) Action not yet implemented: ${action} for ${message?.config?.label} remote file: ${message.filePath}`;
                           console.log(msg);
                           vscode.window.showWarningMessage(msg);
                        }
                     } else {
                        console.log("(openFolder2File) Unexpected message:", message);
                     }
               }
            } catch (error) {
               vscode.window.showErrorMessage(`Failed to open remote file: ${error.message}`);
            }
            
         }  
      },
      undefined,
      undefined
   );

}



function getTwoFoldersWebviewContent(bothFoldersContents, folder1Path, isFolder1Local, folder1Config, folder2Path, isFolder2Local, folder2Config) {
   const class1link = `${folder1Config.label}-link`.replaceAll(/\W/g, '-');
   const class2link = `${folder2Config.label}-link`.replaceAll(/\W/g, '-');
   return `
      <html>
         <head>
         <style>
            h2 {
               word-wrap: break-word; /* Ensures long strings break */
            }
            table {
               table-layout: fixed;
               width: 100%;
               border-collapse: separate;
               border-spacing: 3px 0; 
            }
            th, td {
               padding: 2px;
               text-align: left;
               border-bottom: 1px solid #ddd;
            }
            th {
               cursor: pointer;
            }
            /* Apply these styles to all cells in the first column */
            td:nth-child(1), th:nth-child(1), td:nth-child(6), th:nth-child(6) {
               overflow: hidden;
               white-space: nowrap;
               /*
               text-overflow: ellipsis;
               max-width: 30%; 
               */
            }
            td:nth-child(2), th:nth-child(2), td:nth-child(7), th:nth-child(7) { 
               text-align: end;  
            }
            td:nth-child(3), th:nth-child(3), td:nth-child(4), th:nth-child(4),
            td:nth-child(8), th:nth-child(8), td:nth-child(9), th:nth-child(9) { 
               overflow: hidden;
               white-space: nowrap;
               margin-right: 2px;
            }
         /* Assign proportional widths for local, remote, and spacer columns */
         .local-folder, .remote-folder {
            width: 48%;
         }
         .spacer {
            width: 4%; /* Spacer takes up 6% of the total table width */
            background-color: transparent;
            border: none; /* No border for the spacer */
            cursor: auto;
         }
         .folder-header {
            text-align: center;
            font-weight: bold;
         }
         .higher {
            color: #f08080; /* Higher values */
         }
         .lower {
            color: lightblue; /* Lower values */
         }
         .differ {
            color: brown; /* Lower values */
         }
         .refresh-btn {
            background-color: transparent;
            padding: 2px 2px;
            color: grey;
            border: none;
            border-radius: 4px;
            cursor: pointer;
         }
         </style>
         </head>
         <body>
         <h2>${path.basename(folder1Path)}/ (${folder1Config.label} ↔ ${folder2Config.label})
            <button class="refresh-btn" id="refreshBtn">⭮</button>
            <span style="color: grey; font-size: 50%;">${new Date()}</span>
         </h2>
         <table id="folderTable">
            <colgroup>
               <col style="width: 25%;">
               <col style="width: 7%;">
               <col style="width: 9ch;">
               <col style="width: 6ch;">
               <col style="width: 2%;">
               <col style="width: 25%;">
               <col style="width: 7%;">
               <col style="width: 9ch;">
               <col style="width: 6ch;">
            </colgroup>
            <thead>
               <tr>
                  <!-- Headers for Local and Remote sections -->
                  <th colspan="4" class="local-folder folder-header">${folder1Config.label}: ${folder1Path}</th>
                  <th class="spacer"></th> <!-- Spacer column between the two sections -->
                  <th colspan="4" class="remote-folder folder-header">${folder2Config.label}: ${folder2Path}</th>
               </tr>
               <tr>
               <th onclick="sortTable(0)">Name</th>
               <th onclick="sortTable(1)">Size</th>
               <th onclick="sortTable(2)">Last Modified</th>
               <th onclick="sortTable(3)">MD5sum</th>
               <th class="spacer"></th>
               <th onclick="sortTable(5)">Name</th>
               <th onclick="sortTable(6)">Size</th>
               <th onclick="sortTable(7)">Last Modified</th>
               <th onclick="sortTable(8)">MD5sum</th>
               </tr>
            </thead>
            <tbody>
               ${bothFoldersContents
               .map(
                  (file) => `
                  <tr>
                     <td><a href="#" class="${/\/$/.test(file.name1) ? 'folder-' : 'file-'}${class1link}" data-path="${path.join(folder1Path, file.name1)}|${file.md5sum1}">${file.name1}</a></td>
                     <td${file.size1  !== file.size2  ? ' class="'+(file.size1  > file.size2  ? 'higher' : 'lower')+'"' : ''}>${file.size1}</td>
                     <td${file.mtime1 !== file.mtime2 ? ' class="'+(file.mtime1 > file.mtime2 ? 'higher' : 'lower')+'"' : ''}>${file.mtime1}</td>
                     <td${file.md5sum1 !== file.md5sum2 ? ' class="differ"' : ''}>${file.md5sum1}</td>
                     <td class="spacer"> </td> <!-- Spacer column between the two sections -->
                     <td><a href="#" class="${/\/$/.test(file.name2) ? 'folder-' : 'file-'}${class2link}" data-path="${path.join(folder2Path, file.name2)}|${file.md5sum2}">${file.name2}</a></td>
                     <td${file.size1  !== file.size2  ? ' class="'+(file.size1  < file.size2  ? 'higher' : 'lower')+'"' : ''}>${file.size2}</td>
                     <td${file.mtime1 !== file.mtime2 ? ' class="'+(file.mtime1 < file.mtime2 ? 'higher' : 'lower')+'"' : ''}>${file.mtime2}</td>
                     <td${file.md5sum1 !== file.md5sum2 ? ' class="differ"' : ''}>${file.md5sum2}</td>
                  </tr>
                  `
               )
               .join("")}
            </tbody>
         </table>

         <script>
            const vscode = acquireVsCodeApi();

            document.querySelectorAll('.file-${class1link}').forEach(link => {
               link.addEventListener('click', event => {
               event.preventDefault();
               const [filePath, fileMd5sum] = event.target.getAttribute('data-path').split('|');
               msg = {
                  command: 'openFolder1File',
                  filePath: filePath,
                  config: ${JSON.stringify(folder1Config)},
                  fileMd5sum: fileMd5sum
               };
               console.log('vscode.postMessage:', JSON.stringify(msg));
               vscode.postMessage(msg);
               });
            });

            document.querySelectorAll('.folder-${class1link}').forEach(link => {
               link.addEventListener('click', event => {
               event.preventDefault();
               const filePath = event.target.getAttribute('data-path');
               msg = {
                  command: 'openFolder1SubFolder',
                  filePath: filePath,
                  config: ${JSON.stringify(folder1Config)}
               };
               console.log('vscode.postMessage:', JSON.stringify(msg));
               vscode.postMessage(msg);
               });
            });

            document.querySelectorAll('.file-${class2link}').forEach(link => {
               link.addEventListener('click', event => {
               event.preventDefault();
               const [filePath, fileMd5sum] = event.target.getAttribute('data-path').split('|');
               msg = {
                  command: 'openFolder2File',
                  filePath: filePath,
                  config: ${JSON.stringify(folder2Config)},
                  fileMd5sum: fileMd5sum
               };
               console.log('vscode.postMessage:', JSON.stringify(msg));
               vscode.postMessage(msg);
               });
            });

            document.querySelectorAll('.folder-${class2link}').forEach(link => {
               link.addEventListener('click', event => {
               event.preventDefault();
               const filePath = event.target.getAttribute('data-path');
               msg = {
                  command: 'openFolder2SubFolder',
                  filePath: filePath,
                  config: ${JSON.stringify(folder2Config)}
               };
               console.log('vscode.postMessage:', JSON.stringify(msg));
               vscode.postMessage(msg);
               });
            });

            document.getElementById('refreshBtn').addEventListener('click', () => {
               vscode.postMessage({
                  command: 'refresh',
                  folder1Path: "${folder1Path.replaceAll('\\', '\\\\')}",
                  folder1Config: ${JSON.stringify(folder1Config)},
                  isFolder1Local: ${isFolder1Local},
                  folder2Path: "${folder2Path.replaceAll('\\', '\\\\')}",
                  folder2Config: ${JSON.stringify(folder2Config)},
                  isFolder2Local: ${isFolder2Local}
               });
            });

            function sortTable(n) {
               const table = document.getElementById("folderTable");
               let switching = true, rows, i, x, y, xVal, yVal, shouldSwitch, dir = "asc", switchCount = 0;
               while (switching) {
                  switching = false;
                  rows = table.rows;
                  for (i = 1; i < (rows.length - 1); i++) {
                     shouldSwitch = false;
                     x = rows[i].getElementsByTagName("TD")[n];
                     y = rows[i + 1].getElementsByTagName("TD")[n];
                     xVal = (x?.textContent || '').trim().toLowerCase();
                     yVal = (y?.textContent || '').trim().toLowerCase();

                     // Check if both values are numeric
                     const xNum = xVal === '' ? -1 : parseFloat(xVal);
                     const yNum = yVal === '' ? -1 : parseFloat(yVal);
                     const bothNumeric = !isNaN(xNum) && !isNaN(yNum)  && !xVal.match(/[^\\d]/i);                     

                     if (dir === "asc") {
                        if (bothNumeric) {
                           if (xNum > yNum) {
                              shouldSwitch = true;
                              break;
                           }
                        } else {
                           if (xVal > yVal) {
                              shouldSwitch = true;
                              break;
                           }
                        }
                     } else if (dir === "desc") {
                        if (bothNumeric) {
                           if (xNum < yNum) {
                              shouldSwitch = true;
                              break;
                           }
                        } else {
                           if (xVal < yVal) {
                              shouldSwitch = true;
                              break;
                           }
                        }
                     }
                  }
                  if (shouldSwitch) {
                     rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
                     switching = true;
                     switchCount++;
                  } else {
                     if (switchCount === 0 && dir === "asc") {
                     dir = "desc";
                     switching = true;
                     }
                  }
               }
            }

         </script>
         </body>
      </html>
   `;
}


module.exports = { compareFolderContents, showTwoFoldersView, showFolderView, localFolderContents, restApiFolderContents };