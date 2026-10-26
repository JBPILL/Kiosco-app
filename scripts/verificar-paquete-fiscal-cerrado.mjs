import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {pathToFileURL,fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.resolve(root,'../edge-staging-bac8ac1'),req=createRequire(root+'/package.json');
const imports=JSON.parse(fs.readFileSync(out+'/manifest.json','utf8')).imports;
let code=fs.readFileSync(out+'/index.ts','utf8');for(const [name,spec]of Object.entries(imports))code=code.replaceAll(JSON.stringify(spec),JSON.stringify(pathToFileURL(req.resolve(name)).href));
fs.writeFileSync(out+'/local-test.mjs',code);let handler,reads=[],network=0;const env=new Map([['SUPABASE_URL','https://acoyfwwmhaeruciyedri.supabase.co']]);
globalThis.Deno={serve:fn=>{handler=fn},env:{get:name=>{reads.push(name);return env.get(name)}}};globalThis.fetch=async()=>{network++;throw Error('UNEXPECTED_NETWORK')};
await import(pathToFileURL(out+'/local-test.mjs').href);
const origin='https://kiosco-app-staging.vercel.app';const cases=[
['OPTIONS',origin,204,null],['GET',origin,405,'METODO_NO_PERMITIDO'],['POST','https://blocked.invalid',403,'ORIGEN_NO_PERMITIDO'],['POST',origin,503,'HOMOLOGACION_NO_HABILITADA']];
for(const [method,o,status,expected]of cases){reads=[];const r=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method,headers:{origin:o,authorization:'Bearer SYNTHETIC_INVALID',...(method==='POST'?{'content-type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify({accion:'ENVIAR_NC'})}:{})}));assert.equal(r.status,status);if(expected)assert.equal((await r.json()).codigo,expected);assert.equal(r.headers.get('access-control-allow-origin'),o===origin?origin:null);assert(reads.every(n=>['SUPABASE_URL','ARCA_HOMO_BACKEND_ENABLED'].includes(n)));assert.equal(network,0)}
assert.equal(typeof handler,'function');console.log(JSON.stringify({cases:cases.length,result:'PASS',network,privateCredentialReads:0,backendFlag:'ABSENT_DEFAULT_CLOSED'}));
