const fs = require("fs");
const path = require("path");
const Zip = require("adm-zip");
// const OriginalFs = require("original-fs");
// const { validateVSCodeTypesCompatibility } = require("vsce/out/validation");
const vscode = require('vscode');

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
async function extractZip(zipFilePath, extractToPath, overwrite = true) {
   try {
      if (!(extractToPath instanceof vscode.Uri)) {
         extractToPath = vscode.Uri.parse(extractToPath);
      }

      let zip;
      if (zipFilePath instanceof vscode.Uri) {
         const zipContents = await vscode.workspace.fs.readFile(zipFilePath);
         zip = new Zip(zipContents);
      } else {
         zip = new Zip(zipFilePath);
      }

      const zipEntries = zip.getEntries();
      for (const zipEntry of zipEntries) {
         const entryPath = vscode.Uri.joinPath(extractToPath, zipEntry.entryName);
         let entryPathExists;
         try {
            await vscode.workspace.fs.stat(entryPath);
            entryPathExists = true;
         } catch (error) {
            if (error.code === 'FileNotFound') {
               entryPathExists = false;
            } else {
               throw error; // Some (other) error occurred
            }
         }
         if (overwrite || !entryPathExists) {
            if (zipEntry.isDirectory) {
               await vscode.workspace.fs.createDirectory(entryPath);
            } else {
               await vscode.workspace.fs.writeFile(entryPath, zipEntry.getData());
            }
         } else {
            console.log(`(extractZip) Skipped extracting zip entry as target exists: ${entryPath}`);
         }
      }
   } catch (err) {
      throw new Error(`Failed to extract zip: ${err.message}`);
   }
}

module.exports = { createZip, extractZip };
