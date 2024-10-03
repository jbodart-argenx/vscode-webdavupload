const fs = require("fs");
const path = require("path");
const Zip = require("adm-zip");
const OriginalFs = require("original-fs");

// Function to create a zip file and add files/folders to a subdirectory in the zip
function createZip(zipFilePath /*: string*/, filesAndFolders /*: string[]*/, subdirectory = '' /*: string*/) /*: Promise<void>*/ {
   return new Promise((resolve, reject) => {
      try {
         const zip = new Zip();

         if (! Array.isArray(filesAndFolders)) {
            filesAndFolders = [filesAndFolders];
         }

         // Add each file or folder to the zip archive under the specified subdirectory
         filesAndFolders.forEach((item) => {
               const itemPath = path.resolve(item);
               const baseName = path.basename(itemPath);

               if (fs.lstatSync(itemPath).isDirectory()) {
                  // Add the folder to a subdirectory in the zip
                  zip.addLocalFolder(itemPath, path.join(subdirectory, baseName));
               } else {
                  // Add the file to a subdirectory in the zip
                  // zip.addLocalFile(itemPath, path.join(subdirectory, baseName));
                  zip.addLocalFile(itemPath, subdirectory, baseName);
               }
         });

         // Write the zip file to the specified path
         zip.writeZip(zipFilePath);
         console.log("Written Zip file: ", zipFilePath);
         resolve();
      } catch (err) {
         reject(err);
      }
   });
}

// Function to extract a zip file to a specified folder
function extractZip(zipFilePath /*: string*/, extractToPath /*: string*/, overwrite = true) /*: Promise<void>*/ {
   return new Promise((resolve, reject) => {
      try {
         // const zip = new Zip(zipFilePath);
         const zip = new Zip(zipFilePath, {fs: OriginalFs});
         zip.extractAllTo(extractToPath, overwrite); 
         resolve();
      } catch (err) {
         reject(err);
      }
   });
}

module.exports = { createZip, extractZip };
