// import * as vscode from "vscode";
const vscode = require("vscode");
const { getAuthToken } = require('./auth.js');
const { axios } = require("./axios-cookie-jar.js");

async function showTableView(tableViewTitle, data, context, webViewTitle = "Table View", retainContextWhenHidden = true) {

   const panel = vscode.window.createWebviewPanel(
      "tableView",
      webViewTitle,
      vscode.ViewColumn.One,
      {
         enableScripts: true, // Allow running JavaScript in the Webview
         retainContextWhenHidden,
      }
   );

   // Set the HTML content
   panel.webview.html = getJsonTableWebviewContent(tableViewTitle, data);

   // disposables
   const disposables = [];

   if (context?.subscriptions){
      disposables.push(...context.subscriptions);
   }

   const getData = () => {
      console.warn('Called getData()');
      // Replace with your data fetching logic
      return [
               { id: 1, name: 'Item 1' },
               { id: 2, name: 'Item 2' }
            ];
   };

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
                        headers: { "X-Auth-Token": getAuthToken[this.host] },
                        maxRedirects: 5 // Optional, axios follows redirects by default
                     });
                  console.log('axios response:', response);
               } catch (error) {
                  debugger;
                  console.log(error);
               }
               break;
            case 'requestData':
               if (!data) data = getData();
               panel.webview.postMessage({ command: 'sendData', data: data });
               console.log('Sent data.');
               data = null;
               break;
            default:
               console.log('Case Default');
               break;
         }
      },
      undefined,  // thisArg
      disposables // disposables array
   );

   panel.webview.postMessage({ command: 'sendData', data: data });

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

   // const escapeHTML = (str) => `${str || ''}`.replace(/[&<>"']/g, (match) => ({
   //    '&': '&amp;',
   //    '<': '&lt;',
   //    '>': '&gt;',
   //    '"': '&quot;',
   //    "'": '&#39;'
   // }[match]));
   
   // Generate table headers
   // const tableHeaders = columns.map(column => `<th>${escapeHTML(column)}</th>`).join('');

   // Generate table rows with index - set values of cells that do not exist in a row to '' (instead of the default 'undefined')
   // const tableRows = jsonData.map((item, index) => {
   //    const row = columns.map(column => `<td>${escapeHTML(item[column] || '')}</td>`).join('');
   //    return `<tr><th>${index + 1}</th>${row}</tr>`;
   // }).join('');

   function getNonce() {
      let text = '';
      const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      for (let i = 0; i < 32; i++) {
          text += possible.charAt(Math.floor(Math.random() * possible.length));
      }
      return text;
   }
   
   const nonce = getNonce();
   // console.log('nonce:', nonce);
   // vscode.window.showInformationMessage(`nonce: ${nonce}`);

   // const shadowRootInnerHtml = `
   //    <style nonce="${nonce}">
   //       /* CSS Reset */
   //       html, body, div, span, applet, object, iframe,
   //       h1, h2, h3, h4, h5, h6, p, blockquote, pre,
   //       a, abbr, acronym, address, big, cite, code,
   //       del, dfn, em, img, ins, kbd, q, s, samp,
   //       small, strike, strong, sub, sup, tt, var,
   //       b, u, i, center,
   //       dl, dt, dd, ol, ul, li,
   //       fieldset, form, label, legend,
   //       table, caption, tbody, tfoot, thead, tr, th, td,
   //       article, aside, canvas, details, embed,
   //       figure, figcaption, footer, header, hgroup,
   //       menu, nav, output, ruby, section, summary,
   //       time, mark, audio, video {
   //          margin: 0;
   //          padding: 0;
   //          border: 0;
   //          font-size: 100%;
   //          font: inherit;
   //          vertical-align: baseline;
   //       }
   //       article, aside, details, figcaption, figure,
   //       footer, header, hgroup, menu, nav, section {
   //          display: block;
   //       }
   //       body {
   //          line-height: 1;
   //       }
   //       ol, ul {
   //          list-style: none;
   //       }
   //       blockquote, q {
   //          quotes: none;
   //       }
   //       blockquote:before, blockquote:after,
   //       q:before, q:after {
   //          content: '';
   //          content: none;
   //       }
   //       table {
   //          border-collapse: collapse;
   //          border-spacing: 0;
   //       }

   //       /* Custom Styles */
   //       :host {
   //             display: flex;
   //             flex-direction: column;
   //             width: 100%;
   //             height: 100%;
   //          }
   //          #header {
   //             flex: 0 0 auto;
   //          }
   //          #container {
   //             flex: 1 1 auto;
   //             overflow: auto;
   //             position: relative;
   //          }
   //          table {
   //             width: 100%;
   //             border-collapse: collapse;
   //          }
   //          table th, table td {
   //             border: 1px solid #ddd !important;
   //             padding: 8px !important;
   //             text-align: left !important;
   //          }
   //          table th {
   //             background-color: #f2f2f2 !important;
   //             position: sticky;
   //             top: 0; /* Fix column headers */
   //             z-index: 2; /* Ensure column headers are above other content */
   //          }
   //          table td:first-child {
   //             position: sticky;
   //             left: 0; /* Fix row headers */
   //             background-color: #f9f9f9 !important; /* Optional: Different background for row headers */
   //             z-index: 1; /* Ensure row headers are above other content but below column headers */
   //          }
   //    </style>
   //    <div id="header">
   //       <h1>${tableTitle}</h1>
   //       <button id="requestData">Request Data</button>
   //    </div>
   //    <div id="container">
   //       <table id="dataTable">
   //          <thead>
   //             <tr>
   //                   <th>#</th>
   //                   ${tableHeaders}
   //             </tr>
   //          </thead>
   //          <tbody>
   //             ${tableRows}
   //          </tbody>
   //       </table>
   //    </div>
   // `;


   // Return the complete HTML content
   return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
         <meta charset="UTF-8">
         <meta name="viewport" content="width=device-width, initial-scale=1.0">
         <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self' 'nonce-${nonce}'; script-src 'self' 'nonce-${nonce}';">
         <title>${tableTitle}</title>
         <style nonce="${nonce}">
            /* Styles for the shadow host */
            #shadow-host {
                  width: 100%;
                  height: 100%;
                  display: flex;
                  flex-direction: column;
            }
            #header {
                  flex: 0 0 auto;
            }
            #container {
                  flex: 1 1 auto;
                  overflow: auto;
                  position: relative;
            }
            table {
                  width: 100%;
                  border-collapse: collapse;
            }
            table th, table td {
                  border: 1px solid #ddd !important;
                  padding: 8px !important;
                  text-align: left !important;
            }
            table th {
                  background-color: #f2f2f2 !important;
                  position: sticky;
                  top: 0; /* Fix column headers */
                  z-index: 2; /* Ensure column headers are above other content */
            }
            table td:first-child {
                  position: sticky;
                  left: 0; /* Fix row headers */
                  background-color: #f9f9f9 !important; /* Optional: Different background for row headers */
                  z-index: 1; /* Ensure row headers are above other content but below column headers */
            }
         </style>
      </head>
      <body>
         <div id="shadow-host"></div>
         <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();

            function updateTable(jsonData) {
                  if (typeof jsonData === 'string') jsonData = JSON.parse(jsonData);
                  const tableHeader = shadowRoot.getElementById('dataTable').getElementsByTagName('thead')[0];
                  const tableBody = shadowRoot.getElementById('dataTable').getElementsByTagName('tbody')[0];
                  tableHeader.innerHTML = '';
                  tableBody.innerHTML = '';

                  const columns = [...jsonData].reduce((acc, row) => [...new Set([...acc, ...Object.keys(row)])], []);
                  console.log('columns:', columns);

                  // Generate table headers
                  tableHeader.innerHTML = '<tr><th>#</th>' + columns.map(column => '<th>' + column + '</th>').join('') + '</tr>';
                  
                  // Generate table rows with index - set values of cells that do not exist in a row to '' (instead of the default 'undefined')
                  tableBody.innerHTML = jsonData.map((item, index) => {
                     const row = columns.map(column => '<td>' + (item[column] || '') + '</td>').join('');
                     return '<tr><th>' + (index + 1) + '</th>' + row + '</tr>';
                  }).join('');
            }

            // Create a shadow root
            const shadowHost = document.getElementById('shadow-host');
            const shadowRoot = shadowHost.attachShadow({ mode: 'open' });

            // Append styles and content to the shadow root
            shadowRoot.innerHTML = \`
                  <div id="header">
                     <h1>Webview Example</h1>
                     <button id="requestData">Request Data</button>
                  </div>
                  <div id="container">
                     <table id="dataTable">
                        <thead></thead>
                        <tbody></tbody>
                     </table>
                  </div>
            \`;

            shadowRoot.getElementById('requestData').addEventListener('click', () => {
                  vscode.postMessage({ command: 'requestData' });
            });

            window.addEventListener('message', event => {
                  const message = event.data;
                  switch (message.command) {
                     case 'sendData':
                        updateTable(message.data);
                        break;
                  }
            });

            document.querySelectorAll('a').forEach(link => {
                  link.addEventListener('click', function(event) {
                     event.preventDefault(); // Prevent default link behavior
                     const url = this.href; // Get the URL from the link
                     const msg = {
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
