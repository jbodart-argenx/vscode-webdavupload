// Usage: const { inverseRelativePath } = require('./pathUtils.js');
// Description: Given a reltive path and the destination path (toPath), it returns source path from which the reltive path leads to the destination path.


function inverseRelativePath(toPath, relativePath) {
   const toPathParts = toPath.split('/');
   const relativePathParts = relativePath.split('/');

   // Remove common parts
   while (toPathParts.length > 0 && relativePathParts.length > 0 && toPathParts[0] === relativePathParts[0]) {
      toPathParts.shift();
      relativePathParts.shift();
   }

   return toPathParts.join('/');
}

exports =  { inverseRelativePath };