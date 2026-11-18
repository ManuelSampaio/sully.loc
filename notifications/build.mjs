import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
const licenses=await Promise.all([
  'node_modules/@block65/webcrypto-web-push/LICENSE',
  'node_modules/uint8array-extras/license',
].map(async path=>{try{return await readFile(path,'utf8');}catch{return await readFile(path+'.md','utf8');}}));
await build({entryPoints:['worker-source.js'],outfile:'worker.js',bundle:true,format:'esm',platform:'browser',target:'es2022',legalComments:'inline',banner:{js:'/*! Sully notifications — Web Push libraries (MIT)\n'+licenses.join('\n\n')+'\n*/'}});
