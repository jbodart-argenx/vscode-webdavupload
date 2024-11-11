const path = require('path');
const vscode = require('vscode');
const { WebR } = require('webr');
const fs = require('fs');

let webR;
// let webrRepo;

async function initWebR(webrLibPath = path.join(__dirname, '..', 'webr-repo')) {
   webR = new WebR();
   await webR.init();
   // Mount filesystem image with a library of pre-installed R packages
   await webR.FS.mkdir('/my-library');
   let libdata = fs.readFileSync(path.join(webrLibPath, 'library.data'));
   let libmetadata = JSON.parse(fs.readFileSync(path.join(webrLibPath, 'library.js.metadata'), 'utf-8'));
   await webR.FS.mount(
      "WORKERFS", 
      {
         packages: [
            {
               blob: libdata,
               metadata: libmetadata,
            }
         ],
      },
      '/my-library'
   );
   await webR.evalR(`.libPaths(c(.libPaths(), "/my-library"))`);
   // // Download and install additional R packages (if not available from mounted library)
   // await webR.installPackages(['haven', 'jsonlite'],
   //    {mount: true, quiet: false, repos: "https://repo.r-wasm.org/"}
   // );
   // Make virtual filesystem directory where actual data folders will be mounted
   await webR.FS.mkdir('/data');
   return webR;
}

async function read_dataset(file, rows, cols, maxRows, offset = 0, type = null){
   rows = rows ?? '';
   cols = cols ?? '';
   type = type ?? path.parse(`${file}`).ext.replace(/^\./, '');
   console.log('(read_dataset) type:', type, ', file:', file);
   let filename, isDataMounted = false;
   filename = path.basename(`${file}`);
   console.log('(read_dataset) filename:', filename);
   let fileData, message;
   if (file instanceof vscode.Uri  && file.scheme !== 'file') {
      try {
         console.log(`(read_dataset) Reading file from Uri: ${file} ...`);
         fileData = await vscode.workspace.fs.readFile(file);
         console.log(`(read_dataset) Writing file to Emscripten Virtual File System: /data/${filename} ...`);
         await webR.FS.writeFile(`/data/${filename}`, new Uint8Array(fileData));
         console.log(`(read_dataset) successfully written file: /data/${filename}`);
         let dataFilesR = await webR.evalR(`list.files(path='/data')`)
         console.log(await dataFilesR.toArray());
         await webR.destroy(dataFilesR);
      } catch (error) {
         // debugger;
         console.error(`(read_dataset) Error writing file to Emscripten Virtual File System: /data/${filename}:`, error);
         throw error;
      }
   } else {
      if (file instanceof vscode.Uri   && file.scheme === 'file') {
         file = file.fsPath;
      }
      // Identify directory with data
      let datadir = path.dirname(file);
      message = 'Ok';
      // let rootFilesR, dataFilesR, data_str;
      console.log('(read_dataset) datadir:', datadir);
      // Mount directory with data
      try{
         // rootFilesR = await webR.evalR(`list.files(path='/')`);
         // console.log(await rootFilesR.toArray());
         // dataFilesR = await webR.evalR(`list.files(path='/data')`)
         // console.log(await dataFilesR.toArray());
         await webR.FS.mount('NODEFS', {root:  datadir}, "/data");
         isDataMounted = true;
         // dataFilesR = await webR.evalR(`list.files(path='/data')`)
         // console.log(await dataFilesR.toArray());
      } catch(err) {
         console.log('(read_dataset) Error:', err);
         throw err;
      }
   }
   // Read data and export as JSON
   try{
      if (type === 'sas7bdat') {
         await webR.evalR(`data <- haven::read_sas("/data/${filename}")`);
      } else if (type === 'xpt') {
         await webR.evalR(`data <- haven::read_xpt("/data/${filename}")`);
      } else if (type === 'rds') {
         await webR.evalR(`data <- readRDS("/data/${filename}")`);
      } else {
         await webR.evalR(`data <- data.frame()`) // data.frame with 0 rows, 0 columns
         message = 'Invalid type';
         debugger ;
      }
      await webR.evalR(`jsonlite::toJSON(str(data))`);
   } catch(err) {
      debugger;
      console.log('(read_dataset): Read Data error:', err);
   }
   let isDataFrameR = await webR.evalR(`is.data.frame(data)`);
   let isDataFrame = await isDataFrameR.toArray();
   await webR.destroy(isDataFrameR);
   if (isDataFrame) {
      await webR.evalR(`data.table::setDT(data)`);
   } else {
      await webR.evalR(`data <- data.table::data.table(data)`);
   }
   let colnamesR = await webR.evalR(`colnames(data)`);
   let colnames = await colnamesR.toArray();
   console.log('(read_dataset): colnames:', colnames);
   await webR.destroy(colnamesR);
   let fullSizeR = await webR.evalR(`dim(data)`);
   let fullSize = await fullSizeR.toArray();
   await webR.destroy(fullSizeR);
   console.log('(read_dataset): fullSize:', fullSize);
   try {
      if (Array.isArray(cols)) {
         console.log(`(read_dataset): Filtering on cols: ${cols}`)
         cols = `.(${cols.map(c => {
            if (typeof c === 'number') c = colnames[c];
            return c;
         })
         .filter(c => !!c)
         .join(', ')})`;
      }
   } catch (error) {
      debugger;
      console.log(`(read_dataset): Filtering on cols error:`, error);
   }
   console.log('(read_dataset): rows:', rows, 'cols:', cols);
   await webR.evalR(`data <- data[${rows},${cols}]`);
   await webR.evalR(`str(data)`);
   // data_str = await webR.evalR(`jsonlite::toJSON(str(data))`);
   // console.log(await data_str.toArray());
   let sizeR = await webR.evalR(`dim(data)`);
   let size = await sizeR.toArray();
   await webR.destroy(sizeR);
   console.log('size:', size);
   if (offset) {
      console.log('Applying offset:', offset);
      if (offset < size[0]) {
         if (maxRows) {
            if (maxRows + offset > size[0]) {
               await webR.eval(`data <- data[${1+offset}:nrow(data),]`);
            } else {
               await webR.eval(`data <- data[${1+offset}:${maxRows+offset},]`);
            }
         } 
      } else {
         await webR.eval(`data <- data[0,]`);  // return no rows
      }
   } else if (maxRows && maxRows < size[0]) {
      await webR.evalR(`data <- data[1:${maxRows},]`);
   }
   let data;
   try {
      let jsonR = await webR.evalR(`jsonlite::toJSON(data)`);
      await webR.evalR(`rm(data); gc()`);
      let json = await jsonR.toArray();
      await webR.destroy(jsonR);
      // parse and return the JavaScript JSON data
      data = JSON.parse(json);
      if (isDataMounted){
         // Unmount directory with data
         await webR.FS.unmount("/data");
      }
   } catch (error) {
      debugger;
      console.log(`(read_dataset): Parsing JSON / Unmounting error:`, error);
   }
   console.log(`(read_dataset) results:`, { data, file, size, fullSize, offset, colnames, message });
   return { data, file, size, fullSize, offset, colnames, message };
}


async function read_sas(sas7bdatFile, rows = '', cols = '', maxRows = 10000, offset = 0){
   return await read_dataset(sas7bdatFile, rows, cols, maxRows, offset, 'sas7bdat');
}
async function read_xpt(xptFile, rows = '', cols = '', maxRows = 10000, offset = 0){
   return await read_dataset(xptFile, rows, cols, maxRows, offset, 'xpt');
}
async function read_rds(rdsFile, rows = '', cols = '', maxRows = 10000, offset = 0){
   return await read_dataset(rdsFile, rows, cols, maxRows, offset, 'rds');
}

async function read_sas_size(datasetFile){
   // let datadir = path.dirname(sas7bdatFile);
   // console.log('datadir:', datadir);
   // await webR.FS.mount('NODEFS', {root:  datadir}, "/data");
   // let r_size = await webR.evalR(`dim(haven::read_sas("/data/${path.basename(sas7bdatFile)}"))`);
   // await webR.FS.unmount("/data");
   // let size = await r_size.toArray();
   // await webR.destroy(r_size);
   const { fullSize: size } = await read_sas(datasetFile, '0');
   return size;
}



// async function read_xpt(xptFile, rows = 'TRUE', cols = 'TRUE'){
//    let datadir = path.dirname(xptFile);
//    console.log('datadir:', datadir);
//    await webR.FS.mount('NODEFS', {root:  datadir}, "/data");
//    // await webR.evalR(`data <- haven::read_xpt("/data/${path.basename(xptFile)}")`);
//    let data_json = await webR.evalR(`jsonlite::toJSON(haven::read_xpt("/data/${path.basename(xptFile)}")[${rows},${cols}])`);
//    await webR.FS.unmount("/data");
//    let json = await data_json.toArray();
//    webR.destroy(data_json);
//    return JSON.parse(json);
// }

async function read_xpt_size(datasetFile){
   // let datadir = path.dirname(sas7bdatFile);
   // console.log('datadir:', datadir);
   // await webR.FS.mount('NODEFS', {root:  datadir}, "/data");
   // let r_size = await webR.evalR(`dim(haven::read_xpt("/data/${path.basename(sas7bdatFile)}"))`);
   // await webR.FS.unmount("/data");
   // let size = await r_size.toArray();
   // await webR.destroy(r_size);
   const { fullSize: size } = await read_xpt(datasetFile, '0');
   return size;
}

// async function read_rds(rdsFile, rows = 'TRUE', cols = 'TRUE'){
//    let datadir = path.dirname(rdsFile);
//    console.log('datadir:', datadir);
//    await webR.FS.mount('NODEFS', {root:  datadir}, "/data");
//    let data_json = await webR.evalR(`jsonlite::toJSON(readRDS("/data/${path.basename(rdsFile)}")[${rows},${cols}])`);
//    await webR.FS.unmount("/data");
//    let json = await data_json.toArray();
//    webR.destroy(data_json);
//    return JSON.parse(json);
// }

async function read_rds_size(datasetFile){
   // let datadir = path.dirname(rdsFile);
   // console.log('datadir:', datadir);
   // await webR.FS.mount('NODEFS', {root:  datadir}, "/data");
   // let r_size = await webR.evalR(`dim(readRDS("/data/${path.basename(rdsFile)}"))`);
   // await webR.FS.unmount("/data");
   // let size = await r_size.toArray();
   // await webR.destroy(r_size);
   const { fullSize: size } = await read_sas(datasetFile, '0');
   return size;
}

module.exports = { initWebR, read_dataset, read_sas, read_xpt, read_sas_size, read_xpt_size, read_rds, read_rds_size };

/*
// example
initWebR()
   .then(() => {
      return read_sas("C:/Users/jbodart/lsaf/files/clinical/test/indic/cdisc-pilot-0001/biostat/staging/data_received/sdtm_last/dm.sas7bdat")
   })    
   .then(data => { 
      console.log(data.filter((d, i) => i < 5).map(d => { 
         return ({STUDYID: d.STUDYID, USUBJID: d.USUBJID, RFSTDTC: d.RFSTDTC, RFENDTC: d.RFENDTC, AGE: d.AGE, SEX: d.SEX, RACE: d.RACE })
      })) 
   })
   .catch(err => console.log(err))
*/

/*
const webR = new WebR();

await webR.init();
await webR.installPackages(['haven', 'jsonlite'], true);
await webR.FS.mkdir('/data');
let datadir = "C:/Users/jbodart/lsaf/files/clinical/test/indic/cdisc-pilot-0001/biostat/staging/data_received/sdtm_last";
await webR.FS.mount('NODEFS', {root:  datadir}, "/data");
await webR.evalR('dm <- haven::read_sas("/data/dm.sas7bdat")');

let dm_json = await webR.evalR(`jsonlite::toJSON(dm)`);
let dmjson = await dm_json.toArray();
let dm = JSON.parse(dmjson);
*/