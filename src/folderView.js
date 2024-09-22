const vscode = require("vscode");
const path = require('path');
const fs = require('fs');
const isBinaryFile = require("isbinaryfile").isBinaryFile;
const { restApiCompare, restApiDownload, restApiView, restApiFolderContents, localFolderContents } = require('./rest-api');
const { openFile } = require('./openFile');

export async function showFolderView(folderPath, folderContents, isLocal, config) {

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
   panel.webview.html = getWebviewContent(folderPath, isLocal, folderContents, config);

   // Handle messages from the Webview
   panel.webview.onDidReceiveMessage(
      async (message) => {
         const fileUri = vscode.Uri.file(message.filePath);
         const ext = path.extname(message.filePath).toLowerCase();
         try {
            switch (message.command) {
               case "openFolder":
                  if (config?.remoteEndpoint?.url && config?.workspaceFolder) { // Remote folder
                     const remotePathPrefix = new URL(config.remoteEndpoint.url).pathname.replace(/\/lsaf\/webdav\/(work|repo)(?=\/)/, '').replace(/\/$/, '');
                     const localPath = path.join(config.workspaceFolder?.uri?.fsPath || config.workspaceFolder,
                        config?.localRootPath,
                        `|${message.filePath}`.replace(`|${remotePathPrefix}`, '').replace('|', '')
                     );
                     let localPathExists = false;
                     try {
                        await fs.promises.stat(localPath);
                        localPathExists = true;
                        console.log(`localPath exists: ${localPath}`);
                     } catch (error) {
                        console.log(`localPath does not exist: ${localPath}`);
                     } 
                     const actions = ['View'];
                     if (localPathExists) {
                        actions.push('Download (overwrite) ⚠');
                        actions.push('Compare Local to Remote');
                     } else { 
                        actions.push('Download (new)')
                     }
                     // remote folder default action: Open
                     const localPathUri = vscode.Uri.file(localPath);
                     restApiFolderContents(localPathUri, null, config);
                  } else {
                     // local folder default action: Open
                     const fileUri = vscode.Uri.file(message.filePath);
                     localFolderContents(fileUri);
                  }
                  break;

               case "openFile":
                  if (config?.remoteEndpoint?.url && config?.workspaceFolder) { // Remote folder
                     const remotePathPrefix = new URL(config.remoteEndpoint.url).pathname.replace(/\/lsaf\/webdav\/(work|repo)(?=\/)/, '').replace(/\/$/, '');
                     const localPath = path.join(config.workspaceFolder?.uri?.fsPath || config.workspaceFolder,
                        config?.localRootPath,
                        `|${message.filePath}`.replace(`|${remotePathPrefix}`, '').replace('|', '')
                     );
                     let localPathExists = false;
                     try {
                        await fs.promises.stat(localPath);
                        localPathExists = true;
                        console.log(`localPath exists: ${localPath}`);
                     } catch (error) {
                        console.log(`localPath does not exist: ${localPath}`);
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
                     if (!action) {
                        return;
                     }
                     if (action === 'Compare Local to Remote') {
                        return restApiCompare(localPath, config);
                     } else if (action.split(' ')[0] === 'Download') {
                        return restApiDownload(localPath, config, /overwrite/i.test(action));
                     } else if (action === 'View') {
                        return restApiView(localPath, config);
                     } else {
                        const msg = `Action not yet implemented: ${action} for ${config.label} remote file: ${message.filePath}`;
                        console.log(msg);
                        vscode.window.showWarningMessage(msg);
                     };
                  } else {  // Local file
                     // const fileStat = await vscode.workspace.fs.stat(vscode.Uri.file(fPath));
                     const fileStat = await vscode.workspace.fs.stat(fileUri);
                     let itemType;
                     if (fileStat.type === vscode.FileType.File) {
                        itemType = 'file';
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
                           default:
                              const isBinary = await isBinaryFile(message.filePath);
                              if (! isBinary) {
                                 // Open the local file in the editor
                                 const document = await vscode.workspace.openTextDocument(fileUri);
                                 vscode.window.showTextDocument(document);
                              } else {
                                 openFile(fileUri);
                              }
                              break;
                        }
                     } else {
                        return vscode.window.showWarningMessage(`folderView: "${message.filePath}" is not a file, but a ${itemType}!`);
                     }
                  }
               break;
            }
         } catch (error) {
            vscode.window.showErrorMessage(
               `Failed to open file: ${error.message}`
            );
         }
      },
      undefined,
      undefined
   );

}


function getWebviewContent(folderPath, isLocal, files, config) {

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
         </style>
         </head>
         <body>
         <h2>Contents of ${isLocal ? "local" : config.label} folder: ${folderPath}</h2>
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
                     <td><a href="#" class="${/\/$/.test(file.name) ? 'folder-link' : 'file-link'}" data-path="${file.path}">${file.name}</a></td>
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
               const filePath = event.target.getAttribute('data-path');
               vscode.postMessage({
                  command: 'openFile',
                  filePath: filePath
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
