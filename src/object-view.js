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
                     let updatedObject = undefined;
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



// HTML generation logic
function getWebviewContent(inputObject, editable = false, title = "Object Viewer", titleShort = "Object Viewer") {
   return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
         <meta charset="UTF-8">
         <meta name="viewport" content="width=device-width, initial-scale=1.0">
         <title>${titleShort.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>
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
               }
               .nested-table {
                  margin-left: 10px;
               }
         </style>
      </head>
      <body>
         <h1>${title.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h1>
         ${Array.isArray(inputObject) ? generateArrayTable(inputObject, editable) : generateTable(inputObject, editable)}
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
         </script>
      </body>
      </html>
   `;
}


function generateTable(obj, editable, parentKey = '') {
   let html = `
   <table style="width: 100%;">
      <colgroup>
         <col style="width: 30%;">
         <col style="width: 70%;">
      </colgroup>
   `;                
   // html += `<tr><th style="width: 20%;">Key</th><th style="width: 80%;">Value</th></tr>`;  // Two columns with flexible widths

   for (const [key, value] of Object.entries(obj)) {
      const fullKey = (parentKey ? `${parentKey}.${key}` : key).toString().replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
         // Directly display primitive values in the second column
         if (editable) {
            html += `<tr>
                  <td style="padding-right: 10px;">${key.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
                  <td><textarea class="value" name="${fullKey}" style="width: 100%; white-space: pre-wrap;" ${editable ? '' : 'readonly'}
                     >${value.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea></td>
               </tr>`;
         } else {
            html += `<tr>
                  <td style="padding-right: 10px;">${key.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
                  <td class="value" name="${fullKey}" style="width: 100%; white-space: pre-wrap;" 
                     >${value.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
               </tr>`;
         }
      } else if (Array.isArray(value)) {
         // Display array of objects inside the second column
         html += `<tr>
               <td style="padding-right: 10px;">${key.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
               <td>${generateArrayTable(value, editable, fullKey)}</td>
         </tr>`;
      } else if (typeof value === 'object' && value !== null) {
         // Display nested objects in the second column
         html += `<tr>
               <td style="padding-right: 10px;">${key.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
               <td>${generateTable(value, editable, fullKey)}</td>
         </tr>`;
      }
   }

   html += '</table>';
   return html;
}



function generateArrayTable(arr, editable, parentKey = '') {
   if (!arr.length || typeof arr[0] !== 'object') return ''; // Handle if array is empty or not an array of objects

   let html = '<table style="width: 100%;">';

   arr.forEach((item, index) => {
      // html += `<h3>Item ${index + 1}</h3>`; // Add a header for each object in the array
      // Start a new nested table for each object
      html += `
         <table style="width: 100%;">
            <colgroup>
               <col style="width: 30%;">
               <col style="width: 70%;">
            </colgroup>
         `;       
      // html += `<tr><th style="width: 20%;">Key</th><th style="width: 80%;">Value</th></tr>`; // Two columns for each object

      for (const [key, value] of Object.entries(item)) {
         const fullKey = `${parentKey}[${index}].${key}`.replace(/</g, '&lt;').replace(/>/g, '&gt;'); // Generate unique key for input names

         if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
               // Directly display primitive values in the second column
               if (editable) {
                  html += `<tr>
                     <td style="padding-right: 10px;">${key.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
                     <td><textarea class="value" name="${fullKey}" style="width: 100%; white-space: pre-wrap;" ${editable ? '' : 'readonly'}
                        >${value.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea></td>
                  </tr>`;
               } else {
                  html += `<tr>
                     <td style="padding-right: 10px;">${key.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
                     <td class="value" name="${fullKey}" style="width: 100%; white-space: pre-wrap;" 
                        >${value.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
                  </tr>`;
               }
         } else if (Array.isArray(value)) {
               // Nested arrays of objects
               html += `<tr>
                  <td style="padding-right: 10px;">${key.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
                  <td>${generateArrayTable(value, editable, fullKey)}</td>
               </tr>`;
         } else if (typeof value === 'object' && value !== null) {
               // Nested objects
               html += `<tr>
                  <td style="padding-right: 10px;">${key.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
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
