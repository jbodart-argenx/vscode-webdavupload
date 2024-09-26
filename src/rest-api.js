const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const beautify = require("js-beautify");
const { createZip, extractZip } = require("./zip.js");


// require('events').EventEmitter.defaultMaxListeners = 20;  // temporary fix

const tmp = require("tmp");
tmp.setGracefulCleanup();   // remove all controlled temporary objects on process exit

const { showMultiLineText } = require('./multiLineText.js');

const { RestApi } = require('./rest-api-class.js');



async function restApiZipUploadAndExpand(param, config = null) {
   const restApi = new RestApi();
   if (typeof param === 'string') {
      param = vscode.Uri.file(param);
   }
   if (param instanceof vscode.Uri) {
      vscode.window.showInformationMessage(`Rest API: Zip, Upload and Expanding Local Folder URI: ${param.fsPath}`);
      try {
         if (config) {
            restApi.config = config;
            if (param instanceof vscode.Uri) {
               console.log('(restApiZipUploadAndExpand) param:', param);
               restApi.localFile = param.fsPath;
               restApi.localFileStat = await vscode.workspace.fs.stat(param);
               restApi.getRemoteFilePath();   // get Remote File Path
            }
         } else {
            await restApi.getEndPointConfig(param);   // based on the passed Uri (if defined)
                                                      // otherwise based on the path of the local file open in the active editor
                                                      // also sets remoteFile
            if (!restApi.config) {
               return;
            }
         }
         // Zip
         const tempFile = tmp.fileSync({ postfix: '.zip', discardDescriptor: true });
         const tempZipFile = tempFile.name;
         const subdirectory = "";
         // Avoid uploading as a subdirectory into the target directory by only including the source directory contents into the zip file
         const directoryContents = await fs.promises.readdir(param.fsPath);
         const filesAndFolders = directoryContents.map(file => path.join(param.fsPath, file));
         await createZip(tempZipFile, filesAndFolders, subdirectory);
         // UploadAndExpand
         const result = await restApi.uploadAndExpand(tempZipFile, `Rest API: Zip, Upload and Expand Local Folder: ${param.fsPath}`);
         if (result.issues) {
            vscode.window.showWarningMessage(`Rest API: Zip, Upload and Expand Local Folder "${param.fsPath}": ${result.message}`);
         } else {
            vscode.window.showInformationMessage(`Rest API: Zip, Upload and Expand Local Folder "${param.fsPath}": ${result.message}`);
         }
         // Delete tempZipfile
         tempFile.removeCallback();
      } catch (err) {
         console.log(err);
      }
   } else {
      vscode.window.showWarningMessage(`Rest API: Cannot uploading File param type ${typeof param}: ${param}`);
   }
}

console.log('typeof restApiZipUploadAndExpand:', typeof restApiZipUploadAndExpand);


async function restApiUpload(param, config = null) {
   const restApi = new RestApi();
   if (typeof param === 'string') {
      param = vscode.Uri.file(param);
   }
   if (param instanceof vscode.Uri) {
      vscode.window.showInformationMessage(`Rest API: Uploading File URI: ${param.fsPath}`);
      try {
         if (config && config.label) {
            restApi.config = config;
            if (param instanceof vscode.Uri) {
               console.log('(restApiUpload) param:', param);
               restApi.localFile = param.fsPath;
               restApi.localFileStat = await vscode.workspace.fs.stat(param);
               restApi.getRemoteFilePath();   // get Remote File Path
            }
         } else {
            await restApi.getEndPointConfig(param);   // based on the passed Uri (if defined)
                                                      // otherwise based on the path of the local file open in the active editor
                                                      // also sets remoteFile
            if (!restApi.config) {
               return;
            }
         }
         await restApi.uploadFile(param);
         console.log(`Successfully uploaded ${restApi.localFile} to ${restApi.config.label}`)
      } catch (err) {
         console.log(err);
      }
   } else {
      vscode.window.showWarningMessage(`Rest API: Cannot upload File param type ${typeof param}: ${param}`);
   }
}

console.log('typeof restApiUpload:', typeof restApiUpload);

async function restApiCompare(param, config = null) {
   let statusMessage;
   const restApi = new RestApi();
   if (typeof param === 'string') {
      param = vscode.Uri.file(param);
   }
   try {
      if (config) {
         restApi.config = config;
         if (param instanceof vscode.Uri) {
            console.log('(restApiCompare) param:', param);
            restApi.localFile = param.fsPath;
            restApi.localFileStat = await vscode.workspace.fs.stat(param);
            restApi.getRemoteFilePath();   // get Remote File Path
         }
      } else {
         await restApi.getEndPointConfig(param);   // based on the passed Uri (if defined)
                                                   // otherwise based on the path of the local file open in the active editor
                                                   // also sets remoteFile
         if (!restApi.config) {
            return;
         }
      }
      vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: "Processing...",
            cancellable: false
         }, async (progress) => {
            statusMessage = vscode.window.setStatusBarMessage('Fetching contents...');
            progress.report({ message: "Fetching contents...", increment: 10  });
            await restApi.getRemoteFileContents(); // or : await restApi.getRemoteFileContents(param); ?
            statusMessage.dispose();
            progress.report({ message: "Comparing contents...", increment: 50  });
            statusMessage = vscode.window.setStatusBarMessage('Comparing contents...');
            await restApi.compareFileContents();
            progress.report({ message: "Done.", increment: 100  });
            statusMessage.dispose();
         });
   } catch (err) {
      console.log(err);
   }
   statusMessage?.dispose();
}
console.log('typeof restApiCompare:', typeof restApiCompare);


// restApiDownloadFolderAsZip
async function restApiDownloadFolderAsZip(param, config = null, expand = null, overwrite = true) {
   let saveAs, statusMessage;
   const restApi = new RestApi();
   if (typeof param === 'string') {
      param = vscode.Uri.file(param);
   }
   try {
      if (config) {
         restApi.config = config;
         if (param instanceof vscode.Uri) {
            restApi.localFile = param.fsPath;
            // restApi.localFileStat = await vscode.workspace.fs.stat(param);
            restApi.getRemoteFilePath();   // get Remote File Path
         }
      } else {
         await restApi.getEndPointConfig(param);   // based on the passed Uri (if defined)
                                                   // otherwise based on the path of the local file open in the active editor
                                                   // also sets remoteFile
         if (!restApi.config) {
            return;
         }
      }
      if (expand == null) {
         // Open the "Save As" dialog
         expand = await vscode.window.showSaveDialog({
            title: 'Save Zip File As',
            saveLabel: 'Save',
            filters: {
               'Zip Files': ['zip'],
               'All Files': ['*']
            },
            defaultUri: vscode.Uri.file(`${param}.zip`)
         });
         saveAs = !!expand;
      }
      statusMessage = vscode.window.setStatusBarMessage('Getting remote contents...');
      const zipFile = await restApi.getRemoteFolderContentsAsZip(param);
      statusMessage.dispose();
      if (zipFile) {
         if (expand) {
            if (expand === true) {
               expand = vscode.Uri.file(restApi.localFile);
            } 
            if (typeof expand === 'string') {
               expand = vscode.Uri.file(expand);
            }
            if (expand instanceof vscode.Uri) {
               // Save to specified file/folder
               try {
                  const lstat = fs.lstatSync(expand.fsPath);
                  if (lstat.isDirectory()) {
                     statusMessage = vscode.window.setStatusBarMessage('Extracting...');
                     await extractZip(zipFile, path.dirname(expand.fsPath), overwrite);
                     console.log(`(restApiDownloadFolderAsZip) Temporary Zip file ${zipFile} was extracted successfully to folder ${expand.fsPath}`);
                     vscode.window.showInformationMessage(`Temporary Zip file extracted successfully to folder ${expand.fsPath}`);
                  } else if (lstat.isFile()) {
                     if (zipFile !== expand.fsPath) {
                        statusMessage = vscode.window.setStatusBarMessage('Saving...');
                        await fs.promises.copyFile(zipFile, expand.fsPath, overwrite ? null : fs.constants.COPYFILE_EXCL);
                        console.log(`Temporary Zip file ${zipFile} was copied successfully to file ${expand.fsPath}`);
                        vscode.window.showInformationMessage(`Temporary Zip file ${zipFile} was copied successfully to file ${expand.fsPath}`);
                     }
                  }
               } catch (error) {
                  if (error.code === 'ENOENT') {
                     // expand.fsPath does not exist yet
                     try {
                        if (saveAs) {
                           // copy Temp zip file to selected file path
                           statusMessage = vscode.window.setStatusBarMessage('Saving...');
                           await fs.promises.copyFile(zipFile, expand.fsPath, overwrite ? null : fs.constants.COPYFILE_EXCL);
                           console.log(`Zip file successfully saved as ${expand.fsPath}`);
                           vscode.window.showInformationMessage(`Zip file successfully saved as ${expand.fsPath}`);
                        } else {
                           statusMessage = vscode.window.setStatusBarMessage('Saving...');
                           await extractZip(zipFile, path.dirname(expand.fsPath), overwrite);
                           console.log(`Temporary Zip file ${zipFile} was extracted successfully to new folder ${expand.fsPath}`);
                           vscode.window.showInformationMessage(`Temporary Zip file ${zipFile} was extracted successfully to new folder ${expand.fsPath}`);
                        }
                     } catch(error) {
                        console.log(`Error extracting from zip file: ${error.message}`);
                        vscode.window.showErrorMessage(`Error extracting from zip file: ${error.message}`);
                     }
                  } else {
                     console.log(`Error extracting from zip file: ${error.message}`);
                     vscode.window.showErrorMessage(`Error extracting from zip file: ${error.message}`);
                  }
               }
            }
         } else {
            console.log(`Remote Folder Contents saved as Temp Zip file: ${zipFile}`);
            vscode.window.showInformationMessage(`Remote Folder Contents saved as Temp Zip file: ${zipFile}`);
         }
         statusMessage.dispose();
      }
   } catch (err) {
      if (statusMessage) statusMessage.dispose();
      console.log(`Error downloading Remote Folder as Zip:`, err);
      vscode.window.showErrorMessage(`Error downloading Remote Folder as Zip: ${err.message}`);
   }
}
console.log('typeof restApiDownloadFolderAsZip:', typeof restApiDownloadFolderAsZip);



async function restApiDownload(param, config = null, overwrite = null) {
   const restApi = new RestApi();
   if (typeof param === 'string') {
      param = vscode.Uri.file(param);
   }
   try {
      if (config) {
         restApi.config = config;
         if (param instanceof vscode.Uri) {
            restApi.localFile = param.fsPath;
            // restApi.localFileStat = await vscode.workspace.fs.stat(param);
            restApi.getRemoteFilePath();   // get Remote File Path
         }
      } else {
         await restApi.getEndPointConfig(param);   // based on the passed Uri (if defined)
                                                   // otherwise based on the path of the local file open in the active editor
                                                   // also sets remoteFile
         if (!restApi.config) {
            return;
         }
      }
      const pick_multiple = false;
      await restApi.getRemoteFileContents(param, pick_multiple);
      await restApi.saveFileContentsAs(param.fsPath, overwrite);
   } catch (err) {
      console.log(err);
   }
}
console.log('typeof restApiDownload:', typeof restApiDownload);

// restApiView

async function restApiView(param, config = null) {
   const restApi = new RestApi();
   if (typeof param === 'string') {
      param = vscode.Uri.file(param);
   }
   try {
      if (config) {
         restApi.config = config;
         if (param instanceof vscode.Uri) {
            console.log('(restApiView) param:', param);
            restApi.localFile = param.fsPath;
            // restApi.localFileStat = await vscode.workspace.fs.stat(param);
            restApi.getRemoteFilePath();   // get Remote File Path
         }
      } else {
         await restApi.getEndPointConfig(param);   // based on the passed Uri (if defined)
                                                   // otherwise based on the path of the local file open in the active editor
                                                   // also sets remoteFile
         if (!restApi.config) {
            return;
         }
      }
      await restApi.getRemoteFileContents();
      await restApi.viewFileContents();
   } catch (err) {
      console.log(err);
   }
}
console.log('typeof restApiView:', typeof restApiView);



async function restApiProperties(param) {
   const restApi = new RestApi();
   try {
      await restApi.getEndPointConfig(param); // based on the passed Uri (if defined)
      // otherwise based on the path of the local file open in the active editor
      // also sets remoteFile
      if (!restApi.config) {
         return;
      }
      await restApi.getRemoteFileProperties(param);
      let properties = restApi.fileProperties;
      if (typeof properties === 'object') {
         properties = beautify(JSON.stringify(properties), {
            indent_size: 2,
            space_in_empty_paren: true,
         });
      }
      console.log("File properties:\n", properties);
      // vscode.window.showInformationMessage(properties);
      showMultiLineText(properties, "Remote File Properties", `${restApi.config.label} file properties: ${restApi.remoteFile}`);
   } catch (err) {
      console.log(err);
   }
}
console.log('typeof restApiProperties:', typeof restApiProperties);




// restApiVersions
async function restApiVersions(param) {
   const restApi = new RestApi();
   try {
      const onlyRepo = true;
      await restApi.getEndPointConfig(param, onlyRepo);   // based on the passed Uri (if defined)
      // otherwise based on the path of the local file open in the active editor
      // also sets remoteFile
      if (!restApi.config) {
         return;
      }
      await restApi.getRemoteFileVersions();
      let versions = restApi.fileVersions;
      if (typeof versions === 'object') {
         versions = beautify(JSON.stringify(versions), {
            indent_size: 2,
            space_in_empty_paren: true,
         });
      }
      console.log("File versions:\n", versions);
      // vscode.window.showInformationMessage(versions);
      showMultiLineText(versions, "Remote File Versions", `${restApi.config.label} file versions: ${restApi.remoteFile}`);
   } catch (err) {
      console.log(err);
   }
}
console.log('typeof restApiVersions:', typeof restApiVersions);





module.exports = { 
   restApiZipUploadAndExpand, 
   restApiVersions,
   restApiProperties,
   restApiView,
   restApiDownload,
   restApiDownloadFolderAsZip,
   restApiCompare,
   restApiUpload
};
