// import * as vscode from "vscode";
const vscode = require("vscode");
const { authTokens } = require('./auth.js');
const { axios } = require("./axios-cookie-jar.js");

// eslint-disable-next-line require-await
async function showTableView(tableViewTitle, data, context) {

   const panel = vscode.window.createWebviewPanel(
      "tableView",
      "Table View",
      vscode.ViewColumn.One,
      {
         enableScripts: true, // Allow running JavaScript in the Webview
      }
   );

   // Set the HTML content
   panel.webview.html = getJsonTableWebviewContent(tableViewTitle, data);

   // disposables
   const disposables = [];

   if (context?.subscriptions){
      disposables.push(...context.subscriptions);
   }

   // Listen for messages from the webview
   const messageListener = panel.webview.onDidReceiveMessage(
      async (message) => {
         switch (message.command) {
            case "X":
               console.log('Case X');
               break;
            case "Y":
               console.log('Case Y');
               break;
            case 'openUrl':
               // debugger ;
               // // Handle the URL, e.g., open it in a browser
               // vscode.env.openExternal(vscode.Uri.parse(message.url));
               try {
                  const response = await axios.get(message.url,
                     {
                        headers: { "X-Auth-Token": authTokens[this.host] },
                        maxRedirects: 5 // Optional, axios follows redirects by default
                     });
                  console.log('axios response:', response);
               } catch (error) {
                  debugger;
                  console.log(error);
               }
               break;
            default:
               console.log('Case Default');
               break;
         }
      },
      undefined,  // thisArg
      disposables // disposables array
   );

   // Add the message listener to the disposables array
   disposables.push(messageListener);

   // Clean up when the panel is closed
   panel.onDidDispose(() => {
         disposables.forEach(disposable => disposable.dispose());
      }, 
      null, // (Optional) thisArg: specify the value of this inside the callback function
      context?.subscriptions // (Optional) disposables 
   );
}




function getJsonTableWebviewContent(tableTitle, jsonData) {
   // Extract column names from the first item in the JSON array
   // const columns = Object.keys(jsonData[0]);
   let columns;
   // Check every row for column names that do not exist in other rows
   columns = [...jsonData].reduce((acc, row) => [...(new Set([...acc, ...Object.keys(row)]))], []);
   console.log('columns:', columns);

   // Generate table headers
   const tableHeaders = columns.map(column => `<th>${column}</th>`).join('');

   // Generate table rows with index - set values of cells that do not exist in a row to '' (instead of the default 'undefined')
   const tableRows = jsonData.map((item, index) => {
      const row = columns.map(column => `<td>${item[column] || ''}</td>`).join('');
      return `<tr><th>${index + 1}</th>${row}</tr>`;
   }).join('');

   // Return the complete HTML content
   return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
         <meta charset="UTF-8">
         <meta name="viewport" content="width=device-width, initial-scale=1.0">
         <title>JSON Table</title>
         <style>
               body {
                  font-family: Arial, sans-serif;
               }
               .table-container {
                  width: 100%;
                  height: 400px;
                  overflow: auto;
                  position: relative;
               }
               table {
                  width: 100%;
                  border-collapse: collapse;
               }
               th, td {
                  border: 1px solid black;
                  padding: 8px;
                  text-align: left;
               }
               th {
                  background-color: #f2f2f2;
                  position: sticky;
                  top: 0;
                  z-index: 2;
               }
               th:first-child {
                  left: 0;
                  z-index: 3;
               }
               tr th {
                  position: sticky;
                  left: 0;
                  background-color: #f2f2f2;
                  z-index: 1;
               }
         </style>
      </head>
      <body>
         <h1>${tableTitle}</h1>
         <div class="table-container">
               <table>
                  <thead>
                     <tr>
                           <th>#</th>
                           ${tableHeaders}
                     </tr>
                  </thead>
                  <tbody>
                     ${tableRows}
                  </tbody>
               </table>
         </div>
         <script>
            const vscode = acquireVsCodeApi();

            document.querySelectorAll('a').forEach(link => {
               link.addEventListener('click', function(event) {
                  event.preventDefault(); // Prevent default link behavior
                  const url = this.href; // Get the URL from the link
                  msg = {
                     command: 'openUrl',
                     url: url
                  };
                  console.log('vscode.postMessage:', JSON.stringify(msg));
                  vscode.postMessage(msg);
               });
            });
         </script>
      </body>
      </html>
   `;
}


module.exports = { showTableView, getJsonTableWebviewContent };
