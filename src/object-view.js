const { title } = require("process");
const vscode = require("vscode");

// This is the async function that opens a webview and displays an object / collects edits from the user
async function getObjectView(inputObject = {}, editable = false, title = "Object Viewer", titleShort = "Object Viewer") {
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
         message => {
            switch (message.command) {
               case 'submit':
                     if (editable) {
                        // Return the updated object
                        vscode.window.showInformationMessage('Updated object submitted');
                        console.log('Updated Object:', message.updatedObject);
                     } else {
                        vscode.window.showInformationMessage('Read-only object submitted');
                        console.log('Original Object:', inputObject);
                     }
                     panel.dispose();
                     return;
            }
         },
         undefined,
         undefined // context.subscriptions
      );

      // If the panel is closed without submitting, reject the promise
      panel.onDidDispose(() => {
         reject("Input cancelled");
      });
   });
}



// HTML generation logic
function getWebviewContent(inputObject, editable = false, title = "Object Viewer", titleShort = "Object Viewer") {
   return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
         <meta charset="UTF-8">
         <meta name="viewport" content="width=device-width, initial-scale=1.0">
         <title>${titleShort}</title>
         <style>
               table {
                  width: 100%;
                  border-collapse: collapse;
               }
               table, th, td {
                  border: 1px solid black;
               }
               th, td {
                  padding: 8px;
                  text-align: left;
               }
               .nested-table {
                  margin-left: 20px;
               }
         </style>
      </head>
      <body>
         <h1>${title}</h1>
         ${generateTable(inputObject, editable)}
         <button id="submitBtn">Submit</button>
         <script>
               const vscode = acquireVsCodeApi();
               document.getElementById('submitBtn').addEventListener('click', () => {
                  const updatedObject = ${editable ? 'gatherFormData()' : 'null'};
                  vscode.postMessage({
                     command: 'submit',
                     updatedObject: updatedObject
                  });
               });

               function gatherFormData() {
                  const formData = {};
                  document.querySelectorAll('input').forEach(input => {
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
         </script>
      </body>
      </html>
   `;
}

// Recursively generates a table for the object
/*
function generateTable(obj, editable, parentKey = '') {
   let html = '<table>';
   for (const [key, value] of Object.entries(obj)) {
      const fullKey = parentKey ? `${parentKey}.${key}` : key;

      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
         html += `<tr>
               <td>${key}</td>
               <td><input type="text" name="${fullKey}" value="${value}" ${editable ? '' : 'readonly'} /></td>
         </tr>`;
      } else if (Array.isArray(value)) {
         html += `<tr>
               <td>${key}</td>
               <td>${generateArrayTable(value, editable, fullKey)}</td>
         </tr>`;
      } else if (typeof value === 'object' && value !== null) {
         html += `<tr>
               <td>${key}</td>
               <td>${generateTable(value, editable, fullKey)}</td>
         </tr>`;
      }
   }
   html += '</table>';
   return html;
}
*/
/*
function generateTable(obj, editable, parentKey = '') {
   let html = '<table>';
   html += `<tr><th>Key</th><th>Value</th></tr>`;  // Add headers for "Key" and "Value"
   for (const [key, value] of Object.entries(obj)) {
      const fullKey = parentKey ? `${parentKey}.${key}` : key;

      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
         // Use textarea instead of input for wrappable text, with 80% width
         html += `<tr>
               <td>${key}</td>
               <td><textarea name="${fullKey}" style="width: 80%; white-space: pre-wrap;" ${editable ? '' : 'readonly'}>${value}</textarea></td>
         </tr>`;
      } else if (Array.isArray(value)) {
         html += `<tr>
               <td>${key}</td>
               <td>${generateArrayTable(value, editable, fullKey)}</td>
         </tr>`;
      } else if (typeof value === 'object' && value !== null) {
         html += `<tr>
               <td>${key}</td>
               <td>${generateTable(value, editable, fullKey)}</td>
         </tr>`;
      }
   }
   html += '</table>';
   return html;
}
*/
/*
function generateTable(obj, editable, parentKey = '') {
   let html = '<table>';
   html += `<tr><th>Key</th><th>Value</th></tr>`;  // Add headers for "Key" and "Value"
   for (const [key, value] of Object.entries(obj)) {
      const fullKey = parentKey ? `${parentKey}.${key}` : key;

      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
         // Transpose key-value pair
         html += `<tr>
               <td>${key}</td>
               <td><input type="text" name="${fullKey}" value="${value}" ${editable ? '' : 'readonly'} /></td>
         </tr>`;
      } else if (Array.isArray(value)) {
         // Handle array of objects
         html += `<tr>
               <td>${key}</td>
               <td>${generateArrayTable(value, editable, fullKey)}</td>
         </tr>`;
      } else if (typeof value === 'object' && value !== null) {
         // Handle nested object
         html += `<tr>
               <td>${key}</td>
               <td>${generateTable(value, editable, fullKey)}</td>
         </tr>`;
      }
   }
   html += '</table>';
   return html;
}
*/

/*
function generateTable(obj, editable, parentKey = '') {
   let html = '<table style="width: 100%;">';  // Ensure the table takes 100% width of the page
   html += `<tr><th style="width: auto;">Key</th><th style="width: 100%;">Value</th></tr>`;  // Flex layout for columns
   for (const [key, value] of Object.entries(obj)) {
      const fullKey = parentKey ? `${parentKey}.${key}` : key;

      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
         // Transpose key-value pair, textarea fills remaining width
         html += `<tr style="display: flex; width: 100%;">
               <td style="flex: 0 1 auto; padding-right: 10px;">${key}</td>
               <td style="flex: 1 1 0;"><textarea name="${fullKey}" style="width: 100%; white-space: pre-wrap;" ${editable ? '' : 'readonly'}>${value}</textarea></td>
         </tr>`;
      } else if (Array.isArray(value)) {
         html += `<tr style="display: flex; width: 100%;">
               <td style="flex: 0 1 auto; padding-right: 10px;">${key}</td>
               <td style="flex: 1 1 0;">${generateArrayTable(value, editable, fullKey)}</td>
         </tr>`;
      } else if (typeof value === 'object' && value !== null) {
         html += `<tr style="display: flex; width: 100%;">
               <td style="flex: 0 1 auto; padding-right: 10px;">${key}</td>
               <td style="flex: 1 1 0;">${generateTable(value, editable, fullKey)}</td>
         </tr>`;
      }
   }
   html += '</table>';
   return html;
}
*/

function generateTable(obj, editable, parentKey = '') {
   let html = '<table style="width: 100%;">';
   html += `<tr><th style="width: 20%;">Key</th><th style="width: 80%;">Value</th></tr>`;  // Two columns with flexible widths

   for (const [key, value] of Object.entries(obj)) {
      const fullKey = parentKey ? `${parentKey}.${key}` : key;

      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
         // Directly display primitive values in the second column
         html += `<tr>
               <td style="padding-right: 10px;">${key}</td>
               <td><textarea name="${fullKey}" style="width: 100%; white-space: pre-wrap;" ${editable ? '' : 'readonly'}>${value}</textarea></td>
         </tr>`;
      } else if (Array.isArray(value)) {
         // Display array of objects inside the second column
         html += `<tr>
               <td style="padding-right: 10px;">${key}</td>
               <td>${generateArrayTable(value, editable, fullKey)}</td>
         </tr>`;
      } else if (typeof value === 'object' && value !== null) {
         // Display nested objects in the second column
         html += `<tr>
               <td style="padding-right: 10px;">${key}</td>
               <td>${generateTable(value, editable, fullKey)}</td>
         </tr>`;
      }
   }

   html += '</table>';
   return html;
}



// Generates table for array of objects
/*
function generateArrayTable(arr, editable, parentKey) {
   if (!arr.length || typeof arr[0] !== 'object') return '';

   let html = '<table class="nested-table"><tr>';
   // Create table headers
   for (const colKey of Object.keys(arr[0])) {
      html += `<th>${colKey}</th>`;
   }
   html += '</tr>';
   // Create rows for each object
   arr.forEach((row, rowIndex) => {
      html += '<tr>';
      for (const [colKey, colValue] of Object.entries(row)) {
         const fullKey = `${parentKey}[${rowIndex}].${colKey}`;
         html += `<td><input type="text" name="${fullKey}" value="${colValue}" ${editable ? '' : 'readonly'} /></td>`;
      }
      html += '</tr>';
   });
   html += '</table>';
   return html;
}
*/
/*
function generateArrayTable(arr, editable, parentKey) {
   if (!arr.length || typeof arr[0] !== 'object') return ''; // Handle if array is empty or not an array of objects

   let html = '';

   // Loop through each object in the array
   arr.forEach((item, index) => {
      html += `<h3>Item ${index + 1}</h3>`; // Add a header for each object in the array
      html += '<table>'; // Start a new table for each object
      html += `<tr><th>Key</th><th>Value</th></tr>`; // Add headers for "Key" and "Value"

      for (const [key, value] of Object.entries(item)) {
         const fullKey = `${parentKey}[${index}].${key}`; // Generate unique key for input names

         if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
               // Use textarea for primitive types to allow text wrapping
               html += `<tr>
                  <td>${key}</td>
                  <td><textarea name="${fullKey}" style="width: 80%; white-space: pre-wrap;" ${editable ? '' : 'readonly'}>${value}</textarea></td>
               </tr>`;
         } else if (Array.isArray(value)) {
               // Handle nested arrays of objects
               html += `<tr>
                  <td>${key}</td>
                  <td>${generateArrayTable(value, editable, fullKey)}</td>
               </tr>`;
         } else if (typeof value === 'object' && value !== null) {
               // Handle nested objects
               html += `<tr>
                  <td>${key}</td>
                  <td>${generateTable(value, editable, fullKey)}</td>
               </tr>`;
         }
      }

      html += '</table>'; // End the table for this object
   });

   return html;
}
*/
/*
function generateArrayTable(arr, editable, parentKey) {
   if (!arr.length || typeof arr[0] !== 'object') return ''; // Handle if array is empty or not an array of objects

   let html = '';

   // Loop through each object in the array
   arr.forEach((item, index) => {
      html += `<h3>Item ${index + 1}</h3>`; // Add a header for each object in the array
      html += '<table>'; // Start a new table for each object
      html += `<tr><th>Key</th><th>Value</th></tr>`; // Add headers for "Key" and "Value"

      for (const [key, value] of Object.entries(item)) {
         const fullKey = `${parentKey}[${index}].${key}`; // Generate unique key for input names

         if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
               // Transpose key-value pair for primitive types
               html += `<tr>
                  <td>${key}</td>
                  <td><input type="text" name="${fullKey}" value="${value}" ${editable ? '' : 'readonly'} /></td>
               </tr>`;
         } else if (Array.isArray(value)) {
               // Handle nested arrays of objects
               html += `<tr>
                  <td>${key}</td>
                  <td>${generateArrayTable(value, editable, fullKey)}</td>
               </tr>`;
         } else if (typeof value === 'object' && value !== null) {
               // Handle nested objects
               html += `<tr>
                  <td>${key}</td>
                  <td>${generateTable(value, editable, fullKey)}</td>
               </tr>`;
         }
      }

      html += '</table>'; // End the table for this object
   });

   return html;
}
*/
/*
function generateArrayTable(arr, editable, parentKey) {
   if (!arr.length || typeof arr[0] !== 'object') return ''; // Handle if array is empty or not an array of objects

   let html = '';

   // Loop through each object in the array
   arr.forEach((item, index) => {
      html += `<h3>Item ${index + 1}</h3>`; // Add a header for each object in the array
      html += '<table style="width: 100%;">'; // Ensure the table takes 100% width
      html += `<tr><th style="width: auto;">Key</th><th style="width: 100%;">Value</th></tr>`; // Flex layout for columns

      for (const [key, value] of Object.entries(item)) {
         const fullKey = `${parentKey}[${index}].${key}`; // Generate unique key for input names

         if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
               // Transpose key-value pair with textarea that expands
               html += `<tr style="display: flex; width: 100%;">
                  <td style="flex: 0 1 auto; padding-right: 10px;">${key}</td>
                  <td style="flex: 1 1 0;"><textarea name="${fullKey}" style="width: 100%; white-space: pre-wrap;" ${editable ? '' : 'readonly'}>${value}</textarea></td>
               </tr>`;
         } else if (Array.isArray(value)) {
               html += `<tr style="display: flex; width: 100%;">
                  <td style="flex: 0 1 auto; padding-right: 10px;">${key}</td>
                  <td style="flex: 1 1 0;">${generateArrayTable(value, editable, fullKey)}</td>
               </tr>`;
         } else if (typeof value === 'object' && value !== null) {
               html += `<tr style="display: flex; width: 100%;">
                  <td style="flex: 0 1 auto; padding-right: 10px;">${key}</td>
                  <td style="flex: 1 1 0;">${generateTable(value, editable, fullKey)}</td>
               </tr>`;
         }
      }

      html += '</table>'; // End the table for this object
   });

   return html;
}
*/

function generateArrayTable(arr, editable, parentKey) {
   if (!arr.length || typeof arr[0] !== 'object') return ''; // Handle if array is empty or not an array of objects

   let html = '<table style="width: 100%;">';

   arr.forEach((item, index) => {
      html += `<h3>Item ${index + 1}</h3>`; // Add a header for each object in the array
      html += '<table style="width: 100%;">'; // Start a new nested table for each object
      html += `<tr><th style="width: 20%;">Key</th><th style="width: 80%;">Value</th></tr>`; // Two columns for each object

      for (const [key, value] of Object.entries(item)) {
         const fullKey = `${parentKey}[${index}].${key}`; // Generate unique key for input names

         if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
               // Directly display primitive values in the second column
               html += `<tr>
                  <td style="padding-right: 10px;">${key}</td>
                  <td><textarea name="${fullKey}" style="width: 100%; white-space: pre-wrap;" ${editable ? '' : 'readonly'}>${value}</textarea></td>
               </tr>`;
         } else if (Array.isArray(value)) {
               // Nested arrays of objects
               html += `<tr>
                  <td style="padding-right: 10px;">${key}</td>
                  <td>${generateArrayTable(value, editable, fullKey)}</td>
               </tr>`;
         } else if (typeof value === 'object' && value !== null) {
               // Nested objects
               html += `<tr>
                  <td style="padding-right: 10px;">${key}</td>
                  <td>${generateTable(value, editable, fullKey)}</td>
               </tr>`;
         }
      }

      html += '</table>'; // End the table for this object
   });

   return html;
}



// Export the function so it can be imported in other files
module.exports = {
   getObjectView,
};
