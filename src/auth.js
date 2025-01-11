const vscode = require("vscode");

function defineAccessTokenFunctions() {
   // Closure variable to store authentication tokens (in memory only)
   const authTokens = {};

   function setAuthToken (key, value) {
      authTokens[key] = value;
   }

   function getAuthToken (key) {
      return authTokens[key];
   }

   function deleteAuthTokens (key) {
      if (key === '*') {
         const keys = Object.getOwnPropertyNames(authTokens);
         keys.forEach(key => {
            delete authTokens[key];
         });
      }
      delete authTokens[key];
   }
   return { setAuthToken, getAuthToken, deleteAuthTokens };
}

const { setAuthToken, getAuthToken, deleteAuthTokens } = defineAccessTokenFunctions();

let secretStorage;

// Initialize the secret module with SecretStorage from the activate function
function initializeSecretModule(storage) {
   secretStorage = storage;
}

class CredentialStore{
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

   async DeleteCredential(key) {
      await secretStorage.delete(key);
   }
}

const credStore = new CredentialStore();


const EMPTY_CREDENTIALS = {
   newCredentials: true,
   _username: "",
   _password: "",
};


async function getCredentials(key) {
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

async function askForCredentials(key) {
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

async function storeCredentials(key, username, password) {
   await credStore.SetCredential(key, username, password);
}

async function deleteCredentials(key) {
   if (!key) throw new Error('deleteCredentials: no hostname provided, aborting.');
   deleteAuthTokens(key);
   await credStore.DeleteCredential(key);
   const shortkey = String(key).split('.')[0];
   if (process.env[`${shortkey}_encpasswd`]) {
      delete process.env[`${shortkey}_encpasswd`];
      console.log(`Deleted environment variable: "${shortkey}_encpasswd"`);
   } else {
      console.log(`Environment variable "${shortkey}_encpasswd" does not exist.`);
   }
   if (process.env[`${shortkey}_passwd`]) {
      delete process.env[`${shortkey}_passwd`];
      console.log(`Deleted environment variable: "${shortkey}_passwd"`);
   } else {
      console.log(`Environment variable "${shortkey}_passwd" does not exist.`);
   }
   const credentials = await credStore.GetCredential(key);
   if (credentials == null) {
      console.log(`Host ${key} credentials successfully deleted.`);
   } else {
      console.error(`Host ${key} credentials were NOT deleted!`);
   }
}

module.exports = { 
   storeCredentials, askForCredentials, getCredentials, deleteCredentials, EMPTY_CREDENTIALS, credStore, CredentialStore,
   initializeSecretModule, setAuthToken, getAuthToken, deleteAuthTokens
};
