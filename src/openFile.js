const vscode = require("vscode");
const os = require('os');
const { exec } = require('child_process');
const { uriFromString } = require('./uri.js');

function openFileWithDefaultApp(filePath) {
   if (filePath instanceof vscode.Uri) {
      filePath = decodeURIComponent(filePath.fsPath);
   } else if (typeof filePath === 'string' && /file:\/\/\//.test(filePath)) {
      filePath = decodeURIComponent(vscode.Uri.parse(filePath).fsPath);
   }
   console.log('filePath:', filePath);
   if (os.platform() === 'win32' && !vscode.env.remoteName){
      exec(`start "" "${filePath}"`, (error) => {
         if (error) {
            console.error('Error opening file in Default App:', error);
            vscode.window.showErrorMessage(`Error opening file in Default App: ${error.message}`);
         } else {
            console.log(`File was opened in Default App: ${filePath}`);
            vscode.window.showInformationMessage(`File was opened in Default App: ${filePath}`);
         }
      });
   } else {
      vscode.commands.executeCommand('vscode.open', uriFromString(filePath));
   }
}


async function openFileWithMatchingProvider(filePath, max = 3) {
   let fileUri, fileExtension;
   if (filePath instanceof vscode.Uri) {
      fileUri = filePath;
      filePath = decodeURIComponent(filePath.fsPath);
   } else if (typeof filePath === 'string' && /file:\/\/\//.test(filePath)) {
      fileUri = vscode.Uri.parse(filePath);
      filePath = decodeURIComponent(fileUri.fsPath);
   } else {
      fileUri = vscode.Uri.parse(filePath);
   }
   fileExtension = filePath.split('.').pop()
   console.log('(openFileWithMatchingProvider): fileExtension:', fileExtension, ', filePath:', filePath);

   // Find custom editors
   const customEditors = vscode.extensions.all.flatMap(extension => 
      extension.packageJSON.contributes?.customEditors || []
   );

   const matchingCustomEditors = customEditors.filter(editor => 
      editor.selector.some(pattern => new RegExp(pattern.filenamePattern.replace('*', '.*')).test(fileExtension))
   );
   console.log('matchingCustomEditors:', matchingCustomEditors);

   // Find text document content providers
   const contentProviders = vscode.extensions.all.flatMap(extension => 
      extension.packageJSON.contributes?.textDocumentContentProviders || []
   );

   const matchingContentProviders = contentProviders.filter(provider => 
      provider.scheme === fileExtension
   );
   console.log('matchingContentProviders:', matchingContentProviders);

   // Open file with each matching custom editor
   let opened = 0;
   for (const editor of matchingCustomEditors) {
      try {
         if (opened < max) {
            await vscode.commands.executeCommand('vscode.openWith', fileUri, editor.viewType);
            console.log(`Opened ${filePath} with custom editor ${editor.viewType}`);
            opened++;
         }
      } catch (error) {
         console.error(`Failed to open ${filePath} with custom editor ${editor.viewType}:`, error);
      }
   }

   if (opened < max) {
      // Open file with each matching content provider
      for (const provider of matchingContentProviders) {
         try {
            if (opened < max) {
               await vscode.commands.executeCommand('vscode.openWith', fileUri, provider.scheme);
               console.log(`Opened ${filePath} with content provider ${provider.scheme}`);
               opened++;
            }
         } catch (error) {
            console.error(`Failed to open ${filePath} with content provider ${provider.scheme}:`, error);
         }
      }
   }
   console.log(`(openFileWithMatchingProvider) File was opened with ${opened} providers.`);
   if (opened < max) {
      console.log("Attempting to open file with default App...");
      openFileWithDefaultApp(filePath);
   }
   return opened;
}

function openFile(uri) {
   if (uri && uri.scheme) {
      openFileWithDefaultApp(uri.toString());
      return;
   }

   const editor = vscode.window.activeTextEditor;
   if (editor && editor.document.uri) {
      openFileWithDefaultApp(editor.document.uri.toString());
      return;
   }

   vscode.window.showInformationMessage('No editor is active. Select an editor or a file in the Explorer view.');
}

module.exports = { openFile, openFileWithMatchingProvider };