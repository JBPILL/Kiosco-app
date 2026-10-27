import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {pathToFileURL,fileURLToPath} from 'node:url';import assert from 'node:assert/strict';import crypto from 'node:crypto';
if(process.argv.length>3)throw Error('Expected one package directory');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.resolve(root,process.argv[2]??'../edge-staging-bac8ac1'),req=createRequire(root+'/package.json');
const manifest=JSON.parse(fs.readFileSync(out+'/manifest.json','utf8')),imports=manifest.imports;
assert.equal(manifest.projectRef,'acoyfwwmhaeruciyedri');assert.equal(manifest.function,'arca-homologacion');assert.equal(manifest.verify_jwt,true);
assert.match(manifest.sourceCommit,/^[0-9a-f]{40}$/);
assert.deepEqual(imports,JSON.parse(fs.readFileSync(root+'/supabase/functions/arca-homologacion/deno.json','utf8')).imports);
let code=fs.readFileSync(out+'/index.ts','utf8');assert.equal(crypto.createHash('sha256').update(code).digest('hex'),manifest.sha256);assert.equal(Buffer.byteLength(code),manifest.bytes);
for(const [name,spec]of Object.entries(imports))code=code.replaceAll(JSON.stringify(spec),JSON.stringify(pathToFileURL(req.resolve(name)).href));
let handler,reads=[],network=0;const env=new Map([['SUPABASE_URL','https://acoyfwwmhaeruciyedri.supabase.co']]);
globalThis.Deno={serve:fn=>{handler=fn},env:{get:name=>{reads.push(name);return env.get(name)}}};globalThis.fetch=async()=>{network++;throw Error('UNEXPECTED_NETWORK')};
await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const origin='https://kiosco-app-staging.vercel.app';const cases=[
['OPTIONS',origin,204,null],['GET',origin,405,'METODO_NO_PERMITIDO'],['POST','https://blocked.invalid',403,'ORIGEN_NO_PERMITIDO'],['POST',origin,503,'HOMOLOGACION_NO_HABILITADA']];
for(const [method,o,status,expected]of cases){reads=[];const r=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method,headers:{origin:o,authorization:'Bearer SYNTHETIC_INVALID',...(method==='POST'?{'content-type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify({accion:'ENVIAR_NC'})}:{})}));assert.equal(r.status,status);if(expected)assert.equal((await r.json()).codigo,expected);assert.equal(r.headers.get('access-control-allow-origin'),o===origin?origin:null);assert(reads.every(n=>['SUPABASE_URL','ARCA_HOMO_BACKEND_ENABLED'].includes(n)));assert.equal(network,0)}
if(process.argv[2]){
 env.set('ARCA_HOMO_BACKEND_ENABLED','true');
 for(const flag of [undefined,'false','TRUE','1',' true ']){
  reads=[];if(flag===undefined)env.delete('ARCA_HOMO_DATA_PREPARATION_ENABLED');else env.set('ARCA_HOMO_DATA_PREPARATION_ENABLED',flag);
  const r=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin,authorization:'Bearer SYNTHETIC_INVALID','content-type':'application/json'},body:JSON.stringify({accion:'GUARDAR_DATOS_FISCALES',venta_id:'11111111-1111-4111-8111-111111111111',operacion_id:'22222222-2222-4222-8222-222222222222',entrada:{}})}));
  assert.equal(r.status,503);assert.equal((await r.json()).codigo,'DATOS_FISCALES_NO_HABILITADOS');
  assert(reads.every(n=>['SUPABASE_URL','ARCA_HOMO_BACKEND_ENABLED','ARCA_HOMO_DATA_PREPARATION_ENABLED'].includes(n)));assert.equal(network,0);
 }
 env.delete('ARCA_HOMO_BACKEND_ENABLED');env.delete('ARCA_HOMO_DATA_PREPARATION_ENABLED');
}
assert.equal(typeof handler,'function');console.log(JSON.stringify({cases:cases.length+(process.argv[2]?5:0),result:'PASS',network,privateCredentialReads:0,backendFlag:'ABSENT_DEFAULT_CLOSED'}));
