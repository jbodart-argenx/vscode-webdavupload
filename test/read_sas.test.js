const { initWebR, read_sas, read_xpt } = require('../src/read_sas');



initWebR()
   .then(() => {
      return read_sas("./dm.sas7bdat");
   })    
   .then(data => { 
      console.log("\n\n=== dm.sas7bdat ===\n");
      console.log(data.filter((d, i) => i < 5).map(d => { 
         return ({STUDYID: d.STUDYID, USUBJID: d.USUBJID, RFSTDTC: d.RFSTDTC, RFENDTC: d.RFENDTC, AGE: d.AGE, SEX: d.SEX, RACE: d.RACE });
      })) 
   })
   .then(() => {
      return read_xpt("./ds.xpt");
   })
   .then(data => {
      console.log("\n\n=== ds.xpt ===\n");
      console.log(data.filter((d, i) => i < 5));
   })
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