const vscode = require('vscode');
const path = require('path');

// Usage: const { inverseRelativePath } = require('./pathUtils.js');
// Description: Given a reltive path and the destination path (toPath), it returns source path from which the reltive path leads to the destination path.


function inverseRelativePath(toPath, relativePath) {
   const toPathParts = toPath.split('/');
   const relativePathParts = relativePath.split('/');

   // Remove common parts
   while (toPathParts.length > 0 && relativePathParts.length > 0 && toPathParts[toPathParts.length-1] === relativePathParts[relativePathParts.length-1]) {
      toPathParts.pop();
      relativePathParts.pop();
   }

   return toPathParts.join('/');
}

function joinPaths(path1, path2, asString = false) {
   let joinedPath;
   if (typeof path1 === 'string' && /^[a-zA-Z][\w+.-]+:\/\//.test(path1)) {
      // path1 is a URI
      path1 = vscode.Uri.parse(path1);
   }
   if (typeof path1 === 'string') {
      // count number of '/' in path1
      const n_fwd = (path1.match(/\//g) || []).length;
      // count number of '\' in path1
      const n_bwd = (path1.match(/\\/g) || []).length;
      if (n_fwd > n_bwd) {
         joinedPath = path.posix.join(path1, `${path2 || ''}`);
      } else {
         joinedPath = path.win32.join(path1, `${path2 || ''}`);
      }
   } else if (path1 instanceof vscode.Uri) {
      try {
         joinedPath = vscode.Uri.joinPath(path1, `${path2 || ''}`);
      } catch (error) {
         debugger;
         console.error('Error in joinPaths: ', error.message);
      }
   }
   if (asString) {
      joinedPath = joinedPath.toString();
   }
   return joinedPath;
}

module.exports =  { inverseRelativePath, joinPaths };
