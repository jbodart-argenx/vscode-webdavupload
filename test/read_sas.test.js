const { initWebR, read_sas, read_xpt, read_sas_size, read_xpt_size } = require('../src/read_sas');
const path = require('path');

let webR;

initWebR()
   .then(myWebR => webR = myWebR)
   .then(async () => read_sas_size(path.join(__dirname, "dm.sas7bdat")))
   .then((size) => {
      console.log('dm.sas7bdat, size:', size);
   })    
   .then(async () => {console.log('dm first 8 rows, 2cols:', await read_sas(path.join(__dirname, "dm.sas7bdat"), '1:8', '1:2'));})    
   .then(async () => {console.log('5 rows, 3 cols:', await read_sas(path.join(__dirname, "dm.sas7bdat"), '1:5', '1:3'));})    
   .then(async () => {console.log('5 rows, 1  col:', await read_sas(path.join(__dirname, "dm.sas7bdat"), '1:5', 1));})    
   .then(() => read_sas(path.join(__dirname, "dm.sas7bdat")))   
   .then(data => { 
      console.log("\n\n=== dm.sas7bdat ===\n");
      console.log('3 rows, selected cols:', data.filter((d, i) => i < 3).map(d => { 
         return ({STUDYID: d.STUDYID, USUBJID: d.USUBJID, RFSTDTC: d.RFSTDTC, RFENDTC: d.RFENDTC, AGE: d.AGE, SEX: d.SEX, RACE: d.RACE });
      })) 
   })
   .then(async () => read_xpt_size(path.join(__dirname, "ds.xpt")))
   .then((size) => {
      console.log('ds.xpt, size:', size);
   })       
   .then(() => {
      return read_xpt(path.join(__dirname, "ds.xpt"));
   })
   .then(data => {
      console.log("\n\n=== ds.xpt ===\n");
      console.log('10 rows:', data.filter((v, i) => i < 10));
   })
   .then(async () => console.log('5 rows:', await read_xpt(path.join(__dirname, "ds.xpt"), '1:5')))
   .then(async () => console.log('5 rows, 3 col:', await read_xpt(path.join(__dirname, "ds.xpt"), '1:5', '1:3')))
   .then(async () => { webR.close() })
   .catch(err => console.log(err))


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