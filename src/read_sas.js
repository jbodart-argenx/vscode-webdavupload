const path = require('path');
const { WebR } = require('webr');
const fs = require('fs');

let webR;
let webrRepo;

async function initWebR(webR, repo) {
   webrRepo = repo;
   webR = new WebR();
   await webR.init();
   await webR.FS.mkdir('/localrepo');
   // await webR.FS.mount('NODEFS', {root:  "../../output/vfs"}, "/localrepo");
   // webr::mount(
   //    mountpoint = "/data",
   //    source = "https://example.com/output.data"
   //  )
   // await webR.FS.mount('NODEFS', {root:  "/Users/jmbodart/output"}, "/localrepo");
   // await webR.FS.mount('WORKERFS', {root:  "/Users/jmbodart/output"}, "/localrepo");
   let data, metadata;
   data = fs.readFileSync(path.join(webrRepo, 'output.data'));
   metadata = JSON.parse(fs.readFileSync(path.join(webrRepo, 'output.js.metadata'), 'utf-8'));
   await webR.FS.mount(
      "WORKERFS", 
      {
         packages: [{
            blob: data,
            metadata: metadata,
       }],
      },
      '/localrepo'
   );
   let res;
   try{
      res = await webR.evalR(`list.files("/localrepo", recursive = TRUE)`);
      console.log('(list.files("/localrepo", recursive = TRUE)) res:', await res.toArray());
      res = await webR.evalR('.libPaths(c(.libPaths(), "/localrepo"))');
      console.log('(.libPaths) res:', await res.toArray());
      res = await webR.evalR('library(haven)');
      console.log('(library(haven)) res:', await res.toArray());
      res = await webR.evalR('library(jsonlite)');
      console.log('(library(jsonlite)) res:', await res.toArray());
   } catch(err) {
      console.log('(initWebR) error:', err);
   }
   // await webR.umount("/localrepo");
   await webR.installPackages(['haven', 'jsonlite'], {repos: ['../../localrepo']});
   // await webR.installPackages(['haven', 'jsonlite'], {
   //    mount: false,
   //    quiet: false,
   //    repos: [
   //       // "https://repo.r-wasm.org/",
   //       // 'https://cardiomoon.r-universe.dev',
   //       // 'https://cloud.r-project.org',
   //       //'../../output/vfs/output.tar.gz',
   //       //'../../localrepo/vfs/output.tar.gz',
   //       '/localrepo'
   //    ]
   // });
   await webR.FS.mkdir('/data');
   return webR;
}

async function read_sas(sas7bdatFile, rows = 'TRUE', cols = 'TRUE'){
   let datadir = path.dirname(sas7bdatFile);
   console.log('(read_sas) datadir:', datadir);
   if (!webR) {
      try {
         webR = await initWebR(webR);
      } catch (error) {
         console.warn('(read_sas): Failed to initialize webR, cannot read SAS dataset', sas7bdatFile);
         debugger;
      return;
      }
   }
   if (!webR){
      console.warn('(read_sas): Failed to initialize webR, cannot read SAS dataset', sas7bdatFile);
      debugger;
      return;
   }
   await webR.FS.mount('NODEFS', {root:  datadir}, "/data");
   // await webR.evalR(`data <- haven::read_sas("/data/${path.basename(sas7bdatFile)}")`);
   let data_json = await webR.evalR(`jsonlite::toJSON(haven::read_sas("/data/${path.basename(sas7bdatFile)}")[${rows},${cols}])`);
   await webR.FS.unmount("/data");
   webR.destroy(data_json);
   let json = await data_json.toArray();
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