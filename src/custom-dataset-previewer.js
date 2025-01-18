const vscode = require('vscode');
const { read_dataset } = require('./read_dataset.js');
// const { getJsonTableWebviewContent } = require('./json-table-view.js');
// const beautify = require("js-beautify");
const { axios } = require("./axios-cookie-jar.js");
const { uriFromString } = require('./uri.js');
const { getAuthToken } = require('./auth.js');

class DatasetDocument {
   constructor(uri, data, size) {
      this.uri = uri;
      this.data = data;
      this.size = size;
   }

   dispose() {
     // Clean up resources if necessary
   }
}

class CustomDatasetPreviewerProvider {
   static register(context) {
      const provider = new CustomDatasetPreviewerProvider(context);

      const providerRegistration = vscode.window.registerCustomEditorProvider(
         CustomDatasetPreviewerProvider.viewType,
         provider,
         { webviewOptions: { retainContextWhenHidden: true } }
      );
      context.subscriptions.push(providerRegistration);
   }

   constructor(context) {
      this.context = context;
   }

   async openCustomDocument(uri /*, _openContext, _token*/) {
      if (! (typeof uri === vscode.Uri)) {
         uri = vscode.Uri.parse(uri);
      }
      let fileExt = uri.path.split(/[/\\]/).pop().split('.').pop();
      console.log('(CustomSasPreviewProvider.openCustomDocument) uri.path:', uri.path);
      console.log('(CustomSasPreviewProvider.openCustomDocument) fileExt:', fileExt);
      let data, size, fullSize;
      const maxRows = 10000;
      try {
         if (['sas7bdat', 'xpt', 'rds'].includes(fileExt)) {
            // Next statement is enclosed in parentheses to avoid confusion with a block statement 
            // and error “Declaration or statement expected. ts(1128)”
            ({ data, size, fullSize } = await read_dataset(uri /*.fsPath*/));
            console.log('(openCustomDocument) read_dataset() results: ', {size, fullSize, data});
         } else {
            data = await vscode.workspace.fs.readFile(uri);
         }         
      } catch (error) {
         debugger;
         console.log(error);
      }

      return new DatasetDocument(uri, data, size);
   }

   async resolveCustomEditor(document, webviewPanel, _token) {
      webviewPanel.webview.options = {
         enableScripts: true,
         localResourceRoots: [
            this.context.extensionUri,
            uriFromString(path.join(this.context.extensionPath, 'media'))
         ],
         retainContextWhenHidden: true,
         enableCommandUris: true // Enable registered commands to be called as URIs from webview HTML e.g.:
                                 // <a href="command:table-viewer.showMessage?%22Hello%22">Say 'Hello' with Command Uri</a>
      };

      webviewPanel.webview.html = await this.getHtmlForWebview(document.uri, document.data, document.size);

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
                     console.warn('(CustomDatasetPreviewerProvider)', message.text);
                     vscode.window.showErrorMessage(message.text);
                  }
                  break;
               case 'openUrl':
                  // // Handle the URL, e.g., open it in a browser
                  // vscode.env.openExternal(vscode.Uri.parse(message.url));
                  try {
                     const response = await axios.get(message.url,
                        {
                           headers: { "X-Auth-Token": getAuthToken(new URL(message.url).host) },
                           maxRedirects: 5 
                        });
                     console.log('axios response:', response);
                  } catch (error) {
                     // debugger;
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

   getHtmlForWebview(uri, data, size) {
      const style_script_refs = `
         <style>${fs.readFileSync(path.join(this.context.extensionPath, 'media', 'styles.css'), 'utf8')}</style>
         <script>${fs.readFileSync(path.join(this.context.extensionPath, 'media', 'script.js'), 'utf8')}</script>
         `;
      let content = 'This document type is not supported.';
      let fileExt = uri.path.split(/[/\\]/).pop().split('.').pop();
      let sizeDescr = '';
      if (Array.isArray(size)) {
         if (data.length !== size[0]) {
            sizeDescr = ` (${data.length} of ${size[0]} rows, ${size[1]} cols)`;
         } else {
            sizeDescr = ` (${size[0]} rows, ${size[1]} cols)`;
         }
      }

      if (typeof data === 'object') {
         if (['sas7bdat', 'xpt', 'rds'].includes(fileExt)) {
            return getJsonTableWebviewContent(`Data Table${sizeDescr}: ${uri.fsPath}`, data);
         }
         content = beautify(JSON.stringify(data));
      }


      return `<!DOCTYPE html>
         <html lang="en">
         <head>
         <meta charset="UTF-8">
         <meta name="viewport" content="width=device-width, initial-scale=1.0">
         <meta 
            http-equiv="Content-Security-Policy"
            content="default-src 'none'; style-src 'unsafe-inline' vscode-resource:; script-src 'unsafe-inline' vscode-resource:;"
         >
         <title>${uri.path.split('/').pop()}</title>
         ${style_script_refs}
         </head>
         <body>
            <div id="metadata">
               <p>Source: <span id="source"></span></p>
               <p>Filters: <span id="filters"></span></p>
               <p>Showing rows <span id="start"></span> to <span id="end"></span> of <span id="total"></span></p>
               <button onclick="triggerCommand('Hello from the webview!')">Click me to trigger a command</button>
               <a href="command:table-viewer.showMessage?%22Hello%22">Say 'Hello' with Command Uri</a>
            </div>
            <div class="table-container" id="table-container">
               <table id="data-table">
                  <thead></thead>
                  <tbody></tbody>
               </table>
            </div>
         </body>
         </html>`;
      
   }
}

CustomDatasetPreviewerProvider.viewType = "jbodart-argenx-lsaf-restapi-upload-extension.customDatasetPreviewer";

console.log('typeof CustomDatasetPreviewerProvider:', typeof CustomDatasetPreviewerProvider);
console.log('typeof CustomDatasetPreviewerProvider?.register:', typeof CustomDatasetPreviewerProvider?.register);


module.exports = CustomDatasetPreviewerProvider;
