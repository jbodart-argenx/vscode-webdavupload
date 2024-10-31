const path = require('path');
const { WebR } = require('webr');
const fs = require('fs');

let webR;

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

async function read_sas(sas7bdatFile, rows = 'TRUE', cols = 'TRUE'){
   // Identify directory with data
   let datadir = path.dirname(sas7bdatFile);
   console.log('datadir:', datadir);
   // Mount directory with data
   await webR.FS.mount('NODEFS', {root:  datadir}, "/data");
   // Read data and export as JSON
   let data_json = await webR.evalR(`jsonlite::toJSON(haven::read_sas("/data/${path.basename(sas7bdatFile)}")[${rows},${cols}])`);
   // Unmount directory with data
   await webR.FS.unmount("/data");
   // Get the JSON data into JavaScript
   let json = await data_json.toArray();
   // delete the webR JSON data
   webR.destroy(data_json);
   // parse and return the JavaScript JSON data
   return JSON.parse(json);
}


async function read_sas_size(sas7bdatFile){
   let datadir = path.dirname(sas7bdatFile);
   console.log('datadir:', datadir);
   await webR.FS.mount('NODEFS', {root:  datadir}, "/data");
   let r_size = await webR.evalR(`dim(haven::read_sas("/data/${path.basename(sas7bdatFile)}"))`);
   await webR.FS.unmount("/data");
   let size = await r_size.toArray();
   await webR.destroy(r_size);
   return size;
}

async function read_xpt_size(sas7bdatFile){
   let datadir = path.dirname(sas7bdatFile);
   console.log('datadir:', datadir);
   await webR.FS.mount('NODEFS', {root:  datadir}, "/data");
   let r_size = await webR.evalR(`dim(haven::read_xpt("/data/${path.basename(sas7bdatFile)}"))`);
   await webR.FS.unmount("/data");
   let size = await r_size.toArray();
   await webR.destroy(r_size);
   return size;
}

async function read_xpt(xptFile, rows = 'TRUE', cols = 'TRUE'){
   let datadir = path.dirname(xptFile);
   console.log('datadir:', datadir);
   await webR.FS.mount('NODEFS', {root:  datadir}, "/data");
   // await webR.evalR(`data <- haven::read_xpt("/data/${path.basename(xptFile)}")`);
   let data_json = await webR.evalR(`jsonlite::toJSON(haven::read_xpt("/data/${path.basename(xptFile)}")[${rows},${cols}])`);
   await webR.FS.unmount("/data");
   let json = await data_json.toArray();
   webR.destroy(data_json);
   return JSON.parse(json);
}

module.exports = { initWebR, read_sas, read_xpt, read_sas_size, read_xpt_size };

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