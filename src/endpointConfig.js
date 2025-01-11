const vscode = require("vscode");
const beautify = require("js-beautify");
const path = require("path");

// Default endpoints are defined in the settings.json file
// they can be overridden by the user in the settings.json file
// a) Via Settings UI:
//    Open the Command Palette (Ctrl+Shift+P).
//    Type Preferences: Open Settings (UI) and select it.
//    In the search bar, type lsaf-rest-api.
//    You will see the Default Endpoints setting where you can add, remove, or modify the endpoints.
// b) Via settings.json:
//    Open the Command Palette (Ctrl+Shift+P).
//    Type Preferences: Open Settings (JSON) and select it.
//    Add or modify the lsaf-rest-api.defaultEndpoints property in the settings.json file
function getDefaultEndpoints() {
   const config = vscode.workspace.getConfiguration('lsaf-rest-api');
   return config.get('defaultEndpoints');
}

let defaultEndpoints = getDefaultEndpoints();
console.log('Default Endpoints:', defaultEndpoints);

vscode.workspace.onDidChangeConfiguration((e) => {
   if (e.affectsConfiguration('lsaf-rest-api.defaultEndpoints')) {
      defaultEndpoints = getDefaultEndpoints();
      console.log('Updated Default Endpoints:', defaultEndpoints);
   }
});

async function getEndpointConfigForCurrentPath(absoluteWorkingDir, onlyRepo = false, uniquePaths = false, chooseNewEndpoint = false) {
   // Finds the first matching config file, if any, in the current directory, nearest ancestor, or user's home directory.
   let configFile = null;
   let searchFolder;
   let configFileStat;
   let workspaceFolder;
   let restApiConfig = null;
   let allEndpointsConfig;
   let config = {};
   // get the user's home directory
   const userHomeDir = process.env.HOME || process.env.USERPROFILE;
   // check for existing files in the user's home directory: lsafSync.json, .lsf/lsaf.json
   const homeDirFiles = ['lsafSync.json', '.lsaf/lsaf.json'];
 
   if (!(absoluteWorkingDir instanceof vscode.Uri)) {
      absoluteWorkingDir = uriFromString(absoluteWorkingDir);
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

      if (/^lsaf-(repo|work)$/.test(searchFolder.scheme) && searchFolder.path === '/') {
         while (! configFile && homeDirFiles.length > 0) {
            try {
               const searchFile = uriFromString(path.join(userHomeDir, homeDirFiles.shift()));
               configFileStat = await vscode.workspace.fs.stat(searchFile);
               if (configFileStat.type === vscode.FileType.File) configFile = searchFile;
            } catch (error) {
               configFileStat = error;
            }
         }
         if (configFile) {
            if (configFile instanceof vscode.Uri) {
               // The vscode.workspace.fs.readFile method returns a Uint8Array, so we need to convert it to a string before parsing it as JSON.
               const Uint8Content = await vscode.workspace.fs.readFile(configFile);
               restApiConfig = JSON.parse(Buffer.from(Uint8Content).toString('utf8'));
            } else {
               // The vscode.workspace.fs.readFile method returns a Uint8Array, so we need to convert it to a string before parsing it as JSON.
               const Uint8Content = await vscode.workspace.fs.readFile(uriFromString(configFile));
               restApiConfig = JSON.parse(Buffer.from(Uint8Content).toString('utf8'));
            }
            if (!Array.isArray(restApiConfig) && typeof restApiConfig === 'object') {
               if (restApiConfig.localRootFolder) {
                  restApiConfig = { localRootFolder: restApiConfig.localRootFolder };
                  restApiConfig.localRootPath = '/';
                  restApiConfig.path = workspaceFolder.uri.path || '/';
                  restApiConfig.workspaceFolder = workspaceFolder;
                  restApiConfig.label = `${searchFolder.authority}/${searchFolder.scheme.split('-')[1]}`;
                  restApiConfig.loc = searchFolder.scheme.split('-')[1];
                  restApiConfig.host = searchFolder.authority;
                  restApiConfig.url = `https://${searchFolder.authority}.ondemand.sas.com/lsaf/webdav/${searchFolder.scheme.split('-')[1]}${restApiConfig.path}`;
                  restApiConfig.lsafUri = vscode.Uri.parse(`${searchFolder.scheme}://${searchFolder.authority}${restApiConfig.path}`);
                  restApiConfig['/'] = { ...restApiConfig };
                  config.label = restApiConfig.label;
               }
               const newEndpoints = [];
               if (chooseNewEndpoint && Array.isArray(defaultEndpoints)) {
                  defaultEndpoints.forEach(endpoint => {
                     if (typeof endpoint === 'object' &&
                        typeof endpoint.url === 'string' &&
                        typeof endpoint.label === 'string' && 
                        endpoint.label !== restApiConfig.labelc&&
                        onlyRepo ? /\/repo\b/.test(endpoint.label) : true
                     ) {
                        endpoint.localRootFolder = restApiConfig.localRootFolder;
                        endpoint.url = `${endpoint.url.replace(/\/$/, '')}${restApiConfig.path}`;
                        endpoint.host = new URL(endpoint.url).host;
                        endpoint.loc = /^(work|repo)$/.test(endpoint.label.split('/')[1]) ? endpoint.label.split('/')[1] : restApiConfig.loc;
                        endpoint.path = restApiConfig.path;
                        endpoint.lsafUri = vscode.Uri.parse(`lsaf-${endpoint.loc}://${endpoint.host.split('.')[0]}${endpoint.path}`);
                        endpoint['/'] = { ...endpoint };
                        newEndpoints.push(endpoint);
                     }
                  });
               }
               if (newEndpoints.length > 0) {
                  debugger;
                  console.log('newEndpoints:', beautify(JSON.stringify(newEndpoints)));
                  // Let the user choose from the list of new endpoints according to label
                  const configChoices = newEndpoints.map((config, index) =>   config.label || "Config " + (index + 1).toString());
                  const selectedConfigLabel = await vscode.window.showQuickPick(configChoices, {
                     placeHolder: "Choose a remote location",
                     canPickMany: false,
                  });
                  if (selectedConfigLabel == null) {
                     // return;
                     // Arbitrary choice of the first endpoint in the list
                     selectedConfigLabel = configChoices[0];
                  }
                  const restApiConfigOrig = { ...restApiConfig };
                  console.log('restApiConfigOrig:', beautify(JSON.stringify(restApiConfigOrig)));
                  restApiConfig = { ...restApiConfig, ...newEndpoints[configChoices.findIndex((configLabel) => configLabel === selectedConfigLabel)] };
                  allEndpointsConfig = restApiConfig;
                  let endpointConfig = allEndpointsConfig["/"];
                  config = {
                     ...config,
                     localRootPath: currentSearchPath, //uriFromString(currentSearchPath),
                     remoteEndpoint: endpointConfig,
                     workspaceFolder,
                     configFile
                  }
                  console.log('config:', beautify(JSON.stringify(config)));
                  console.log(`So "${config.workspaceFolder.uri.with({path: config.workspaceFolder.uri.path + config.localRootPath.path})
                     }" is the local path that matches the remote location "${config.remoteEndpoint.lsafUri
                     }" at URL: ${config.remoteEndpoint.url
                     }.`);
                  return config;
               } else {
                  let currentSearchPath = '/';
                  allEndpointsConfig = restApiConfig;
                  let endpointConfig = allEndpointsConfig["/"];
                  /* e.g. endpointConfig =
                     {
                        "url": "https://xarprod.ondemand.sas.com/lsaf/webdav/repo/general/biostat/macros/testing/",
                        "host": "xarprod.ondemand.sas.com",
                        "loc": "repo",
                        "path": "/general/biostat/macros/testing/",
                        "label": "xarprod/repo",
                        "lsafUri": "lsaf-repo://xarprod/general/biostat/macros/testing/"
                     }
                  */
                  config = {
                     ...config,
                     localRootPath: currentSearchPath, //uriFromString(currentSearchPath),
                     remoteEndpoint: endpointConfig,
                     workspaceFolder,
                     configFile
                  }
                  console.log('config:', beautify(JSON.stringify(config)));
                  console.log(`So "${config.workspaceFolder.uri.with({path: config.workspaceFolder.uri.path + config.localRootPath.path})
                     }" is the local path that matches the remote location "${config.remoteEndpoint.lsafUri
                     }" at URL: ${config.remoteEndpoint.url
                     }.`);
                  return config;
               }
            }
         }
      }

   }

   if (configFile == null) {
      vscode.window.showErrorMessage(
         `Endpoint config file for WebDAV (webdav.json) not found in current VScode root folder nor in Home Directory Files: ${homeDirFiles} ...`
      );
      return null;
   }

   console.log('configFile:', configFile);

   if (! restApiConfig) {
      try {
         // restApiConfig = JSON.parse(fs.readFileSync(configFile));
         if (configFile instanceof vscode.Uri) {
            // The vscode.workspace.fs.readFile method returns a Uint8Array, so we need to convert it to a string before parsing it as JSON.
            const Uint8Content = await vscode.workspace.fs.readFile(configFile);
            restApiConfig = JSON.parse(Buffer.from(Uint8Content).toString('utf8'));
         } else {
            // The vscode.workspace.fs.readFile method returns a Uint8Array, so we need to convert it to a string before parsing it as JSON.
            const Uint8Content = await vscode.workspace.fs.readFile(uriFromString(configFile));
            restApiConfig = JSON.parse(Buffer.from(Uint8Content).toString('utf8'));
            // restApiConfig = JSON.parse(await vscode.workspace.fs.readFile(uriFromString(configFile)));  // wrong
         }
         if (!Array.isArray(restApiConfig)) {
            if (typeof restApiConfig !== 'object') { 
               return null;
            }
            if (restApiConfig.localRootFolder) {

            }
            restApiConfig = [restApiConfig];
         }
         restApiConfig = restApiConfig.map(
            (config, index) => Object.entries(config)
               .filter(([key, val]) => (val != null && typeof val === 'object' && typeof val.url === 'string'))
               .map(([key, val]) => {
                  let url, path, loc, label, host, lsafUri, returnObject;
                  try {
                     url = val.url;
                     host = new URL(val.url).host;
                     path = new URL(val.url).pathname;
                     label = restApiConfig[index].label || key;
                     // "/content/66c7e5fa-58a2-4e98-9573-6ec7282f5d2f/proxy/xartest/lsaf/webdav/repo/clinical/test/indic/cdisc-pilot-0001/"
                     if (/^(?:\/content\/[\da-f-]+\/proxy\/\w+)?\/lsaf\/webdav\/(work|repo)/.test(path)) {
                        loc = path.match(/(?:\/content\/[\da-f-]+\/proxy\/\w+)?\/lsaf\/webdav\/(work|repo)/)[1];
                        path = path.replace(/^(?:\/content\/[\da-f-]+\/proxy\/\w+)?\/lsaf\/webdav\/(work|repo)/, '');
                     }
                     lsafUri = `lsaf-${loc}://${host.split('.')[0]}${path}`;
                     returnObject = {label};
                     returnObject[key] = {url, host, loc, path, label, lsafUri};
                     return returnObject;
                     // return ({url, host, loc, path, label, key});
                  } catch (error) {
                     returnObject = {label, error: error.message};
                     returnObject[key] = {url, host, loc, path, label, lsafUri};
                     return returnObject;
                     // return ({url, host, loc, path, label, key, error: error.message});
                  }
               })
            ).map(item => item[0]);
         console.log('restApiConfig:', beautify(JSON.stringify(restApiConfig)));
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
   }
   
   // let allEndpointsConfig;
   // let config = {};
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
            const lastSlashIndex = currentSearchPath.lastIndexOf("/");
            if (lastSlashIndex === -1) {
               currentSearchPath = "";
            } else {
               currentSearchPath = currentSearchPath.slice(
                  0,
                  currentSearchPath.lastIndexOf("/")
               );
            }

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


      /* example: endpointConfig =
         {
            "url": "https://xarprod.ondemand.sas.com/lsaf/webdav/repo/general/biostat/macros/testing/",
            "host": "xarprod.ondemand.sas.com",
            "loc": "repo",
            "path": "/general/biostat/macros/testing/",
            "label": "xarprod/repo",
            "lsafUri": "lsaf-repo://xarprod/general/biostat/macros/testing/"
         }
      */

      config = {
         ...config,
         localRootPath: currentSearchPath,
         remoteEndpoint: endpointConfig,
         workspaceFolder,
         configFile
      }
      console.log('config:', beautify(JSON.stringify(config)));

      /* example:

      config: {
         "label": "xartest/repo",
         "localRootPath": {
            "$mid": 1,
            "path": "/testing",
            "scheme": "file"
         },
         "remoteEndpoint": {
            "url": "https://xartest.ondemand.sas.com/lsaf/webdav/repo/general/biostat/macros/testing/",
            "host": "xartest.ondemand.sas.com",
            "loc": "repo",
            "path": "/general/biostat/macros/testing/",
            "label": "xartest/repo",
            "lsafUri": "lsaf-repo://xartest/general/biostat/macros/testing/"
         },
         "workspaceFolder": {
            "uri": {
                  "$mid": 1,
                  "fsPath": "c:\\Users\\jbodart\\lsaf\\files\\general\\biostat\\macros",
                  "_sep": 1,
                  "external": "file:///c%3A/Users/jbodart/lsaf/files/general/biostat/macros",
                  "path": "/C:/Users/jbodart/lsaf/files/general/biostat/macros",
                  "scheme": "file"
            },
            "name": "macros",
            "index": 1
         },
         "configFile": {
            "$mid": 1,
            "fsPath": "c:\\Users\\jbodart\\lsaf\\files\\general\\biostat\\macros\\testing\\webdav.json",
            "_sep": 1,
            "path": "/C:/Users/jbodart/lsaf/files/general/biostat/macros/testing/webdav.json",
            "scheme": "file"
         }
      }
      */

      return config;
   }
}

module.exports = { getEndpointConfigForCurrentPath };
