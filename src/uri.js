const vscode = require('vscode');
const path = require('path');

async function getKnownSchemes() {
   const knownSchemes = ['http', 'https', 'ftp', 'file', 'untitled', 'vscode', 'vscode-remote', 'vscode-userdata', 'data', 'lsaf-repo', 'lsaf-work'];

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
      if (e) return false;
   }
}

function isRelativeUri(uriString) {
   try {
      const uri = new URL(uriString, 'http://example.com');
      let isRelative = false;
      if (uri) {
         isRelative = !uri.protocol;  // Check if the URI has a scheme component
      }
      return isRelative;
   } catch (e) {
      if (e) return false;
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
      if (e) return null;
   }
}

function uriFromString(param) {
   if (param instanceof vscode.Uri) {
      return param;
   }
   if (param != null && typeof param === 'string') {
      try{
         // decide if vscode.Uri.parse or vscode.Uri.file should be used
         // if param matches a URI path, use vscode.Uri.parse
         // otherwise, use vscode.Uri.file
         if (param.match(/^[a-zA-Z]:/) && process.platform === 'win32') {
            param = vscode.Uri.file(param.replace(/^[A-Z]:/, s => s.toLowerCase()));  // Convert windows drive letter to lowercase
         } else if (param.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:/)) {
            param = vscode.Uri.parse(param.replace(/\\/g, '/'));
         } else {
            param = vscode.Uri.file(param);
         }
         return param;
      } catch (e) {
         // ignore
         if (e) return null;
      }
   }
   return null;
}

function pathFromUri(uri, dropScheme = false) {
   if (typeof uri === 'string') {
      if (uri === '') return uri;
      uri = uriFromString(uri);
   }
   if (uri instanceof vscode.Uri) {
      if (uri.scheme === 'file') {
         let path = uri.fsPath;
         path = path.replace(/^[A-Z]:/, s => s.toLowerCase());  // Convert windows drive letter to lowercase
         return path;
      } else {
         if (dropScheme) {
            return uri.path;
            // return decodeURIComponent(uri.path);
         } else {
            return uri.toString();
            // return decodeURIComponent(uri.toString());
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


async function existsUri(fileUri, type = null) {
   // type: vscode.FileType.File = 1 | vscode.FileType.Directory = 2 | vscode.FileType.SymbolicLink = 64
   let exists = false;
   if (fileUri != null) fileUri = uriFromString(fileUri);
   if (fileUri && fileUri instanceof vscode.Uri) {
      try {
         let stat = await vscode.workspace.fs.stat(fileUri);
         exists = true;
         if (type != null) exists = (stat.type === type);
      } catch (error) {
         if (error) console.log(`Uri does not exist: ${fileUri},`, error?.code);
      }
   }
   return exists;
}

module.exports = {
   isValidUri,
   isRelativeUri,
   resolveUri,
   getBaseUri,
   uriFromString,
   pathFromUri,
   existsUri
};