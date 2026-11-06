// @vitest-environment node
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'
import { createCustodyProvisionPlan, custodyPlanHash } from '../../scripts/fiscal-custody-plan.mjs'
import { planInactiveFiscalIssuer } from '../../scripts/plan-fiscal-issuer.mjs'

const hash=(value:string)=>createHash('sha256').update(value).digest('hex')
function input() {
 const now=Date.now(),custody=createCustodyProvisionPlan({certificateSha256:'a'.repeat(64),certificateCuit:'20123456786'},now-7200000)
 const custodyPlanSha256=custodyPlanHash(custody)
 const proof={version:1,projectRef:'acoyfwwmhaeruciyedri',proposalSha256:custodyPlanSha256,
  operatorMarker:'CUSTODY_PROVISION_METADATA_PASS count=6 flags_closed=true functional=false edge_check=REQUIRED',
  closedProvisionMetadataPass:true,hostedFunctionalCustodyProven:false,hostedTaCacheProven:false,arcaRequests:0,newOriginalCompatibilityCheck:false,
  metadataObservation:{observedAt:new Date(now-3600000).toISOString(),reviewedNamesPresent:6,priorCustomSecretsUnchanged:true,
   revisionDigestMatches:true,activeKeySelectorDigestMatches:true,fiscalFlagsClosed:true,secretValuesRevealed:false},
  jwt:{checked:true},edgeObservation:{status:503,code:'HOMOLOGACION_NO_HABILITADA'}}
 const custodyEvidenceText=JSON.stringify(proof)
 return {projectRef:'acoyfwwmhaeruciyedri',custodyPlanText:JSON.stringify({plan:custody,planSha256:custodyPlanSha256}),custodyPlanSha256,
  custodyEvidenceText,custodyEvidenceSha256:hash(custodyEvidenceText),kioskId:randomUUID(),ownerAuthId:randomUUID(),
  cuitEmisor:'20123456786',puntoVenta:2,now:new Date(now).toISOString(),expiresAt:new Date(now+3600000).toISOString()}
}
it('prepares only explicit inactive metadata bound to the installed credential and proof; deterministic and immutable',()=>{
 const source=input(),before=JSON.stringify(source),result=planInactiveFiscalIssuer(source),custody=JSON.parse(source.custodyPlanText).plan as {credentialId:string}
 expect(JSON.stringify(source)).toBe(before);expect(planInactiveFiscalIssuer(source)).toEqual(result)
 expect(result.manifest).toMatchObject({credentialId:custody.credentialId,revision:1,enabled:false,sqlExecuted:false,representationVerified:false,voucherIssuanceAccepted:false,fiscalDataSelected:false})
 expect(result.sql).not.toMatch(/\b(?:UPDATE|DELETE)\s+public\.|ON CONFLICT|\b(?:GRANT|ALTER|CREATE TABLE)\b|LoginCms|FECAESolicitar/)
 expect(result.sql).toContain('SHARE ROW EXCLUSIVE MODE');expect(result.sql).toContain(result.manifest.planSha256)
 expect(result.manifest.sqlSha256).toBe(hash(result.sql))
})
it('malformed public evidence never appears in diagnostics',()=>{
 const source=input(),custodyEvidenceText='SYNTHETIC_PRIVATE_NEVER_ECHO{'
 expect(()=>planInactiveFiscalIssuer({...source,custodyEvidenceText,custodyEvidenceSha256:hash(custodyEvidenceText)})).toThrow('INACTIVE_ISSUER_PROPOSAL_REJECTED')
})
it.each([
 ['foreign',{projectRef:'lllkjnqpltnwvxzphncr'}],['unknown',{enabled:true}],['missing owner',{ownerAuthId:undefined}],
 ['bad kiosk',{kioskId:"';COMMIT;--"}],['bad CUIT',{cuitEmisor:'20123456780'}],['CUIT number',{cuitEmisor:20123456786}],
 ['fraction PV',{puntoVenta:2.1}],['PV string',{puntoVenta:'2'}],['PV zero',{puntoVenta:0}],['PV reserved',{puntoVenta:99999}],
 ['bad plan hash',{custodyPlanSha256:'b'.repeat(64)}],['bad proof hash',{custodyEvidenceSha256:'b'.repeat(64)}],
 ['bad time',{expiresAt:'2030-01-01'}],['expired',{expiresAt:'2000-01-01T00:00:00.000Z'}],
])('rejects %s before generating SQL',(_name,change)=>{expect(()=>planInactiveFiscalIssuer({...input(),...change})).toThrow()})
it.each(['names','flags','revision','jwt','edge','before-plan','future','claimed-functional','private-read'])('rejects altered proof %s even with recalculated source hash',mode=>{
 const source=input(),proof=JSON.parse(source.custodyEvidenceText)
 if(mode==='names')proof.metadataObservation.reviewedNamesPresent=5
 if(mode==='flags')proof.metadataObservation.fiscalFlagsClosed=false
 if(mode==='revision')proof.metadataObservation.revisionDigestMatches=false
 if(mode==='jwt')proof.jwt.checked=false
 if(mode==='edge')proof.edgeObservation.status=200
 if(mode==='before-plan')proof.metadataObservation.observedAt=new Date(Date.parse(source.now)-86400000).toISOString()
 if(mode==='future')proof.metadataObservation.observedAt=new Date(Date.parse(source.now)+1000).toISOString()
 if(mode==='claimed-functional')proof.hostedFunctionalCustodyProven=true
 if(mode==='private-read')proof.newOriginalCompatibilityCheck=true
 const custodyEvidenceText=JSON.stringify(proof)
 expect(()=>planInactiveFiscalIssuer({...source,custodyEvidenceText,custodyEvidenceSha256:hash(custodyEvidenceText)})).toThrow()
})
it('keeps the closed custody proof as history without requiring key reprovision or rechecking original material',()=>{
 const source=input(),now=Date.parse(source.now),custody=createCustodyProvisionPlan({certificateSha256:'a'.repeat(64),certificateCuit:'20123456786'},now-4*86400000)
 const custodyPlanSha256=custodyPlanHash(custody),proof=JSON.parse(source.custodyEvidenceText)
 proof.proposalSha256=custodyPlanSha256;proof.metadataObservation.observedAt=new Date(now-3*86400000).toISOString()
 const custodyEvidenceText=JSON.stringify(proof)
 const result=planInactiveFiscalIssuer({...source,custodyPlanSha256,custodyPlanText:JSON.stringify({plan:custody,planSha256:custodyPlanSha256}),custodyEvidenceText,custodyEvidenceSha256:hash(custodyEvidenceText)})
 expect(result.manifest).toMatchObject({credentialId:custody.credentialId,enabled:false,liveTargetPreflightRequired:true,custodyMetadataObservedAt:proof.metadataObservation.observedAt})
})
const domain=readFileSync('supabase/bootstrap/001_domain.sql','utf8')
const issuer=readFileSync('supabase/pilot-fiscal/005_fiscal_worker_authorization.sql','utf8')
const ddl=(name:string,source:string)=>{
 const value=source.match(new RegExp('CREATE TABLE (?:IF NOT EXISTS )?public\\.'+name+' \\([\\s\\S]*?\\r?\\n\\);'))?.[0]
 if(!value)throw Error('Canonical DDL absent: '+name)
 return value
}
async function setup(source:ReturnType<typeof input>) {
 const db=new PGlite()
 try {
  await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;')
  await db.exec(ddl('kioscos',domain)+ddl('usuarios',domain)+ddl('fiscal_emisores_homologacion',issuer)+'ALTER TABLE public.fiscal_emisores_homologacion ENABLE ROW LEVEL SECURITY;')
  await db.query("INSERT INTO auth.users VALUES($1);",[source.ownerAuthId])
  await db.query("INSERT INTO public.kioscos(id,nombre) VALUES($1,'Synthetic kiosk');",[source.kioskId])
  await db.query("INSERT INTO public.usuarios(auth_user_id,kiosco_id,nombre,rol) VALUES($1,$2,'Synthetic owner','DUEÑO');",[source.ownerAuthId,source.kioskId])
  return db
 }catch(error){await db.close();throw error}
}
async function approve(db:PGlite,plan:ReturnType<typeof planInactiveFiscalIssuer>,target='acoyfwwmhaeruciyedri'){
 await db.query("SELECT set_config('kioskopos.emitter_target_ref',$1,false),set_config('kioskopos.approved_emitter_plan_sha256',$2,false)",[target,plan.manifest.planSha256])
}
it('real table DDL plus generated SQL require reviewed target/hash, insert once inactive and reject replay without modifying row',async()=>{
 const source=input(),plan=planInactiveFiscalIssuer(source),db=await setup(source)
 try {
  await expect(db.exec(plan.sql)).rejects.toThrow('ISSUER_GO_AND_TARGET_REQUIRED');await db.exec('ROLLBACK')
  await approve(db,plan,'lllkjnqpltnwvxzphncr');await expect(db.exec(plan.sql)).rejects.toThrow('ISSUER_GO_AND_TARGET_REQUIRED');await db.exec('ROLLBACK')
  await approve(db,plan);await db.exec(plan.sql)
  const before=(await db.query('SELECT to_jsonb(t) AS row FROM public.fiscal_emisores_homologacion t')).rows
  expect(before).toHaveLength(1);expect(before[0]).toMatchObject({row:{kiosco_id:source.kioskId,punto_venta:2,revision:1,habilitado:false}})
  await expect(db.exec(plan.sql)).rejects.toThrow('ISSUER_BINDING_ALREADY_EXISTS');await db.exec('ROLLBACK')
  expect((await db.query('SELECT to_jsonb(t) AS row FROM public.fiscal_emisores_homologacion t')).rows).toEqual(before)
 }finally{await db.close()}
},30000)
it.each(['inactive-owner','cashier','other-kiosk','superadmin','missing-owner','suspended','readonly','rls-off','table-grant','column-grant'])('server rejects %s after proposal without inserting',async mode=>{
 const source=input(),plan=planInactiveFiscalIssuer(source),db=await setup(source)
 try {
  if(mode==='inactive-owner')await db.exec('UPDATE public.usuarios SET activo=false')
  if(mode==='cashier')await db.exec("UPDATE public.usuarios SET rol='CAJERO'")
  if(mode==='other-kiosk') {const other=randomUUID();await db.query("INSERT INTO public.kioscos(id,nombre) VALUES($1,'Other')",[other]);await db.query('UPDATE public.usuarios SET kiosco_id=$1',[other])}
  if(mode==='superadmin')await db.exec('UPDATE public.usuarios SET es_superadmin=true,kiosco_id=NULL')
  if(mode==='missing-owner')await db.exec('DELETE FROM public.usuarios')
  if(mode==='suspended')await db.exec("UPDATE public.kioscos SET estado_suscripcion='SUSPENDIDO'")
  if(mode==='readonly')await db.exec("UPDATE public.kioscos SET estado_suscripcion='SOLO_LECTURA'")
  if(mode==='rls-off')await db.exec('ALTER TABLE public.fiscal_emisores_homologacion DISABLE ROW LEVEL SECURITY')
  if(mode==='table-grant')await db.exec('GRANT SELECT ON public.fiscal_emisores_homologacion TO authenticated')
  if(mode==='column-grant')await db.exec('GRANT SELECT(cuit_emisor) ON public.fiscal_emisores_homologacion TO authenticated')
  await approve(db,plan)
  await expect(db.exec(plan.sql)).rejects.toThrow(/ISSUER_(OWNER_NOT_CONFIRMED|KIOSK_NOT_ACTIVE|TABLE_NOT_CLOSED)/);await db.exec('ROLLBACK')
  expect((await db.query('SELECT * FROM public.fiscal_emisores_homologacion')).rows).toHaveLength(0)
 }finally{await db.close()}
},30000)
it.each(['credential','certificate'])('rejects %s already bound to another kiosk without altering it',async mode=>{
 const source=input(),plan=planInactiveFiscalIssuer(source),db=await setup(source)
 try {
  const other=randomUUID();await db.query("INSERT INTO public.kioscos(id,nombre) VALUES($1,'Other')",[other])
  await db.query("INSERT INTO public.fiscal_emisores_homologacion(kiosco_id,cuit_emisor,punto_venta,credencial_id,certificado_sha256) VALUES($1,'20123456786',3,$2,$3)",[other,mode==='credential'?plan.manifest.credentialId:randomUUID(),mode==='certificate'?plan.manifest.certificateSha256:'b'.repeat(64)])
  const before=(await db.query('SELECT to_jsonb(t) AS row FROM public.fiscal_emisores_homologacion t')).rows
  await approve(db,plan);await expect(db.exec(plan.sql)).rejects.toThrow('ISSUER_BINDING_ALREADY_EXISTS');await db.exec('ROLLBACK')
  expect((await db.query('SELECT to_jsonb(t) AS row FROM public.fiscal_emisores_homologacion t')).rows).toEqual(before)
 }finally{await db.close()}
},30000)
it('server expiry guard is enforced after local preparation',async()=>{
 const source=input(),plan=planInactiveFiscalIssuer(source),db=await setup(source)
 try {
  await approve(db,plan);await db.exec("CREATE FUNCTION public.issuer_expired_clock() RETURNS timestamptz LANGUAGE sql AS $$SELECT '2100-01-01T00:00:00Z'::timestamptz$$")
  await expect(db.exec(plan.sql.replaceAll('clock_timestamp()','public.issuer_expired_clock()'))).rejects.toThrow('ISSUER_PROPOSAL_EXPIRED');await db.exec('ROLLBACK')
  expect((await db.query('SELECT * FROM public.fiscal_emisores_homologacion')).rows).toHaveLength(0)
 }finally{await db.close()}
},30000)
it('candidate pins catalog-first resolution instead of inheriting an administrative session search path',async()=>{
 const source=input(),plan=planInactiveFiscalIssuer(source),db=await setup(source)
 try {
  await db.exec("CREATE FUNCTION public.clock_timestamp() RETURNS timestamptz LANGUAGE sql AS $$SELECT '2000-01-01T00:00:00Z'::timestamptz$$; SET search_path=public,pg_catalog;")
  await approve(db,plan);await db.exec(plan.sql)
  expect((await db.query('SELECT habilitado FROM public.fiscal_emisores_homologacion')).rows).toEqual([{habilitado:false}])
 }finally{await db.close()}
},30000)
function cleanup(root:string){const target=resolve(root);if(dirname(target)!==resolve(tmpdir())||!basename(target).startsWith('kiosko-issuer-plan-'))throw Error('Unexpected cleanup target');rmSync(target,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
it('CLI creates only public proposal files in a new directory and refuses overwrite',()=>{
 const root=mkdtempSync(join(tmpdir(),'kiosko-issuer-plan-'))
 try {
  const source=input(),{custodyPlanText,custodyEvidenceText,now,...config}=source
  expect(now).toBeTruthy()
  const custodyPlanPath=join(root,'custody.json'),custodyEvidencePath=join(root,'proof.json'),configPath=join(root,'config.json'),destination=join(root,'new-proposal')
  writeFileSync(custodyPlanPath,custodyPlanText);writeFileSync(custodyEvidencePath,custodyEvidenceText)
  writeFileSync(configPath,JSON.stringify({...config,custodyPlanPath,custodyEvidencePath}))
  const args=[resolve('scripts/plan-fiscal-issuer.mjs'),configPath,destination]
  const first=spawnSync(process.execPath,args,{encoding:'utf8',timeout:10000})
  expect(first.status).toBe(0);expect(first.stdout).toContain('SQL_EXECUTED=false')
  const before=readFileSync(join(destination,'emisor-inactivo.sql'),'utf8')
  const again=spawnSync(process.execPath,args,{encoding:'utf8',timeout:10000})
  expect(again.status).toBe(1);expect(again.stderr).toContain('No network, private reads or SQL execution')
  expect(readFileSync(join(destination,'emisor-inactivo.sql'),'utf8')).toBe(before)
 }finally{cleanup(root)}
})
