const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const findConfig = require("find-config");

export async function getEndpointConfigForCurrentPath(absoluteWorkingDir, onlyRepo = false) {
   // Finds the first matching config file, if any, in the current directory, nearest ancestor, or user's home directory.
   const configFile = findConfig("webdav.json", { cwd: absoluteWorkingDir });

   if (configFile == null) {
      vscode.window.showErrorMessage(
         "Endpoint config file for WebDAV (webdav.json) not found in current VScode root folder..."
      );
      return null;
   }
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
      allEndpointsConfig =
         restApiConfig[
         configChoices.findIndex((config) => config === selectedConfig)
         ];
      config.label = selectedConfig;
   } else {
      allEndpointsConfig = restApiConfig;
   }
   console.log("allEndpointsConfig:", allEndpointsConfig);
   console.log("configFile:", configFile);

   if (configFile != null && allEndpointsConfig) {
      const endpointConfigDirectory = configFile.slice(
         0,
         configFile.lastIndexOf(path.sep)
      );

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

      config = {
         ...config,
         localRootPath: currentSearchPath,
         remoteEndpoint: endpointConfig,
      }
      return config;
   }
}