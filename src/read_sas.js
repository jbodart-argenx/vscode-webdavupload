const path = require('path');
const { WebR } = require('webr');

let webR;

async function initWebR() {
   webR = new WebR();
   await webR.init();
   await webR.installPackages(['haven', 'jsonlite'], true);
   await webR.FS.mkdir('/data');
}

async function read_sas(sas7bdatFile){
   let datadir = path.dirname(sas7bdatFile);
   console.log('datadir:', datadir);
   await webR.FS.mount('NODEFS', {root:  datadir}, "/data");
   await webR.evalR(`data <- haven::read_sas("/data/${path.basename(sas7bdatFile)}")`);
   await webR.FS.unmount("/data");
   let data_json = await webR.evalR(`jsonlite::toJSON(data)`);
   let json = await data_json.toArray();
   return JSON.parse(json);
}


module.exports = { webR, initWebR, read_sas };

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