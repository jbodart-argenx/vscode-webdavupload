const vscode = require("vscode");

const { authTokens } = require('./auth.js');
const beautify = require('js-beautify');
const { axios } = require("./axios-cookie-jar.js");
const { showMultiLineText } = require("./multiLineText.js");

// This is the async function that opens a webview and displays an object / collects edits from the user
async function getObjectView(inputObject = {}, editable = false, title = "Object Viewer", titleShort = "Object Viewer", context, restApi) {
   return new Promise((resolve, reject) => {
      // Create and show a new webview panel
      const panel = vscode.window.createWebviewPanel(
         "objectView", // Identifier for the panel
         `${titleShort}`, // Panel title
         vscode.ViewColumn.One, // Display in editor column one
         {
         enableScripts: true, // Enable JavaScript in the webview
         }
      );

      // Set the content of the webview
      panel.webview.html = getWebviewContent(inputObject, editable, title);

      // Handle messages from the webview
      panel.webview.onDidReceiveMessage(
         async message => {
            let updatedObject;
            switch (message.command) {
               case 'submit':
                     updatedObject = undefined;
                     if (editable) {
                        // Return the updated object
                        vscode.window.showInformationMessage('Updated object submitted');
                        updatedObject = message.updatedObject;
                        console.log('Updated Object:', updatedObject);
                     } else {
                        vscode.window.showInformationMessage('Read-only object submitted');
                        console.log('Original Object:', inputObject);
                     }
                     console.log('(getObjectView) Resolving Promise with updatedObject:', updatedObject);
                     resolve(updatedObject);
                     panel.dispose(); // Close the webview panel
                  break;
               case 'cancel':
                  updatedObject = undefined;
                  if (editable) {
                     // Return the updated object
                     vscode.window.showInformationMessage('Object cancelled');
                     updatedObject = {message: "Cancelled"};
                     console.log('Updated Object:', updatedObject);
                  } else {
                     vscode.window.showInformationMessage('Read-only object cancelled');
                     console.log('Original Object:', inputObject);
                  }
                  console.log('(getObjectView) Rejecting Promise with undefined Object:', updatedObject);
                  reject("Cancelled");
                  panel.dispose(); // Close the webview panel
               break;
               case 'openUrl':
                  // debugger ;
                  console.log('(getObjectView) openUrl: message.url = ', message.url);
                  let response;
                  let headers = {};
                  await restApi.logon();
                  let authToken = authTokens[new URL(message.url).hostname];
                  const basicAuth = (restApi.username && restApi.encryptedPassword) ?
                     "Basic " + Buffer.from(restApi.username + ":" + restApi.encryptedPassword).toString('base64') :
                     undefined;
                  if (authToken) {
                     headers["X-Auth-Token"] = authToken;
                  } else {
                     headers["Authorization"] =  basicAuth;
                  }
                  try {
                     response = await axios.get(message.url,
                        {
                           headers: headers,
                           maxRedirects: 5 // Optional, axios follows redirects by default
                        });
                        console.log('axios response status:', response.status, 'content-type:', response.headers['content-type']);
                        if (response?.data) {
                           showMultiLineText(
                              typeof response.data === 'string' ?
                                 response.data :
                                 beautify(JSON.stringify(response.data)),
                              `${message.url}`,  // title
                              `${message.url}`,  // heading
                              "Dismiss",         // buttonLabel
                              true               // preserveWiteSpace
                           );
                        } else {
                           console.log('axios response:\n', response);
                        }
                  } catch (error) {
                     debugger;
                     console.log('(getObjectView) openUrl error:', error.message);
                  }
                  // // Handle the URL, e.g., open it in a browser
                  // try {
                  //    vscode.env.openExternal(vscode.Uri.parse(message.url));
                  // } catch (error) {
                  //    debugger;
                  //    console.log(error);
                  // }
                  break;
               default:
                  debugger;
                  console.log('(getObjectView) Rejecting Promise for unexpected message:', message);
                  reject({unexpectedMessage: message});
                  panel.dispose();
            }
         },
         undefined,
         undefined // context.subscriptions
      );

      // If the panel is closed without submitting, reject the promise
      panel.onDidDispose(() => {
         console.log("(getObjectView) Rejecting promise, input cancelled.")
         reject("Input cancelled");
      });
   });
}


function alignValue(value) {
   try{
      value = Number(value);
      return value ? ' text-align : right;' : '';
   } catch (_){
      return '';
   }
}

function showValue(value) {
   const valueStr = value.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;');
   try {
      const urlValue = new URL(value);
      return `<a href="${urlValue.href}">${valueStr}</a>`;
   } catch (_) {
      return valueStr;
   }
}

// HTML generation logic
function getWebviewContent(inputObject, editable = false, title = "Object Viewer", titleShort = "Object Viewer") {
   return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
         <meta charset="UTF-8">
         <meta name="viewport" content="width=device-width, initial-scale=1.0">
         <title>${showValue(titleShort)}</title>
         <style>
               table {
                  width: 100%;
                  border-collapse: collapse;
               }
               table, th, td {
                  border: 1px solid black;
               }
               th, td {
                  padding: 3px;
                  text-align: left;
                  vertical-align: top;
               }
               textarea {
                  margin: 0;
                  padding: 2px;
                  width: calc(100% - 4px);  
                  resize: both;  
               }
               .nested-table {
                  margin-left: 10px;
               }
         </style>
      </head>
      <body>
         <h1>${title.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h1>
         ${Array.isArray(inputObject) ? 
            generateArrayTable(inputObject, editable) : 
            generateTable(inputObject, editable)
         }
         ${editable ?
         '<button id="submitBtn">Submit</button> <button id="cancelBtn">Cancel</button>' :
         '<button id="cancelBtn">Dismiss</button>' }
         <script>
               const vscode = acquireVsCodeApi();
         ` + (editable ? `
               document.getElementById('submitBtn').addEventListener('click', () => {
                  const updatedObject = ${editable ? 'gatherFormData()' : 'null'};
                  vscode.postMessage({
                     command: 'submit',
                     updatedObject: updatedObject
                  });
               });
         ` : ``) + `
               document.getElementById('cancelBtn').addEventListener('click', () => {
                  const updatedObject = ${editable ? 'gatherFormData()' : 'null'};
                  vscode.postMessage({
                     command: 'cancel'
                  });
               });

               document.body.addEventListener('click', function(event) {
                  event.preventDefault();
                  event.stopPropagation();
                  if (event.target.tagName === 'TH') {
                     const table = event.target.closest('table');
                     if (table) {
                        // Ensure the <th> is in the first row of the table
                        const firstRow = table.querySelector('thead tr');
                        if (event.target.parentNode === firstRow) {
                           // Determine the column index of the clicked header
                           const columnIndex = Array.from(event.target.parentNode.children).indexOf(event.target);
                           console.log('Clicked Column Index:', columnIndex);
                           sortTable(table, columnIndex);
                        }
                     }
                  }
               });

               function gatherFormData() {
                  const formData = {};
                  document.querySelectorAll('.value').forEach(input => {
                     const keys = input.name.split('.');
                     let ref = formData;
                     for (let i = 0; i < keys.length - 1; i++) {
                           ref[keys[i]] = ref[keys[i]] || {};
                           ref = ref[keys[i]];
                     }
                     ref[keys[keys.length - 1]] = input.value;
                  });
                  return formData;
               }

               function sortTable(table, colIndex) {
                  // Convert the HTMLCollection of rows to an array and skip the header row
                  const rows = Array.from(table.rows).slice(1);

                  // Determine the sorting direction: toggle between 'asc' and 'desc'
                  const dir = table.dataset.sortDir === 'asc' ? 'desc' : 'asc';
                  table.dataset.sortDir = dir;

                  // Sort the rows array
                  rows.sort((rowA, rowB) => {
                     // Get the text content of the cells in the specified column, trim and convert to lowercase
                     const cellA = rowA.querySelectorAll("th, td")[colIndex].textContent.trim().toLowerCase();
                     const cellB = rowB.querySelectorAll("th, td")[colIndex].textContent.trim().toLowerCase();

                     // Convert the cell values to numbers if possible
                     const numA = parseFloat(cellA);
                     const numB = parseFloat(cellB);
                     const bothNumeric = !isNaN(numA) && !isNaN(numB);

                     // Check if the values are valid ISO dates
                     const dateA = new Date(cellA);
                     const dateB = new Date(cellB);
                     const bothDates = !isNaN(dateA) && !isNaN(dateB);

                     // Compare the cell values based on the sorting direction
                     if (bothDates) {
                           // Date comparison
                           return dir === 'asc' ? dateA - dateB : dateB - dateA;
                     } else if (bothNumeric) {
                           // Numeric comparison
                           return dir === 'asc' ? numA - numB : numB - numA;
                     } else {
                           // Textual comparison
                           return dir === 'asc' ? cellA.localeCompare(cellB) : cellB.localeCompare(cellA);
                     }
                  });

                  // Create a DocumentFragment to minimize reflows and repaints
                  const fragment = document.createDocumentFragment();

                  // Append each sorted row to the fragment
                  rows.forEach(row => fragment.appendChild(row));

                  // Append the fragment to the table body
                  table.tBodies[0].appendChild(fragment);
               }

               document.addEventListener('DOMContentLoaded', () => {
                  document.querySelectorAll('a').forEach(link => {
                     link.addEventListener('click', function(event) {
                        event.preventDefault(); // Prevent default link behavior
                        event.stopPropagation();
                        const url = this.href; // Get the URL from the link
                        msg = {
                           command: 'openUrl',
                           url: url
                        };
                        console.log('vscode.postMessage:', JSON.stringify(msg));
                        vscode.postMessage(msg);
                     });
                  });
               });

         </script>
      </body>
      </html>
   `;
}


function generateTable(obj, editable, parentKey = '') {
   let html = `
   <table style="width: 20%; table-layout: auto;">
      <colgroup>
         <col style="width: 10%;">
         <col style="width: 80%;">
      </colgroup>
   `;                
   // html += `<tr><th style="width: 20%;">Key</th><th style="width: 80%;">Value</th></tr>`;  // Two columns with flexible widths

   for (const [key, value] of Object.entries(obj)) {
      const fullKey = (parentKey ? `${parentKey}.${key}` : key).toString().replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
         // Directly display primitive values in the second column
         if (editable) {
            html += `<tr>
                  <th style="padding-right: 10px;">${key.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</th>
                  <td><textarea class="value" name="${fullKey}" style="white-space: pre-wrap;" 
                     >${value.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea></td>
               </tr>`;
         } else {
            html += `<tr>
                  <th style="padding-right: 10px;">${key.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</th>
                  <td class="value" name="${fullKey}" style="white-space: pre-wrap; ${parentKey === '' ? '' : alignValue(value)}" 
                     >${showValue(value)}</td>
               </tr>`;
         }
      } else if (Array.isArray(value)) {
         // Display array of objects inside the second column
         html += `<tr>
               <th style="padding-right: 10px;">${key.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</th>
               <td>${generateArrayTable(value, editable, fullKey)}</td>
         </tr>`;
      } else if (typeof value === 'object' && value !== null) {
         // Display nested objects in the second column
         html += `<tr>
               <th style="padding-right: 10px;">${key.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</th>
               <td>${generateTable(value, editable, fullKey)}</td>
         </tr>`;
      }
   }

   html += '</table>';
   return html;
}



function generateArrayTable(arr, editable, parentKey = '') {
   if (!arr.length || typeof arr[0] !== 'object') return ''; // Handle if array is empty or not an array of objects
   let isEachItemObject = true;
   let objKeysNum_min, objKeysNum_max; 
   arr.forEach(item => {
      isEachItemObject = isEachItemObject && typeof item === 'object' && item != null;
      if (typeof item === 'object' && item != null) {
         const objKeysNum = Object.keys(item).length;
         objKeysNum_min = ! objKeysNum_min ? objKeysNum : (objKeysNum < objKeysNum_min ? objKeysNum : objKeysNum_min);
         objKeysNum_max = ! objKeysNum_max ? objKeysNum : (objKeysNum > objKeysNum_max ? objKeysNum : objKeysNum_max);
      }
   });
   let html;
   const columns = [...arr].reduce((acc, row) => [...(new Set([...acc, ...Object.keys(row)]))], []);
   if (columns.length > 1 && isEachItemObject && objKeysNum_max > 1) {
      // Display a 2D table if array has >1 items, each array item is an object, and at least one item object has >1 properties
      if (editable) {
         html = '<table style="width: 100%;  table-layout: auto;">';
      } else {
         html = '<table style="width: 20%;  table-layout: auto;">';
      }
      html += `<thead>
                  <tr>
                     <th>n=${arr.length}</th>`;
      html += columns.map(colName => `<th>${colName}</th>`).join('');
      html += `   </tr>
               </thead>
               <tbody>
                  `;
      arr.forEach((item, index) => {
         html += `<tr><th>${index+1}</th>`;
         for (const key of columns) {
            const fullKey = `${parentKey}[${index}].${key}`.replace(/</g, '&lt;').replace(/>/g, '&gt;'); // Generate unique key for input names
            const value = item[key] || '';
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                  // Directly display primitive values in the second column
                  if (editable) {
                     html += `<td><textarea class="value" name="${fullKey}" style="white-space: pre-wrap;"
                           >${value.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea></td>`;
                  } else {
                     html += `<td class="value" name="${fullKey}" style="white-space: pre-wrap; ${parentKey === '' ? '' : alignValue(value)}" 
                           >${showValue(value)}</td>`;
                  }
            } else if (Array.isArray(value)) {
                  // Nested arrays of objects
                  html += `<td>${generateArrayTable(value, editable, fullKey)}</td>`;
            } else if (typeof value === 'object' && value !== null) {
                  // Nested objects
                  html += `<td>${generateTable(value, editable, fullKey)}</td>`;
            }
         }
         html += `</tr>`;

         // html += '</table>'; // End the table for this object
      });

      html += `</tbody></table>`;

   } else {
      html = '<table style="width: 20%;  table-layout: auto;">';

      arr.forEach((item, index) => {
         // html += `<h3>Item ${index + 1}</h3>`; // Add a header for each object in the array
         // Start a new nested table for each object
         html += `
            <table style="width: 20%; table-layout: auto;">
               <colgroup>
                  <col style="width: 10%;">
                  <col style="width: 50%;">
               </colgroup>
            `;       
         // html += `<tr><th style="width: 20%;">Key</th><th style="width: 80%;">Value</th></tr>`; // Two columns for each object

         for (const [key, value] of Object.entries(item)) {
            const fullKey = `${parentKey}[${index}].${key}`.replace(/</g, '&lt;').replace(/>/g, '&gt;'); // Generate unique key for input names

            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                  // Directly display primitive values in the second column
                  if (editable) {
                     html += `<tr>
                        <th style="padding-right: 10px;">${key.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</th>
                        <td><textarea class="value" name="${fullKey}" style="white-space: pre-wrap;"
                           >${value.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea></td>
                     </tr>`;
                  } else {
                     html += `<tr>
                        <th style="padding-right: 10px;">${key.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</th>
                        <td class="value" name="${fullKey}" style="white-space: pre-wrap; ${parentKey === '' ? '' : alignValue(value)}" 
                           >${showValue(value)}</td>
                     </tr>`;
                  }
            } else if (Array.isArray(value)) {
                  // Nested arrays of objects
                  html += `<tr>
                     <th style="padding-right: 10px;">${key.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</th>
                     <td>${generateArrayTable(value, editable, fullKey)}</td>
                  </tr>`;
            } else if (typeof value === 'object' && value !== null) {
                  // Nested objects
                  html += `<tr>
                     <th style="padding-right: 10px;">${key.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</th>
                     <td>${generateTable(value, editable, fullKey)}</td>
                  </tr>`;
            }
         }

         html += '</table>'; // End the table for this object
      });
   }
   return html;
}



// Export the function so it can be imported in other files
module.exports = {
   getObjectView,
};
