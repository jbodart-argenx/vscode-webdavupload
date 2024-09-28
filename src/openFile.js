const vscode = require("vscode");
const os = require('os');
const { exec } = require('child_process');

function openFileWithDefaultApp(filePath) {
   if (filePath instanceof vscode.Uri) {
      filePath = decodeURIComponent(filePath.fsPath);
   } else if (typeof filePath === 'string' && /file:\/\/\//.test(filePath)) {
      filePath = decodeURIComponent(vscode.Uri.parse(filePath).fsPath);
   }
   console.log('filePath:', filePath);
   if (os.platform() === 'win32'){
      exec(`start "" "${filePath}"`, (error) => {
         if (error) {
            console.error('Error opening file:', error);
         }
      });
   } else {
      vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
   }
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

module.exports = { openFile };