# WebDAV support for Visual Studio Code

The WebDAV extension makes it easy to compare and upload files to a remote WebDAV server.

Commands added by this extension:
- WebDAV: Compare ( `extension.webdavCompare` )
- WebDAV: Upload ( `extension.webdavUpload` )

## Configuration
To configure one or more remote endpoints, add a `webdav.json` to your project root. In this file you can define the endpoints based on one or more folders.

### webdav.json Structure
| Key  | Value |
| ------------- | ------------- |
| The path, relative to webdav.json, that corresponds to the root of the WebDAV endpoint | <ul><li>`url` (String): The URL of the WebDAV endpoint</li><li>`ignoreSSLErrors` (Boolean, optional): Ignore SSL verification errors. This option is mainly intended for DEV endpoints that have a self-signed SSL certificate.</li></ul>   |

### webdav.json Example

Assuming the current VScode workspace has subfolders each with corresponding distinct webdav locations

- /frontend/www
- /another-frontend/www

```json
{
    "/frontend/www": {
        "url": "https://webdav.example.com/"
    },
    "/another-frontend/www": {
        "url": "https://webdav2.example.com/",
        "ignoreSSLErrors": true
    }
}
```

Assuming the current VScode workspace root folder has multiple corresponding webdav locations:

```json
[
    {
        "label": "example-test/work",
        "/": {
                "url": "https://example-test.com/webdav/work/programs/"
            }
    },
    {
        "label": "example-prod/work",
        "/": {
                "url": "https://example-prod.com/webdav/work/programs/"
            }
    },
    {
        "label": "example-other/work",
        "/": {
                "url": "https://example-other.com/webdav/work/programs/"
            }
    }
]   
```

## Password storage
The first time you connect to a new remote endpoint this extension will ask for a username and password. These credentials will be stored in the system's keychain (using the `keytar` library). On macOS the passwords are managed by the Keychain, on Linux they are managed by the Secret Service API/libsecret, and on Windows they are managed by Credential Vault.
