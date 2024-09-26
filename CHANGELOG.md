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

- Add sepaarte actions on local folder view, remote folder view and compared folders view
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
