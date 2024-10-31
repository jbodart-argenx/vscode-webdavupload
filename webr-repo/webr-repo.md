# Creating a filesystem image with a library of pre-installed webR packages

## Relevant documentation

### webR: R in the browser
https://docs.r-wasm.org/webr/latest/
https://github.com/r-wasm/webr

### Introduction to rwasm
[rwasm: Build R Packages for WebAssembly](https://r-wasm.github.io/rwasm/)

### Getting started with rwasm 
[link](https://r-wasm.github.io/rwasm/articles/rwasm.html)

Section:
- 'Using the webR Docker container' in [Setting up the WebAssembly toolchain](https://r-wasm.github.io/rwasm/articles/rwasm.html#setting-up-the-webassembly-toolchain)


### Mounting filesystem images 
[link](https://r-wasm.github.io/rwasm/articles/mount-fs-image.html)

Section:
- [Building an R package library image](https://r-wasm.github.io/rwasm/articles/mount-fs-image.html#building-an-r-package-library-image)

---

## Useful commands - using Docker container as build environment for webR packages

At unix command prompt:
```sh
# Create directories
mkdir output
mkdir output/repo
mkdir output/vfs
# Make sure they are writable
chmod -R ug+rw output
# Setup docker container and run R within it
docker run -it --rm -v ${PWD}/output:/output -w /output ghcr.io/r-wasm/webr:main R
```

At R prompt (running within container):
```r
# Use dependencies = NA to include all packages hard dependencies:
rwasm::add_pkg(c('haven', 'jsonlite', 'data.table'), dependencies = NA)

rwasm::make_vfs_library()

# When completely done, close R session:
quit(save = "no")
````

At unix command prompt:

```sh
# Copy filesystem image into VScode extension directory
cp output/vfs/library.*  /path/to/VScode-extension-project/webr-repo

# Run test program using webR library filesystem image
node /path/to/VScode-extension-project/test/read_sas.test.js

# Run test program downloading and installing webR packages on the flight
# as an alternative to sing webR library filesystem image
node /path/to/VScode-extension-project/test/test-webR-haven.js
```

If needed, run a shell session within the container:

```sh
docker run -it --rm -v ${PWD}/output:/output -w /output ghcr.io/r-wasm/webr:main bash
```
