const vscode = require("vscode");

// Global variable to store authentication tokens (in memory only)
export const authTokens = {};

export function setAuthTokens (key, value) {
   authTokens[key] = value;
}
let secretStorage;

// Initialize the secret module with SecretStorage from the activate function
export function initializeSecretModule(storage) {
   secretStorage = storage;
}

export class CredentialStore{
   constructor(){
      this.app = 'jbodart-argenx.lsaf-rest-api';
   }

   async GetCredential(key){
      try {
         // const jsonCreds = await keytar.getPassword(this.app, key);
         const jsonCreds = await secretStorage.get(key);
         if (!jsonCreds) return null;
         const creds = JSON.parse(jsonCreds);
         const newCreds = {
            newCredentials: false,
            _username: creds.username,
            _password: creds.password,
         };
         return newCreds;
      } catch (error) {
         console.error(error.message)
      }
   }

   async SetCredential(key, username, password){
      // await keytar.setPassword(this.app, key, JSON.stringify({username, password}));
      await secretStorage.store(key, JSON.stringify({username, password}));
   }
}

export const credStore = new CredentialStore();


export const EMPTY_CREDENTIALS = {
   newCredentials: true,
   _username: "",
   _password: "",
};


export async function getCredentials(key) {
   let credentials;
   try {
      credentials = await credStore.GetCredential(key);
      if (credentials?._username && credentials?._password) {
         return credentials;
      } else {
         credentials = await askForCredentials(key);
         return credentials;
      }
   } catch (error) {
      console.error(error.message)
   }         
}

export async function askForCredentials(key) {
   try {
      const username = await vscode.window.showInputBox({ 
         prompt: "Username for " + key + " ?",
         ignoreFocusOut: true
      });
      if (!username) {
         return(EMPTY_CREDENTIALS);
      }

      const password = await vscode.window.showInputBox({ 
         prompt: "Password ?", 
         password: true ,
         ignoreFocusOut: true
      });
      if (!password) {
         return(EMPTY_CREDENTIALS);
      }

      return(  {
                  newCredentials: true,
                  _username: username,
                  _password: password,
               });
   } catch (error) {
      console.error(error.message);
   }
}

export async function storeCredentials(key, username, password) {
   await credStore.SetCredential(key, username, password);
}
