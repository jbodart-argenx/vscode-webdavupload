const vscode = require("vscode");
const path = require('path');
const isBinaryFile = require("isbinaryfile").isBinaryFile;
const { exec } = require('child_process');


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
         switch (message.command) {
            case "openFile":
               const fileUri = vscode.Uri.file(message.filePath);
               const ext = path.extname(message.filePath).toLowerCase();
               try {
                  if (config?.remoteEndpoint?.url) {
                     // Ask what to do with remote file: download, compare to local, delete ?
                     const action = await vscode.window.showQuickPick(['View', 'Download', 'Compare to Local']);
                     const msg = `Action not yet implemented: ${action} for ${config.label} remote file: ${message.filePath}`;
                     console.log(msg);
                     vscode.window.showWarningMessage(msg);
                  } else {
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
                              // vscode.commands.executeCommand('vscode.open', fileUri);
                              openFile(fileUri);
                           }
                           break;
                     }
                  }
               } catch (error) {
                  vscode.window.showErrorMessage(
                     `Failed to open file: ${error.message}`
                  );
               }
               return;
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
                     <td><a href="#" class="file-link" data-path="${file.path}">${file.name}</a></td>
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
                     xVal = x.textContent.trim().toLowerCase();
                     yVal = y.textContent.trim().toLowerCase();

                     // Check if both values are numeric
                     const xNum = parseFloat(xVal);
                     const yNum = parseFloat(yVal);
                     const bothNumeric = !isNaN(xNum) && !isNaN(yNum)  && !xVal.match(/[t:]/i);                     

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


function openFile(uri) {
   if (uri && uri.scheme) {
      openFileWithDefaultApp(uri.toString());
      return;
   }

   const editor = vscode.window.activeTextEditor;
   if (editor && editor.document.uri) {
      openFileWithDefaultApp(editor.document.uri.toString());
      return;
   }

   vscode.window.showInformationMessage('No editor is active. Select an editor or a file in the Explorer view.');
}


function openFileWithDefaultApp(filePath) {
   if (filePath instanceof vscode.Uri) {
      filePath = decodeURIComponent(filePath.fsPath);
   } else if (typeof filePath === 'string' && /file:\/\/\//.test(filePath)) {
      filePath = decodeURIComponent(vscode.Uri.parse(filePath).fsPath);
   }
   console.log('filePath:', filePath);
   exec(`start "" "${filePath}"`, (error) => {
      if (error) {
         console.error('Error opening file:', error);
      }
   });
}

