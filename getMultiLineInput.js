const vscode = require("vscode");

// This is the async function that opens a webview and collects multi-line input from the user
async function getMultiLineInput(defaultValue = '') {
   return new Promise((resolve, reject) => {
      // Create and show a new webview panel
      const panel = vscode.window.createWebviewPanel(
         "multiLineInput", // Identifier for the panel
         "Multi-Line Input", // Panel title
         vscode.ViewColumn.One, // Display in editor column one
         {
         enableScripts: true, // Enable JavaScript in the webview
         }
      );

      // Set the content of the webview
      panel.webview.html = getWebviewContent(defaultValue);

      // Handle messages from the webview
      panel.webview.onDidReceiveMessage(
         (message) => {
         if (message.command === "submitText") {
            resolve(message.text); // Resolve the promise with the submitted text
            panel.dispose(); // Close the webview panel
         }
         },
         undefined,
         undefined
      );

      // If the panel is closed without submitting, reject the promise
      panel.onDidDispose(() => {
         reject("Input cancelled");
      });
   });
}

// Helper function to get the HTML content for the webview
function getWebviewContent(defaultValue, title="File Upload Comment", header=undefined) {
   if (! header) header = `Enter ${title} below:`;
   const escapedTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
   const escapedHeader = header.replace(/</g, '&lt;').replace(/>/g, '&gt;');
   const escapedValue = defaultValue.replace(/</g, '&lt;').replace(/>/g, '&gt;');

   return `
   <!DOCTYPE html>
   <html lang="en">
      <head>
         <meta charset="UTF-8">
         <meta name="viewport" content="width=device-width, initial-scale=1.0">
         <title>${escapedTitle}</title>
         <style>
            body {
               display: flex;
               flex-direction: column;
               margin: 0;
               height: 100vh;
               box-sizing: border-box;
               font-family: sans-serif;
            }
            textarea {
               flex: 1;
               box-sizing: border-box;
               font-family: sans-serif;
            }
            .controls {
               margin-top: 10px;
            }
         </style>
      </head>
      <body>
         <h2>${escapedHeader}</h2>
         <textarea id="inputText">${escapedValue}</textarea>
         <div class="controls">
            <button onclick="submitText()">Submit</button>
         </div>

         <script>
            const vscode = acquireVsCodeApi();

            function submitText() {
               const text = document.getElementById('inputText').value;
               vscode.postMessage({
                     command: 'submitText',
                     text: text
               });
            }
         </script>
      </body>
   </html>
`;
}

// Export the function so it can be imported in other files
module.exports = {
   getMultiLineInput,
};
