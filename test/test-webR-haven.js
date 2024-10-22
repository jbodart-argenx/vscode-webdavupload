const {WebR} = require('webr');

(async () => {

    const webR = new WebR();
    await webR.init();

    await webR.installPackages('haven');
    //await webR.evalR(`install.packages("haven")`);
    await webR.evalR(`library(haven)`);
    
        
    // Verify the installation
    const version = await webR.evalR(`packageVersion("haven")`);
    console.log(version);
    webR.destroy(version);

    webR.close();
    
})();

