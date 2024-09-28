// import * as vscode from "vscode";
const vscode = require("vscode");

async function showTableView(tableViewTitle, data) {

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

   // Handle messages from the Webview
   panel.webview.onDidReceiveMessage(
      async (message) => {
         switch (message.command) {
            case "X":
               console.log('Case X');
               break;
            case "Y":
               console.log('Case Y');
               break;
            default:
               console.log('Case Default');
               break;
         }
      },
      undefined,
      undefined
   );

}




function getJsonTableWebviewContent(filePath, jsonData) {
   // Extract column names from the first item in the JSON array
   const columns = Object.keys(jsonData[0]);

   // Generate table headers
   const tableHeaders = columns.map(column => `<th>${column}</th>`).join('');

   // Generate table rows with index
   const tableRows = jsonData.map((item, index) => {
      const row = columns.map(column => `<td>${item[column]}</td>`).join('');
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
         <h1>${filePath} Data Table</h1>
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
      </body>
      </html>
   `;
}


module.exports = { showTableView };
