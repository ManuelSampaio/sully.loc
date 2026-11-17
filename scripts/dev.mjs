import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const args=process.argv.slice(2);
const value=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const root=process.cwd(),host=value('--host','127.0.0.1'),port=Number(value('--port','3000'));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
http.createServer(async(req,res)=>{
 try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=resolve(root,'.'+pathname);if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}if((await stat(file)).isDirectory())file=resolve(file,'index.html');res.writeHead(200,{'Content-Type':mime[extname(file)]||'text/plain; charset=utf-8','Cache-Control':'no-cache'});res.end(await readFile(file));}catch{res.writeHead(404);res.end('Not found');}
}).listen(port,host,()=>console.log(`Local: http://${host}:${port}`));
