const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const beautify = require("js-beautify");
const { createZip, extractZip } = require("./zip.js");
const { getObjectView } = require("./object-view.js");
const { uriFromString, pathFromUri } = require("./uri.js");


// require('events').EventEmitter.defaultMaxListeners = 20;  // temporary fix

const tmp = require("tmp");
tmp.setGracefulCleanup();   // remove all controlled temporary objects on process exit

const { showMultiLineText } = require('./multiLineText.js');

const { RestApi } = require('./rest-api-class.js');
const { getEndpointConfigForCurrentPath } = require('./endpointConfig.js');



async function restApiZipUploadAndExpand(param, config = null) {
   const restApi = new RestApi();
   if (typeof param === 'string') {
      param = uriFromString(param);
   }
   if (param instanceof vscode.Uri) {
      vscode.window.showInformationMessage(`Rest API: Zip, Upload and Expanding Local Folder URI: ${param.fsPath}`);
      try {
         if (config && config.localRootPath && config.remoteEndpoint) {
            restApi.config = config;
            if (param instanceof vscode.Uri) {
               console.log('(restApiZipUploadAndExpand) param:', param);
               restApi.localFile = param.fsPath;
               restApi.localFileStat = await vscode.workspace.fs.stat(param);
               restApi.getRemoteFilePath();   // get Remote File Path
            }
         } else {
            await restApi.getEndPointConfig(param, false, false, true);   // based on the passed Uri (if defined)
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


async function restApiDeleteCredentials(host) {
   if (host == null){
      host = await vscode.window.showInputBox({ 
         title: "Delete credentials for host name",
         prompt: "Enter fully qualified host name (e.g. 'xxxxxxx.ondemand.sas.com')\n",
         ignoreFocusOut: true
      });
   }
   if (!host) {
      vscode.window.showWarningMessage("restApiDeleteCredentials: no 'host' specified, aborting.");
   }
   const restApi = new RestApi(undefined, host);
   restApi.deleteCredentials(host)
}


async function restApiGetRemoteFileUri(param, config = null) {
   const restApi = new RestApi();
   if (typeof param === 'string') {
      param = uriFromString(param);
   }
   if (param instanceof vscode.Uri) {
      vscode.window.showInformationMessage(`Rest API: Getting Remote File URI: ${param.fsPath}`);
      try {
         if (config && config.label) {
            restApi.config = config;
         } else {
            await restApi.getEndPointConfig(param);   // based on the passed Uri (if defined)
            // otherwise based on the path of the local file open in the active editor
            // also sets remoteFile
            if (!restApi.config) {
               return;
            }
         }
         if (param instanceof vscode.Uri) {
            console.log('(restApiGetRemoteFileUri) param:', param);
            restApi.localFile = param.fsPath;
            restApi.localFileStat = await vscode.workspace.fs.stat(param);
            restApi.getRemoteFilePath();   // get Remote File Path
         }
         const uri = restApi.remoteFileUri;
         console.log(`Remote file Uri: ${uri}`)
         return uri;
      } catch (err) {
         console.log(err);
      }
   } else {
      vscode.window.showWarningMessage(`Rest API: Cannot retrieve Remote File Uri for param type ${typeof param}: ${param}`);
   }
}


async function restApiGetRemoteFilePath(param, config = null) {
   const restApi = new RestApi();
   let remoteFilePath = '';
   let remoteWSFolderPath = '';
   if (typeof param === 'string') {
      param = uriFromString(param);
   }
   if (param instanceof vscode.Uri) {
      vscode.window.showInformationMessage(`Rest API: Getting Remote File Path: ${param.fsPath}`);
      try {
         if (config && config.label) {
            restApi.config = config;
            console.log('(restApiGetRemoteFilePath) param:', param);
            restApi.localFile = param.fsPath;
            restApi.localFileStat = await vscode.workspace.fs.stat(param);
            restApi.getRemoteFilePath();   // get Remote File Path
            remoteFilePath = restApi.remoteFile;
            console.log(`Remote file Path: ${remoteFilePath}`)
            return remoteFilePath;
         } else {
            const onlyRepo = false;
            const getUniquePaths = true;
            let uniquePaths = await getEndpointConfigForCurrentPath(param.fsPath, onlyRepo, getUniquePaths);
            let uniquePathsArray;
            let configFile;
            let selectedPath;
            if (!Array.isArray(uniquePaths) && typeof uniquePaths === 'object') {
               uniquePathsArray = Object.keys(uniquePaths);
               configFile = uniquePaths[uniquePathsArray[0]][0].configFile;
            } else {
               uniquePathsArray = uniquePaths;
            }
            console.log(`uniquePathsArray:`, uniquePathsArray);
            if (uniquePathsArray.length > 1) {
               selectedPath = await vscode.window.showQuickPick(uniquePathsArray, {
                  placeHolder: "Choose a remote location",
                  canPickMany: false,
               });
               if (selectedPath == null) {
                  selectedPath = uniquePathsArray[0];
               }
               console.log('selectedPath:', selectedPath);
               remoteWSFolderPath = selectedPath;
               // // await selection of the desired endpoint 
               // await new Promise((resolve) => {
               //    const quickPick = vscode.window.createQuickPick();
               //    quickPick.items = uniquePathsArray.map(label => ({ label }));
               //    quickPick.title = "Select the desired endpoint";
               //    quickPick.placeholder = "Select the desired endpoint";
               //    quickPick.onDidAccept(() => {
               //       const selection = quickPick.selectedItems[0];
               //       console.log(`Selected endpoint:`, selection);
               //       remoteWSFolderPath = uniquePathsArray.find(conf => conf.label === selection.label);
               //       quickPick.dispose();
               //       resolve();
               //    });
               //    quickPick.onDidHide(() => {
               //       quickPick.dispose();
               //       remoteWSFolderPath = uniquePathsArray[0];
               //       resolve();
               //    });
               //    quickPick.show();
               // });
            } else {
               remoteWSFolderPath = uniquePathsArray[0];
            }
            console.log("remoteWSFolderPath:", remoteWSFolderPath);
            const workingWSFolder = vscode.workspace.getWorkspaceFolder(param);
            console.log("workingWSFolder:\n", beautify(JSON.stringify(workingWSFolder))); 
            const workingWSFolderPath = workingWSFolder.uri.scheme === 'file' ? workingWSFolder.uri.fsPath : workingWSFolder.uri.path;
            console.log("workingWSFolderPath:\n", workingWSFolderPath);
            const workspaceFolder = workingWSFolder;
            const localFilePath = param.scheme === 'file' ? param.fsPath : param.path;
            const endpointConfigDirectory = vscode.Uri.joinPath(configFile, '..');
            const localRootPath = endpointConfigDirectory.with({
               path: endpointConfigDirectory.path.replace(workspaceFolder.uri.path, '')
            });
            console.log("localRootPath:\n", beautify(JSON.stringify(localRootPath)));

            // const remoteFile = localFilePath.replace(/\\/g, "/")
            //    .replace(
            //       path.posix.join(workingWSFolderPath.replace(/\\/g, "/"),
            //          localRootPath.path.replace(/\\/g, "/")),
            //       ""
            //    );

            remoteFilePath = localFilePath.replace(/\\/g, "/").replace(path.posix.join(workingWSFolderPath.replace(/\\/g, "/"), localRootPath.path.replace(/\\/g, "/")), remoteWSFolderPath);
            console.log('remoteFilePath:', remoteFilePath);
            return remoteFilePath;
         }
      } catch (err) {
         vscode.window.showErrorMessage(`Rest API: Error retrieving Remote File Path: ${err}`);
         debugger;
         console.error(`(restApiGetRemoteFilePath) Error retrieving Remote File Path: ${err}`);
      }
   } else {
      vscode.window.showWarningMessage(`Rest API: Cannot retrieve Remote File Uri for param type ${typeof param}: ${param}`);
   }
}

async function restApiCopyRemoteFileUri(param, config = null) {
   const uri = await restApiGetRemoteFileUri(param, config);
   if (uri) {
      try {
         vscode.env.clipboard.writeText(uri.toString());
         console.log(`Remote file Uri copied to clipboard: ${uri}`);
         vscode.window.showInformationMessage(`Remote file Uri copied to clipboard: ${uri}`);
      } catch (error) {
         vscode.window.showErrorMessage(`Error copying Remote file Uri to clipboard: ${error.message}`);         
         console.error(`(restApiCopyRemoteFileUri) Error copying Remote file Uri to clipboard: ${error.message}`);         
      }
   } else {
      vscode.window.showWarningMessage(`Failed to copy Remote file Uri to clipboard`);
      console.error(`(restApiCopyRemoteFileUri) Failed to copy Remote file Uri to clipboard`);
   }
}

async function restApiCopyRemoteFilePath(param, config = null) {
   const remoteFilePath = await restApiGetRemoteFilePath(param, config);
   if (remoteFilePath) {
      try {
         vscode.env.clipboard.writeText(remoteFilePath);
         console.log(`Remote file path copied to clipboard: ${remoteFilePath}`);
         // vscode.window.showInformationMessage(`Remote file path copied to clipboard: ${remoteFilePath}`);
      } catch (error) {
         vscode.window.showErrorMessage(`Error copying Remote file path to clipboard: ${error.message}`);         
         console.error(`(restApiCopyRemoteFilePath) Error copying Remote file path to clipboard: ${error.message}`);         
      }
   } else {
      console.error(`(restApiCopyRemoteFilePath) Failed to copy Remote file path to clipboard`);
      vscode.window.showWarningMessage(`Failed to copy Remote file path to clipboard`);
   }
}


async function restApiUpload(param, config = null) {
   const restApi = new RestApi();
   if (typeof param === 'string') {
      param = uriFromString(param);
   }
   if (param instanceof vscode.Uri) {
      vscode.window.showInformationMessage(`Rest API: Uploading File: ${pathFromUri(param)}`);
      try {
         if (config && config.label) {
            restApi.config = config;
            if (param instanceof vscode.Uri) {
               console.log('(restApiUpload) param:', param);
               restApi.localFile = pathFromUri(param); // param.fsPath;
               restApi.localFileStat = await vscode.workspace.fs.stat(param);
               restApi.getRemoteFilePath();   // get Remote File Path
            }
         } else {
            await restApi.getEndPointConfig(param, false, false, true);   // based on the passed Uri (if defined)
                                                      // otherwise based on the path of the local file open in the active editor
                                                      // also sets remoteFile
            if (!restApi.config) {
               return;
            }
         }
         await restApi.uploadFile(param);
         console.log(`Successfully uploaded ${restApi.localFile} to ${restApi.config.label}`)
      } catch (err) {
         debugger;
         console.log(err);
      }
   } else {
      vscode.window.showWarningMessage(`Rest API: Cannot upload File param type ${typeof param}: ${param}`);
   }
}

console.log('typeof restApiUpload:', typeof restApiUpload);

async function restApiCompare(param, config = null) {
   let statusMessage;
   let localFile;
   const restApi = new RestApi();
   if (typeof param === 'string') {
      param = uriFromString(param);
   }
   try {
      if (config && config.localRootPath && config.remoteEndpoint) {
         restApi.config = config;
         if (param instanceof vscode.Uri) {
            console.log('(restApiCompare) param:', param, 'config:', config);
            restApi.localFile = param;
            restApi.localFileStat = await vscode.workspace.fs.stat(param);
            restApi.getRemoteFilePath();   // get Remote File Path
         } else {
            debugger;
            console.log('(restApiCompare) Unexpected param:', param);
         }
      } else {
         const onlyRepo = false, uniquePaths = false, chooseNewEndpoint = true;
         await restApi.getEndPointConfig(param, onlyRepo, uniquePaths, chooseNewEndpoint);   
            // based on the passed Uri (if defined)
            // otherwise based on the path of the local file open in the active editor
            // also sets remoteFile
         if (!restApi.config) {
            return;
         }
         console.log('(restApiCompare) restApi.localFile:', restApi.localFile);
         console.log('(restApiCompare) param:', param);
         localFile = restApi.localFile;
         console.log('(restApiCompare) localFile:', localFile);
      }
      vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: "Processing...",
            cancellable: false
         }, async (progress) => {
            statusMessage = vscode.window.setStatusBarMessage('Fetching contents...');
            progress.report({ message: "Fetching contents...", increment: 10  });
            console.log('restApi.localFile:', restApi.localFile);
            // await restApi.getRemoteFileContents(); // or : 
            await restApi.getRemoteFileContents(param || restApi.localFile);
            console.log('restApi.localFile:', restApi.localFile);
            statusMessage.dispose();
            progress.report({ message: "Comparing contents...", increment: 50  });
            statusMessage = vscode.window.setStatusBarMessage('Comparing contents...');
            await restApi.compareFileContents();
            console.log('restApi.localFile:', restApi.localFile);
            progress.report({ message: "Done.", increment: 100  });
            statusMessage.dispose();
         });
   } catch (err) {
      debugger;
      console.log(err);
      vscode.window.showErrorMessage(err.message);
   }
   console.log('restApi.localFile:', restApi.localFile);
   statusMessage?.dispose();
}
console.log('typeof restApiCompare:', typeof restApiCompare);


// restApiDownloadFolderAsZip
async function restApiDownloadFolderAsZip(param, config = null, expand = null, overwrite = true) {
   let saveAs, statusMessage;
   const restApi = new RestApi();
   if (typeof param === 'string') {
      param = vscode.Uri.parse(param.replace(/[\\/]$/, ''));
   }
   try {
      if (config && config.localRootPath && config.remoteEndpoint) {
         restApi.config = config;
         if (param instanceof vscode.Uri) {
            restApi.localFile = param;
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
      const defaultUri = vscode.Uri.joinPath(param, '..', `${param.path.replace(/\/$/, '').split('/').pop()}.zip`);
      console.log('(restApiDownloadFolderAsZip) defaultUri:', defaultUri);
      if (expand == null) {
         // Open the "Save As" dialog
         expand = await vscode.window.showSaveDialog({
            title: 'Save Zip File As',
            saveLabel: 'Save',
            filters: {
               'Zip Files': ['zip'],
               'All Files': ['*']
            },
            defaultUri: defaultUri
         });
         saveAs = !!expand;
      }
      statusMessage = vscode.window.setStatusBarMessage('Getting remote contents...');
      const zipFile = await restApi.getRemoteFolderContentsAsZip(param);
      statusMessage.dispose();
      if (zipFile) {
         if (expand) {
            if (expand === true) {
               expand = restApi.localFile;
            } 
            if (typeof expand === 'string') {
               expand = vscode.Uri.parse(expand);
            }
            if (expand instanceof vscode.Uri) {
               // Save to specified file/folder
               try {
                  // const lstat = fs.lstatSync(expand.fsPath);
                  const lstat = await vscode.workspace.fs.stat(expand);
                  if (lstat.type & vscode.FileType.Directory) {
                     statusMessage = vscode.window.setStatusBarMessage('Extracting...');
                     const expandFolder = vscode.Uri.joinPath(expand, '..');
                     // await extractZip(zipFile, path.dirname(expand.fsPath), overwrite);
                     await extractZip(zipFile, expandFolder, overwrite);
                     console.log(`(restApiDownloadFolderAsZip) Temporary Zip file ${zipFile} was extracted successfully to folder ${expandFolder}`);
                     vscode.window.showInformationMessage(`Temporary Zip file extracted successfully to folder ${expandFolder}`);
                  } else if (lstat.type & vscode.FileType.File) {
                     if (zipFile.toString() !== expand.toString() && `file://${zipFile.toString()}` !== expand.toString()) {
                        statusMessage = vscode.window.setStatusBarMessage('Saving...');
                        const zipFileUri = (zipFile instanceof vscode.Uri) ? zipFile : vscode.Uri.parse(zipFile);
                        // await fs.promises.copyFile(zipFile, expand.fsPath, overwrite ? null : fs.constants.COPYFILE_EXCL);
                        try {
                           await vscode.workspace.fs.copy(zipFileUri, expand, { overwrite: overwrite });
                           console.log(`File copied from ${zipFileUri} to ${expand}`);
                        } catch (error) {
                           console.error(`Failed to copy file: ${error.message}`);
                        }
                        console.log(`Temporary Zip file ${zipFile} was copied successfully to file ${expand}`);
                        vscode.window.showInformationMessage(`Temporary Zip file ${zipFile} was copied successfully to file ${expand}`);
                     }
                  }
               } catch (error) {
                  if (error.code === 'ENOENT' || error.code === 'FileNotFound') {
                     // expand.fsPath does not exist yet
                     try {
                        if (saveAs) {
                           // copy Temp zip file to selected file path
                           statusMessage = vscode.window.setStatusBarMessage('Saving...');
                           const zipFileUri = (zipFile instanceof vscode.Uri) ? zipFile : vscode.Uri.parse(zipFile);
                           // await fs.promises.copyFile(zipFile, expand.fsPath, overwrite ? null : fs.constants.COPYFILE_EXCL);
                           await vscode.workspace.fs.copy(zipFileUri, expand, { overwrite: overwrite });
                           console.log(`Zip file successfully saved as ${expand}`);
                           vscode.window.showInformationMessage(`Zip file successfully saved as ${expand}`);
                        } else {
                           statusMessage = vscode.window.setStatusBarMessage('Saving...');
                           const expandFolder = vscode.Uri.joinPath(expand, '..');
                           //await extractZip(zipFile, path.dirname(expand.fsPath), overwrite);
                           await extractZip(zipFile, expandFolder, overwrite);
                           console.log(`Temporary Zip file ${zipFile} was extracted successfully to new folder ${expandFolder}`);
                           vscode.window.showInformationMessage(`Temporary Zip file ${zipFile} was extracted successfully to new folder ${expandFolder}`);
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



async function getXAuthToken(host) {
   if (host == null){
      host = await vscode.window.showInputBox({ 
         prompt: "Host name ?",
         ignoreFocusOut: true
      });
   }
   if (!host) throw new Error("getXAuthToken error: 'host' parameter must be specified");
   const restApi = new RestApi(undefined, host);
   // debugger ;
   await restApi.logon();
   return restApi.authToken;
}


async function restApiDownload(param, config = null, overwrite = null) {
   const restApi = new RestApi();
   if (typeof param === 'string') {
      param = uriFromString(param);
   }
   try {
      if (config && config.localRootPath && config.remoteEndpoint) {
         restApi.config = config;
         if (param instanceof vscode.Uri) {
            restApi.localFile = param;
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
      await restApi.saveFileContentsAs(param, overwrite);
   } catch (err) {
      console.log(err);
   }
}
console.log('typeof restApiDownload:', typeof restApiDownload);

// restApiView

async function restApiView(param, config = null, expectedMd5sum = null) {
   console.log('\n=== restApiView ===');
   console.log('(restApiView) param:', param);
   console.log('(restApiView) config:', config);
   console.log('(restApiView) expectedMd5sum:', expectedMd5sum);
   const restApi = new RestApi();
   if (typeof param === 'string') {
      param = uriFromString(param);
   }
   try {
      if (config && config.localRootPath && config.remoteEndpoint) {
         restApi.config = config;
         if (param instanceof vscode.Uri) {
            console.log('(restApiView) param:', param);
            restApi.localFile = param;
            console.log('(restApiView) restApi.localFile:', restApi.localFile);
            // restApi.localFileStat = await vscode.workspace.fs.stat(param);
            restApi.getRemoteFilePath();   // get Remote File Path
            console.log('(restApiView) restApi.remoteFile:', restApi.remoteFile);
         }
      } else {
         await restApi.getEndPointConfig(param);   // based on the passed Uri (if defined)
                                                   // otherwise based on the path of the local file open in the active editor
                                                   // also sets remoteFile
         if (!restApi.config) {
            return;
         }
         console.log('(restApiView) restApi.localFile:', restApi.localFile);
         console.log('(restApiView) restApi.remoteFile:', restApi.remoteFile);
      }
      // param: any, pick_multiple?: boolean, expectedMd5sum?: null
      // await restApi.getRemoteFileContents();
      await restApi.getRemoteFileContents(undefined, false, expectedMd5sum);
      console.log('restApi.fileContents?.length:', restApi.fileContents?.length);
      await restApi.viewFileContents();
   } catch (err) {
      debugger;
      console.log(err);
   }
   // debugger ;
   console.log('Done === restApiView ===\n');
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
      getObjectView(JSON.parse(properties), false, `${restApi.config.label} file properties: ${restApi.remoteFile}`, "Remote File Properties");
   } catch (err) {
      console.log(err);
   }
}
console.log('typeof restApiProperties:', typeof restApiProperties);



// restApiSubmitJob
async function restApiSubmitJob(param, context) {
   const restApi = new RestApi();
   restApi.context = context;
   try {
      const onlyRepo = false;
      await restApi.getEndPointConfig(param, onlyRepo);   // based on the passed Uri (if defined)
      // otherwise based on the path of the local file open in the active editor
      // also sets remoteFile
      if (!restApi.config) {
         return;
      }
      const submitThisJob = true;
      let jobData = await restApi.getRemoteJobParameters(param, submitThisJob);
      console.log(jobData);
   } catch (err) {
      console.log(err);
   }
}
console.log('typeof restApiSubmitJob:', typeof restApiSubmitJob);


// restApiViewManifest
async function restApiViewManifest(param, context) {
   const restApi = new RestApi();
   restApi.context = context;
   try {
      const onlyRepo = false;
      await restApi.getEndPointConfig(param, onlyRepo);   // based on the passed Uri (if defined)
      // otherwise based on the path of the local file open in the active editor
      // also sets remoteFile
      if (!restApi.config) {
         return;
      }
      let mnfData, xmlData;
      // debugger ;
      try {
         if (param instanceof vscode.Uri) {
            // The vscode.workspace.fs.readFile method returns a Uint8Array, so we need to convert it to a string before parsing it as JSON.
            const Uint8Content = await vscode.workspace.fs.readFile(param);
            xmlData = Buffer.from(Uint8Content).toString('utf8');
         }
         mnfData = await restApi.parseManifestXml(xmlData);         
      } catch (error) {
         debugger;
         console.log(error);
      } 
      const editable = false;
      if (mnfData){
         try{
            await getObjectView(mnfData, editable, "Job Submission Manifest", "Job Submission Manifest", this.context, restApi);
         } catch(error) {
            debugger;
            console.log('(submitJob) Error in getObjectView():', error);
         }
      }
      // console.log(mnfData);
   } catch (err) {
      console.log(err);
   }
}
console.log('typeof restApiViewManifest:', typeof restApiViewManifest);


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
      await restApi.getRemoteFileVersions(param);
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
      getObjectView(JSON.parse(versions), false, `${restApi.config.label} file versions: ${restApi.remoteFile}`, "Remote File Versions");
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
   restApiUpload,
   restApiSubmitJob,
   restApiViewManifest,
   restApiGetRemoteFileUri,
   restApiCopyRemoteFileUri,
   restApiCopyRemoteFilePath,
   getXAuthToken,
   restApiDeleteCredentials
};
