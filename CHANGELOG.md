# Change Log

## 0.0.1

- Initial release

## 0.0.2

- Add support to retrieve folder/container properties

## 0.0.3

- ...

## 0.0.4

- ...

## 0.0.5

- ...

## 0.0.6

- Switch to VScode built-in Secret Storage to store credentials

## 0.0.7

- Add folder comparison command: "extension.compareFolderContents"
- Extract classes and functions to new modules: rest-api.js, auth.js, endpointConfig.js
- Add local file actions "Upload" and "Compare to Remote"
- Add remote file actions menu

## 0.0.8

- Add folder open action for both local and remote single folder views
- Warn in case File Download action would overwrite an existing file
- Properly handle "View" action on remote binary files
- Skip download of big remote files (>= 100 MB)
- Distinguish local from remote file actions in 2 Folders Compare Views

## 0.0.9

- Add separate actions on local folder view, remote folder view and compared folders view
- Add folder zip, upload and expand functionality
- Add folder download as Zip, and download & expand functionality
- Ignore FocusOut in showInputBox() calls
- Handle null values returned from vscode.window.showQuickPick()
- Restructure modules to avoid cross-imports between modules
- Use encodeURI() to deal with special characters (e.g. spaces in filenames) in URLs
- Add 10sec timeout to PUT requests in uploadFile()
- Implement multiple actions in showFolderView()
- Add refresh button & action to getOneFolderWebviewContent()
- Updated method getRemoteFileContents() to accept paths as strings and versions.items with single element, and content-type: application/x-sas

## 1.0.0

- Add "refresh" button in Compare Two Folders view
- Package updates

## 1.1.0

- Add import of .sas7bdat and .xpt files using webR and haven package
- Dispaly imported tabular data as JSON and with new showTableView() function

## 1.1.1

- Use webpack to fix issues with webR bundling
- Replace node-fetch with axios and fix strange error: fetch is not a function
- Use commonJS-style exports for consistency

## 1.1.2

- Fix issue with configuration file webdav.json not found in case local file/folder does not exist

## 1.1.3

- Prompt for (new) credentials in case of logon() failure
- Fix issue with  zip file extraction by using 'original-fs' package
- Add submitJob command
- Monitor LSAF job submission, get, parse and display job manifest upon completion
- Handle 'chunked' transferEncoding in downloads
- Improve object viewing using (nested) HTML tables
- Improve performance of HTML table sorting
- Upload File to Repo creates new minor version
- Report & check md5sum of downloaded files
- Replace most filesystem access methods from node 'fs' to 'vscode.workspace.fs' (should allow access to remote & virtual filesystems)

## 1.2.0

- Improve performance of read_sas and read_xpt by mounting a filesystem image library of pre-installed webR packages (avoid need for download at run-time)
- Use monospace font and preserve white space in MultiLineText webview
- Add custom SAS Dataset Previewer provider for .xpt and .sas7bdat files
- Add openUrl capability to Object Viewer
- Retain context when TableView tabs are hidden
- Open downloaded files with matching provider if any, otherwise with external System Default Application (Windows only)
- Show filename in Table View webview tabs
