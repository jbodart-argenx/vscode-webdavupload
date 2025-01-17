const fs = require('fs');
const path = require('path');

const target = process.argv[2];
if (!target) {
   console.error('Please specify the target (src or dist)');
   process.exit(1);
}

const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

packageJson.main = `./${target}/extension.js`;

fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
console.log(`Updated main to ./${target}/extension.js`);
