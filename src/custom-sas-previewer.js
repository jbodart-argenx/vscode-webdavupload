const vscode = require('vscode');
const { read_sas, read_xpt } = require('./read_sas.js');
const { getJsonTableWebviewContent } = require('./json-table-view.js');
const beautify = require("js-beautify");
const { authTokens } = require('./auth.js');
const { axios } = require("./axios-cookie-jar.js");

class SasDatasetDocument {
   constructor(uri, data) {
      this.uri = uri;
      this.data = data;
   }

   dispose() {
     // Clean up resources if necessary
   }
}

class CustomSasPreviewerProvider {
   static register(context) {
      const provider = new CustomSasPreviewerProvider(context);
      const providerRegistration = vscode.window.registerCustomEditorProvider(
         CustomSasPreviewerProvider.viewType,
         provider,
         { webviewOptions: { retainContextWhenHidden: true } }
      );
      context.subscriptions.push(providerRegistration);
   }

   constructor(context) {
      this.context = context;
   }

   async openCustomDocument(uri /*, _openContext, _token*/) {
      let fileExt = uri.path.split(/[/\\]/).pop().split('.').pop();
      console.log('(CustomSasPreviewProvider.openCustomDocument) uri.path:', uri.path);
      console.log('(CustomSasPreviewProvider.openCustomDocument) fileExt:', fileExt);
      let data;
      if (fileExt === 'sas7bdat' && uri.fsPath) {
         data = await read_sas(uri.fsPath);
      } else 
      if (fileExt === 'xpt' && uri.fsPath) {
         data = await read_xpt(uri.fsPath);
      } else {
         data = await vscode.workspace.fs.readFile(uri);
      }
      return new SasDatasetDocument(uri, data);
   }

   async resolveCustomEditor(document, webviewPanel, _token) {
      webviewPanel.webview.options = {
         enableScripts: true,
         localResourceRoots: [this.context.extensionUri]
      };

      webviewPanel.webview.html = await this.getHtmlForWebview(document.uri, document.data);

      // Handle cancellation
      _token.onCancellationRequested(() => {
         console.log('Editor resolution was canceled');
         // Perform any necessary cleanup here
      });

      // Listen for messages from the webview
      const messageListener = webviewPanel.webview.onDidReceiveMessage(
         async (message) => {
            switch (message.command) {
               case 'alert':
                  if (message.text) {
                     console.warn('(CustomSasPreviewerProvider)', message.text);
                     vscode.window.showErrorMessage(message.text);
                  }
                  break;
               case 'openUrl':
                  // // Handle the URL, e.g., open it in a browser
                  // vscode.env.openExternal(vscode.Uri.parse(message.url));
                  try {
                     const response = await axios.get(message.url,
                        {
                           headers: { "X-Auth-Token": authTokens[new URL(message.url).host] },
                           maxRedirects: 5 
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
         this.context.subscriptions // disposables array
      );

      // Clean up when the panel is closed
      webviewPanel.onDidDispose(() => {
         messageListener.dispose();
         }, 
         null, // (Optional) thisArg: specify the value of this inside the callback function
         null, // this.context?.subscriptions // (Optional) disposables 
      );


   }

   getHtmlForWebview(uri, data) {
      const style_script_refs = '';
      let content = 'This document type is not supported.';
      let fileExt = uri.path.split(/[/\\]/).pop().split('.').pop();

      if (typeof data === 'object') {
         if (fileExt === 'sas7bdat') {
            return getJsonTableWebviewContent(`Data Table: ${uri.fsPath}`, data);
         } else 
         if (fileExt === 'xpt' && uri.fsPath) {
            return getJsonTableWebviewContent(`Data Table: ${uri.fsPath}`, data);
         } 
         content = beautify(JSON.stringify(data));
      }

      return `<!DOCTYPE html>
         <html lang="en">
         <head>
         <meta charset="UTF-8">
         <meta name="viewport" content="width=device-width, initial-scale=1.0">
         ${style_script_refs}
         </head>
         <body>
         <h1>Preview of ${uri.path}</h1>
         <div id="content">${content}</div>
         <script>
            const vscode = acquireVsCodeApi();
            function sendMessage() {
               vscode.postMessage({ command: 'alert', text: 'Hello from the webview!' });
            }
         </script>
         </body>
         </html>`;
      
   }
}

CustomSasPreviewerProvider.viewType = 'myExtension.customSasDatasetPreviewer';

console.log('typeof CustomSasPreviewerProvider:', typeof CustomSasPreviewerProvider);
console.log('typeof CustomSasPreviewerProvider?.register:', typeof CustomSasPreviewerProvider?.register);


module.exports = CustomSasPreviewerProvider;
