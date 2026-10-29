import http from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.mjs';

const folder = fileURLToPath(new URL('./data/', import.meta.url));
mkdirSync(folder, { recursive: true });
const store = openStore(folder + '/comercio.sqlite');
const origin = 'http://127.0.0.1:4310';
const server = http.createServer(async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if (req.headers.host !== '127.0.0.1:4310' || (req.headers.origin && req.headers.origin !== origin)) { res.writeHead(403).end(); return; }
  try {
    if (req.method === 'GET' && req.url === '/') {
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(readFileSync(new URL('./index.html',import.meta.url))); return;
    }
    res.setHeader('Content-Type','application/json; charset=utf-8');
    if (req.method === 'GET' && req.url === '/api/state') { res.end(JSON.stringify({products:store.products(),sales:store.sales()})); return; }
    const actions = {
      '/api/products': data => store.addProduct(data),
      '/api/products/update': data => store.updateProduct(data),
      '/api/products/active': data => store.setProductActive(data),
      '/api/sales': data => store.sell(data)
    };
    if (req.method !== 'POST' || !Object.hasOwn(actions,req.url)) { res.writeHead(404).end('{}'); return; }
    if (req.headers['content-type'] !== 'application/json') throw Error('Formato inválido.');
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 100000) throw Error('Petición demasiado grande.'); }
    const data = JSON.parse(body);
    const result = actions[req.url](data);
    res.end(JSON.stringify(result ?? {ok:true}));
  } catch (e) { res.writeHead(400).end(JSON.stringify({error:e.message})); }
});
server.on('error', error => {
  store.close();
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto 4310 ya está ocupado. Si Mostrador ya está abierto, ingresá a ${origin}.\nPara reiniciarlo, cerrá la terminal anterior con Ctrl+C y ejecutá npm run local nuevamente.`);
  } else {
    console.error(`No se pudo iniciar Mostrador: ${error.message}`);
  }
  process.exitCode = 1;
});
server.listen(4310,'127.0.0.1',()=>console.log(`Mostrador local: ${origin}\nDatos: ${folder}\nNo necesita internet. Dejá esta terminal abierta.`));
process.on('SIGINT',()=>server.close(()=>{store.close();process.exit();}));
