const vscode = require("vscode");
const beautify = require("js-beautify");
const path = require("path");

async function getEndpointConfigForCurrentPath(absoluteWorkingDir, onlyRepo = false, uniquePaths = false) {
   // Finds the first matching config file, if any, in the current directory, nearest ancestor, or user's home directory.
   let configFile = null;
   let searchFolder;
   let configFileStat;
   let workspaceFolder;
   if (!(absoluteWorkingDir instanceof vscode.Uri)) {
      absoluteWorkingDir = vscode.Uri.file(absoluteWorkingDir);
   }
   if (absoluteWorkingDir instanceof vscode.Uri) {
      workspaceFolder = vscode.workspace.getWorkspaceFolder(absoluteWorkingDir);
      searchFolder = absoluteWorkingDir;
   } 
   while (! configFile && searchFolder.toString() !== vscode.Uri.joinPath(searchFolder, '..').toString()) {
      try {
         const searchFile = vscode.Uri.joinPath(searchFolder, 'webdav.json');
         configFileStat = await vscode.workspace.fs.stat(searchFile);
         if (configFileStat.type === vscode.FileType.File) configFile = searchFile;
      } catch (error) {
         configFileStat = error;
         searchFolder = vscode.Uri.joinPath(searchFolder, '..');
      }
   } 

   if (configFile == null) {
      console.warn(`(getEndpointConfigForCurrentPath) Endpoint config file webdav.json not found in current VScode root folder: ${absoluteWorkingDir}`);
      vscode.window.showErrorMessage(
         "Endpoint config file for WebDAV (webdav.json) not found in current VScode root folder..."
      );
      return null;
   }
   console.log('configFile:', configFile);
   let restApiConfig;
   try {
      // restApiConfig = JSON.parse(fs.readFileSync(configFile));
      if (configFile instanceof vscode.Uri) {
         // The vscode.workspace.fs.readFile method returns a Uint8Array, so we need to convert it to a string before parsing it as JSON.
         const Uint8Content = await vscode.workspace.fs.readFile(configFile);
         restApiConfig = JSON.parse(Buffer.from(Uint8Content).toString('utf8'));
      } else {
         // The vscode.workspace.fs.readFile method returns a Uint8Array, so we need to convert it to a string before parsing it as JSON.
         const Uint8Content = await vscode.workspace.fs.readFile(vscode.Uri.file(configFile));
         restApiConfig = JSON.parse(Buffer.from(Uint8Content).toString('utf8'));
         // restApiConfig = JSON.parse(await vscode.workspace.fs.readFile(vscode.Uri.file(configFile)));  // wrong
      }
      restApiConfig = restApiConfig.map(
         config => Object.entries(config)
            .filter(([key, val]) => (val != null && typeof val === 'object' && typeof val.url === 'string'))
            .map(([key, val]) => {
               let url, path, loc;
               try {
                  url = val.url;
                  host = new URL(val.url).host;
                  path = new URL(val.url).pathname;
                  // "/content/66c7e5fa-58a2-4e98-9573-6ec7282f5d2f/proxy/xartest/lsaf/webdav/repo/clinical/test/indic/cdisc-pilot-0001/"
                  if (/^(?:\/content\/[\da-f-]+\/proxy\/\w+)?\/lsaf\/webdav\/(work|repo)/.test(path)) {
                     loc = path.match(/(?:\/content\/[\da-f-]+\/proxy\/\w+)?\/lsaf\/webdav\/(work|repo)/)[1];
                     path = path.replace(/^(?:\/content\/[\da-f-]+\/proxy\/\w+)?\/lsaf\/webdav\/(work|repo)/, '');
                  }
                  return ({url, host, loc, path, label: key});
               } catch (error) {
                  return ({url, host, loc, path, label: key, error: error.message});
               }
            })
         ).map(item => item[0]);
      if (onlyRepo) {
         restApiConfig = restApiConfig.filter(conf => {
            return (/\/repo\b/.test(conf?.label ||'') || /\/repo\b/.test(conf?.path || ''));
         });
      }
   } catch (error) {
      console.warn(`(getEndpointConfigForCurrentPath) Error parsing config File: ${configFile}, ${error.message}`);
      debugger;
      vscode.window.showErrorMessage(`Error parsing config File: ${configFile}, ${error.message}`)
   }
   
   let allEndpointsConfig;
   let config = {};
   if (Array.isArray(restApiConfig)) {
      if (uniquePaths) {
         const endpointConfigDirectory = vscode.Uri.joinPath(configFile, '..');

         const relativeWorkingDir = absoluteWorkingDir.path
            .slice(endpointConfigDirectory.path.length)
            .replace(/\\/g, "/"); // On Windows replace \ with /
         console.log('(getEndpointConfigForCurrentPath) relativeWorkingDir:', relativeWorkingDir);

         const filePaths = restApiConfig.map(conf => conf.path);
         const uniquePathsList = {};
         filePaths.forEach((path, index) => {
            if(!uniquePathsList[path]) uniquePathsList[path] = [];
            uniquePathsList[path].push({...restApiConfig[index], configFile });
         });
         //
         return uniquePathsList;
      } else {
         const configChoices = restApiConfig.map((config, index) =>
            config.label || "Config " + (index + 1).toString()
         );
         const selectedConfig = await vscode.window.showQuickPick(configChoices, {
            placeHolder: "Choose a remote location",
            canPickMany: false,
         });
         if (selectedConfig == null) {
            return;
         }
         allEndpointsConfig =
            restApiConfig[
            configChoices.findIndex((config) => config === selectedConfig)
            ];
         config.label = selectedConfig;
      }
   } else {
      allEndpointsConfig = restApiConfig;
   }
   console.log("allEndpointsConfig:\n", beautify(JSON.stringify(allEndpointsConfig)));
   console.log("configFile:", configFile);

   if (configFile != null && allEndpointsConfig) {
      // const endpointConfigDirectory = configFile.slice(0, configFile.lastIndexOf(path.sep));
      // const endpointConfigDirectory = path.dirname(configFile);
      const endpointConfigDirectory = vscode.Uri.joinPath(configFile, '..');

      const relativeWorkingDir = absoluteWorkingDir.path
         .slice(endpointConfigDirectory.path.length)
         .replace(/\\/g, "/"); // On Windows replace \ with /
      console.log('(getEndpointConfigForCurrentPath) relativeWorkingDir:', relativeWorkingDir);
      let endpointConfig = null;
      let currentSearchPath = relativeWorkingDir;
      let configOnCurrentSearchPath = null;

      while (!endpointConfig) {
         configOnCurrentSearchPath = allEndpointsConfig[currentSearchPath];

         if (!configOnCurrentSearchPath) {
            // Maybe the path in the configuration has a trailing '/'
            configOnCurrentSearchPath = allEndpointsConfig[currentSearchPath + "/"];
         }

         if (configOnCurrentSearchPath) {
            endpointConfig = configOnCurrentSearchPath;
         } else {
            currentSearchPath = currentSearchPath.slice(
                  0,
                  currentSearchPath.lastIndexOf("/")
            );

            if (currentSearchPath === "") {
               // issue #1 - check root mapping
               endpointConfig = allEndpointsConfig["/"];

               if (!endpointConfig) {
                  vscode.window.showErrorMessage(
                     "Cannot find a remote endpoint configuration for the current working directory " +
                     relativeWorkingDir +
                     " in webdav.json..."
                  );
                  return null;
               }
            }
         }
      }

      currentSearchPath = endpointConfigDirectory.with({path: endpointConfigDirectory.path.replace(
         workspaceFolder.uri.path, ''
      )})


      config = {
         ...config,
         localRootPath: currentSearchPath,
         remoteEndpoint: endpointConfig,
         workspaceFolder,
         configFile
      }
      return config;
   }
}

module.exports = { getEndpointConfigForCurrentPath };
