const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const findConfig = require("find-config");
const beautify = require("js-beautify");

export async function getEndpointConfigForCurrentPath(absoluteWorkingDir, onlyRepo = false) {
   // Finds the first matching config file, if any, in the current directory, nearest ancestor, or user's home directory.
   const configFile = findConfig("webdav.json", { cwd: absoluteWorkingDir });

   const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(absoluteWorkingDir));

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
      restApiConfig = JSON.parse(fs.readFileSync(configFile));
      if (onlyRepo) {
         restApiConfig = restApiConfig.filter(conf => {
            return (/\/repo\b/.test(conf?.label ||'') || /\/repo\b/.test(conf?.["/"] || ''));
         });
      }
   } catch (error) {
      vscode.window.showErrorMessage(`Error parsing config File: ${configFile}, ${error.message}`)
   }
   
   let allEndpointsConfig;
   let config = {};
   if (Array.isArray(restApiConfig)) {
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
   } else {
      allEndpointsConfig = restApiConfig;
   }
   console.log("allEndpointsConfig:\n", beautify(JSON.stringify(allEndpointsConfig)));
   console.log("configFile:", configFile);

   if (configFile != null && allEndpointsConfig) {
      // const endpointConfigDirectory = configFile.slice(0, configFile.lastIndexOf(path.sep));
      const endpointConfigDirectory = path.dirname(configFile);

      const relativeWorkingDir = absoluteWorkingDir
         .slice(endpointConfigDirectory.length)
         .replace(/\\/g, "/"); // On Windows replace \ with /

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

      currentSearchPath = endpointConfigDirectory.replace(
         workspaceFolder.uri.fsPath, ''
      )


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