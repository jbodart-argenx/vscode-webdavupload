const vscode = require('vscode');

async function getKnownSchemes() {
   const knownSchemes = ['http', 'https', 'ftp', 'file', 'untitled', 'vscode', 'vscode-remote', 'vscode-userdata', 'data'];

   // Check for custom schemes registered by extensions
   vscode.extensions.all.forEach(extension => {
      if (extension.packageJSON.contributes && extension.packageJSON.contributes.fileSystemProvider) {
         extension.packageJSON.contributes.fileSystemProvider.forEach(provider => {
            if (!knownSchemes.includes(provider.scheme)) {
               knownSchemes.push(provider.scheme);
            }
         });
      }
   });

   return knownSchemes;
}

function isValidSchemeFormat(scheme) {
   const schemeRegex = /^[a-zA-Z][a-zA-Z0-9+.-]*$/;
   return schemeRegex.test(scheme);
}

async function isValidUri(uriString) {
   const knownSchemes = await getKnownSchemes();
   try {
      const url = new URL(uriString);
      // Use url.protocol.slice(0, -1) to remove the trailing colon of URL the protocol component
      return knownSchemes.includes(url.protocol.slice(0, -1)) && isValidSchemeFormat(url.protocol.slice(0, -1));
   } catch (e) {
      return false;
   }
}

function isRelativeUri(uriString) {
   try {
      const uri = new URL(uriString, 'http://example.com');
      return !uriString.includes(':');
   } catch (e) {
      return false;
   }
}

function resolveUri(relativeUri, baseUri) {
   if (!baseUri) {
      baseUri = getBaseUri();
   }
   try {
      const base = new URL(baseUri);
      const resolved = new URL(relativeUri, base);
      return resolved.toString();
   } catch (e) {
      return null;
   }
}

function uriFromString(param) {
   if (param instanceof vscode.Uri) {
      return param;
   }
   if (param && typeof param === 'string') {
      try{
         // decide if vscode.Uri.parse or vscode.Uri.file should be used
         // if param matches a URI path, use vscode.Uri.parse
         // otherwise, use vscode.Uri.file
         if (param.match(/^[a-zA-Z]:/) && process.platform === 'win32') {
            param = vscode.Uri.file(param);
         } else
         if (param.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:/)) {
            param = vscode.Uri.parse(param.replace(/\\/g, '/'));
         } else {
            param = vscode.Uri.file(param);
         }
         return param;
      } catch (e) {
         // ignore
      }
   }
   return null;
}

function pathFromUri(uri, dropScheme = false) {
   if (typeof uri === 'string') {
      uri = uriFromString(uri);
   }
   if (uri instanceof vscode.Uri) {
      if (uri.scheme === 'file') {
         return uri.fsPath;
      } else {
         if (dropScheme) {
            return uri.path;
         } else {
            return uri.toString();
         }
      }
   }
   return null;
}

function getBaseUri(param) {
   const workspaceFolders = vscode.workspace.workspaceFolders;
   const activeEditor = vscode.window.activeTextEditor;

   // Use the workspace folder of the provided parameter if available
   if (param) param = uriFromString(param);
   if (param instanceof vscode.Uri) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(param);
      if (workspaceFolder) {
         return workspaceFolder.uri.toString();
      }
   }

   // Use the folder of the active file if available
   if (activeEditor) {
      const activeFileUri = activeEditor.document.uri;
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeFileUri);
      if (workspaceFolder) {
         return workspaceFolder.uri.toString();
      }
   }

   // Fallback to the first workspace folder
   if (workspaceFolders && workspaceFolders.length > 0) {
      return workspaceFolders[0].uri.toString();
   }

   // Fallback to the current working directory
   return `file://${path.resolve('./')}/`;
}

module.exports = {
   isValidUri,
   isRelativeUri,
   resolveUri,
   getBaseUri,
   uriFromString,
   pathFromUri
};