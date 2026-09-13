const { mkdirSync, copyFileSync } = require('node:fs');
mkdirSync('dist', { recursive: true });
copyFileSync('src/main.js', 'dist/main.js');
console.log('Built dist/main.js');
