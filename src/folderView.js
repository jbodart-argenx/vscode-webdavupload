import * as vscode from "vscode";


export async function showFolderView(folderPath, folderContents, config) {

   const panel = vscode.window.createWebviewPanel(
      "folderContents",
      "Folder Contents",
      vscode.ViewColumn.One,
      {
         enableScripts: true, // Allow running JavaScript in the Webview
      }
   );

   // Set the HTML content
   panel.webview.html = getWebviewContent(folderPath, folderContents);

   // Handle messages from the Webview
   panel.webview.onDidReceiveMessage(
      async (message) => {
         switch (message.command) {
            case "openFile":
               const fileUri = vscode.Uri.file(message.filePath);
               try {
                  if (config?.remoteEndpoint?.url) {
                     // Ask what to do with remote file: download, compare to local, delete ?
                     const action = await vscode.window.showQuickPick(['Download', 'Compare to Local']);
                     const msg = `Action not yet implemented: ${action} for ${config.label} remote file: ${message.filePath}`;
                     console.log(msg);
                     vscode.window.showWarningMessage(msg);
                  } else {
                     // Open the file in the editor
                     const document = await vscode.workspace.openTextDocument(fileUri);
                     vscode.window.showTextDocument(document);
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


function getWebviewContent(folderPath, files) {

   return `
      <html>
         <head>
         <style>
            table {
               width: 100%;
               border-collapse: collapse;
            }
            th, td {
               padding: 3px;
               text-align: left;
               border-bottom: 1px solid #ddd;
            }
            th {
               cursor: pointer;
            }
            table td:nth-child(2), table th:nth-child(2) { text-align: end; }
         </style>
         </head>
         <body>
         <h2>Contents of ${folderPath}</h2>
         <table id="folderTable">
            <thead>
               <tr>
               <th onclick="sortTable(0)">Name</th>
               <th onclick="sortTable(1)">Size</th>
               <th onclick="sortTable(2)">Last Modified</th>
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
               console.log('Sorting column', n);
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
                     console.log('Sorting row', i, 'xVal:', xVal, 'yVal:', yVal, 'bothNumeric:', bothNumeric);
                     

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

