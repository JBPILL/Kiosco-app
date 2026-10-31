// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename, resolve } from 'node:path'
import { connectRestoreReadOnlyPostgres, RESTORE_CONNECT_DIAGNOSTICS, type RestoreConnectDiagnostic } from '../../scripts/backup/restore-readonly-postgres.mjs'
import { RESTORE_PRESERVATION_TABLES,RESTORE_PRESERVATION_SCOPE_HASH,loadRestorePreservationBaseline } from '../../scripts/backup/restore-preservation.mjs'
import { PLAN_HASH, createRestoreJournal } from '../../scripts/backup/restore-acceptance-engine.mjs'
const reviewed: {metadata: Record<string,unknown>} = JSON.parse(readFileSync('scripts/backup/restore-dependency-reviewed.json','utf8'))
const now=Date.parse('2026-10-30T18:00:00Z'),secret='SYNTHETIC_PRIVATE_DB_PASSWORD_ERROR'
const credentials={password:secret,rootCertificate:'-----BEGIN CERTIFICATE-----\nSYNTHETIC\n-----END CERTIFICATE-----'}
function mock(mode='ok') {
 const queries:string[]=[],configs:unknown[]=[]
 const authSecretMessage=`password authentication failed for user ${secret}`
 let ends=0,errorHandler:(()=>void)|undefined
 class Client {
  connection={stream:{encrypted:mode!=='unencrypted',authorized:mode!=='unauthorized'}}
  constructor(config:unknown){configs.push(config)}
  on(_event:string,listener:()=>void){errorHandler=listener}
  async connect(){
   if(mode==='connect'||mode==='connect-close')throw Object.assign(Error(authSecretMessage),{code:'28P01'})
   if(mode==='timeout')throw Error(`timeout expired while connecting with ${secret}`)
   if(mode==='tls-handshake')throw Object.assign(Error(`certificate verify failed for ${secret}`),{code:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'})
   if(mode==='network')throw Object.assign(Error(`connect ECONNREFUSED ${secret}`),{code:'ECONNREFUSED'})
   if(mode==='startup-options')throw Object.assign(Error(`unrecognized configuration parameter default_transaction_read_only ${secret}`),{code:'42704'})
  }
  async end(){ends++;if(mode==='close'||mode==='connect-close')throw Error(authSecretMessage)}
  async query(sql:string):Promise<unknown>{
   queries.push(sql)
   if(sql==='SET default_transaction_read_only = on;'&&mode==='set-readonly-fail')throw Error(authSecretMessage)
   if(sql==='SET search_path = pg_catalog, public;'&&mode==='set-search-path-fail')throw Error(authSecretMessage)
   if(sql.startsWith('SELECT current_setting')){
    if(mode==='probe-error')throw Error(authSecretMessage)
    if(mode==='probe-empty')return {rows:[]}
    return {rows:[{read_only:mode==='rw'?'off':'on',search_path:mode==='search-path'?'"$user", public':mode==='search-path-compact'?'pg_catalog,public':'pg_catalog, public',query_role:mode==='role'?'authenticated':'postgres',database_name:mode==='database'?'other_database':'postgres'}]}
   }
   if(sql.startsWith('BEGIN')&&mode==='begin')throw Error(secret)
   if(sql==='ROLLBACK'&&mode==='rollback')throw Error(secret)
   if(sql.includes("'fixture_counts'")){
    const value={read_only:mode==='tx-rw'?'off':'on',identity_fuse:true,plan_sha256:PLAN_HASH,observed_at:new Date(now).toISOString(),public_overloads:4,operation_collisions:0,stock_operation_collisions:mode==='stock-collision'?1:0,fixture_counts:{clientes:mode==='fixture'?1:0,proveedores:0,productos:0,lotes_producto:0},functions:['public.capacidades_restauracion_backup(uuid)','public.restaurar_contacto_backup(uuid,uuid,text,uuid,jsonb)','public.restaurar_lote_backup(uuid,uuid,uuid,jsonb)','public.restaurar_producto_backup(uuid,uuid,uuid,jsonb)'].map(signature=>({signature,present:true,metadata_matches:mode!=='rpc-drift'}))}
    if(mode==='signatures')value.functions[0].signature='public.unreviewed()'
    return [{rows:[]},{rows:[{evidence:value}]}]
   }
   if(sql.includes("'tables'")){
    if(mode==='read')throw Error(secret)
    if(mode==='event')errorHandler?.()
    const evidence={...structuredClone(reviewed.metadata),read_only:mode==='tx-metadata-rw'?'off':'on',query_role:'postgres',identity_fuse:true,server_version:'17.11',observed_at:new Date(now).toISOString()}
    if(mode==='metadata')evidence.identity_fuse=false
    return [{rows:[]},{rows:mode==='multiple'?[{evidence},{evidence}]:[{evidence}]}]
   }
   return {rows:[]}
  }
 }
 return {Client,queries,configs,get ends(){return ends}}
}
it('pins TLS/host/project/session SET readonly+search_path and exposes only fixed read methods',async()=>{
 const state=mock(),port=await connectRestoreReadOnlyPostgres(credentials,{Client:state.Client,now:()=>now})
 expect(state.configs[0]).toMatchObject({host:'aws-1-sa-east-1.pooler.supabase.com',port:5432,user:'postgres.acoyfwwmhaeruciyedri',database:'postgres',ssl:{rejectUnauthorized:true,servername:'aws-1-sa-east-1.pooler.supabase.com'},application_name:'kioskopos-restore-readonly',connectionTimeoutMillis:10000,query_timeout:15000,statement_timeout:10000,idle_in_transaction_session_timeout:15000})
 expect(state.configs[0]).not.toHaveProperty('options')
 expect(Object.keys(port).sort()).toEqual(['capturePreservationBaseline','dispose','readDependencyMetadata','readInitialPreflight','readOwnedState','readPreservedState'])
 expect(port).not.toHaveProperty('client')
 expect(port).not.toHaveProperty('query')
 expect(await port.readInitialPreflight()).toMatchObject({status:'METADATA_MATCH_ONLY',initialState:'ABSENT_FIXTURES_NO_COLLISIONS_ONLY'})
 expect(state.queries[0]).toBe('SET default_transaction_read_only = on;')
 expect(state.queries[1]).toBe('SET search_path = pg_catalog, public;')
 expect(state.queries[2]).toBe("SELECT current_setting('default_transaction_read_only') AS read_only,current_setting('search_path') AS search_path,current_user AS query_role,current_database() AS database_name")
 expect(state.queries[3]).toBe('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
 expect(state.queries.at(-1)).toBe('ROLLBACK')
 expect(state.queries.some(sql=>/\b(COMMIT|INSERT|UPDATE|DELETE|CREATE|GRANT|CALL)\b/.test(sql))).toBe(false)
 await port.dispose();await port.dispose();expect(state.ends).toBe(1)
 await expect(port.readDependencyMetadata()).rejects.toThrow('RESTORE_READER_UNAVAILABLE')
 const compact=mock('search-path-compact'),compactPort=await connectRestoreReadOnlyPostgres(credentials,{Client:compact.Client,now:()=>now})
 await compactPort.dispose();expect(compact.ends).toBe(1)
})
it.each([
 ['connect','CONNECT_AUTH_OR_HANDSHAKE'],
 ['timeout','CONNECT_TIMEOUT'],
 ['tls-handshake','CONNECT_TLS'],
 ['network','CONNECT_NETWORK'],
 ['startup-options','CONNECT_STARTUP_OPTIONS'],
 ['unencrypted','CONNECT_TLS'],
 ['unauthorized','CONNECT_TLS'],
 ['set-readonly-fail','CONNECT_SESSION_SET'],
 ['set-search-path-fail','CONNECT_SESSION_SET'],
 ['probe-error','CONNECT_SESSION_PROBE'],
 ['probe-empty','CONNECT_SESSION_PROBE'],
 ['rw','CONNECT_SESSION_PROBE_READ_ONLY'],
 ['search-path','CONNECT_SESSION_PROBE_SEARCH_PATH'],
 ['role','CONNECT_SESSION_PROBE_ROLE'],
 ['database','CONNECT_SESSION_PROBE_DATABASE'],
 ['connect-close','CONNECT_CLOSE'],
] as const satisfies readonly [string, RestoreConnectDiagnostic][])('rejects %s before preflight with allowlisted diagnostic %s and never leaks driver errors or secrets',async(mode,expectedDiagnostic)=>{
 const state=mock(mode)
 const outSpy=vi.spyOn(process.stdout,'write'),errSpy=vi.spyOn(process.stderr,'write')
 try{
  let caught:(Error&{diagnostic?:string})|undefined
  try{
   await connectRestoreReadOnlyPostgres(credentials,{Client:state.Client})
  }catch(err){
   caught=err as Error&{diagnostic?:string}
  }
  expect(caught).toBeInstanceOf(Error)
  expect(caught?.message).toBe('RESTORE_READER_CONNECTION_NOT_CONFIRMED')
  expect(caught?.diagnostic).toBe(expectedDiagnostic)
  expect(RESTORE_CONNECT_DIAGNOSTICS).toContain(caught?.diagnostic)
  const serialized=JSON.stringify({message:caught?.message,diagnostic:caught?.diagnostic,stack:caught?.stack,keys:Object.keys(caught??{})})
  expect(serialized).not.toContain(secret)
  expect(serialized).not.toContain('password authentication failed')
  expect(outSpy).not.toHaveBeenCalled()
  expect(errSpy).not.toHaveBeenCalled()
  expect(state.ends).toBe(1)
 }finally{
  outSpy.mockRestore()
  errSpy.mockRestore()
 }
})
it.each(['begin','read','rollback','metadata','multiple','stock-collision','fixture','rpc-drift','signatures','event','tx-rw','tx-metadata-rw'])('read %s rolls back and permanently poisons the port',async mode=>{
 const state=mock(mode),port=await connectRestoreReadOnlyPostgres(credentials,{Client:state.Client,now:()=>now})
 await expect(port.readInitialPreflight()).rejects.toMatchObject({message:'RESTORE_READER_READ_NOT_CONFIRMED'})
 expect(state.queries.at(-1)).toBe('ROLLBACK')
 const count=state.queries.length
 await expect(port.readDependencyMetadata()).rejects.toThrow('RESTORE_READER_UNAVAILABLE')
 expect(state.queries).toHaveLength(count)
 await port.dispose();expect(state.ends).toBe(1)
})
it('close failure does not expose errors or permit another read',async()=>{
 const state=mock('close'),port=await connectRestoreReadOnlyPostgres(credentials,{Client:state.Client})
 await expect(port.dispose()).rejects.toMatchObject({message:'RESTORE_READER_CLOSE_NOT_CONFIRMED'})
 await expect(port.readDependencyMetadata()).rejects.toThrow('RESTORE_READER_UNAVAILABLE')
 expect(state.ends).toBe(1)
})
it.each(['password','ca','override'])('rejects invalid %s before constructing a connection',async mode=>{
 const state=mock(),input={...credentials}
 if(mode==='password')input.password=''
 if(mode==='ca')input.rootCertificate+='PRIVATE KEY'
 const actual=mode==='override'?{...input,host:'another-host'}:input
 await expect(connectRestoreReadOnlyPostgres(actual,{Client:state.Client})).rejects.toThrow('RESTORE_READER_INPUT_REJECTED')
 expect(state.configs).toHaveLength(0)
})
it('refuses overlapping reads and disposal while a transaction is live',async()=>{
 const state=mock();let release:((value:unknown)=>void)|undefined
 let reached:()=>void=()=>{}
 const waiting=new Promise<void>(resolve=>{reached=resolve})
 class WaitingClient extends state.Client {
  async query(sql:string):Promise<unknown>{
   const result=await super.query(sql)
   if(sql.includes("'tables'"))return new Promise(resolve=>{release=()=>resolve(result);reached()})
   return result
  }
 }
 const port=await connectRestoreReadOnlyPostgres(credentials,{Client:WaitingClient,now:()=>now})
 const first=port.readDependencyMetadata()
 // Reach the injected wait without timer-based assumptions.
 await waiting
 await expect(port.readInitialPreflight()).rejects.toThrow('RESTORE_READER_UNAVAILABLE')
 await expect(port.dispose()).rejects.toThrow('RESTORE_READER_BUSY')
 expect(state.ends).toBe(0)
 release!(null)
 expect(await first).toMatchObject({status:'METADATA_MATCH_ONLY'})
 await port.dispose();expect(state.ends).toBe(1)
})
it('owned-state method accepts only a journal and confirms metadata plus state before rollback',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'kiosko-reader-state-')),state=mock()
 if(dirname(folder)!==resolve(tmpdir())||!basename(folder).startsWith('kiosko-reader-state-'))throw Error('Unsafe cleanup')
 const journal=createRestoreJournal(join(folder,'journal.jsonl'),{OWNER:'11111111-1111-4111-8111-111111111111',CASHIER:'22222222-2222-4222-8222-222222222222'})
 class StateClient extends state.Client {
  async query(sql:string):Promise<unknown>{
   if(sql.includes("'scope_hash'")){
    state.queries.push(sql)
    return {rows:[{evidence:{read_only:'on',query_role:'postgres',observed_at:new Date(now).toISOString(),server_version:'17.11',scope_hash:RESTORE_PRESERVATION_SCOPE_HASH,plan_hash:PLAN_HASH,tables:RESTORE_PRESERVATION_TABLES.map(name=>({name,count:0,sha256:'a'.repeat(64)}))}}]}
   }
   if(sql.includes("'stock_ids'")){
    state.queries.push(sql)
    return {rows:[{evidence:{read_only:'on',observed_at:new Date(now).toISOString(),plan_hash:PLAN_HASH,cursor:0,commercial_active:true,owner_active:true,cashier_active:true,fixtures:Object.fromEntries(['clientes','proveedores','productos','lotes_producto'].map(table=>[table,{count:0,matches:true}])),operations:[],stock_ids:[],stock_context:true,movements:0,cost_rows:0,movement_cost_rows:0,price_history_total:0,price_history_matches:true}}]}
   }
   return super.query(sql)
  }
 }
 const port=await connectRestoreReadOnlyPostgres(credentials,{Client:StateClient,now:()=>now})
 try{
  expect(()=>port.readOwnedState(undefined as never)).toThrow('RESTORE_READER_STATE_REQUIRED')
  expect(await port.readOwnedState(journal)).toMatchObject({status:'METADATA_MATCH_ONLY',ownedState:'OWNED_FIXTURES_MATCH_ONLY',cursor:0})
  expect(state.queries.at(-1)).toBe('ROLLBACK')
  const captured=await port.capturePreservationBaseline(journal)
  expect(captured.preparationOnly).toBe(true)
  const baseline=loadRestorePreservationBaseline(journal)
  expect(captured.baselineHash).toBe(baseline.baselineHash)
  expect(await port.readPreservedState(journal,baseline,captured.baselineHash)).toMatchObject({commercialPreservation:'REVIEWED_COMMERCIAL_INVENTORY_MATCH_ONLY',cursor:0})
  await expect(port.capturePreservationBaseline(journal)).rejects.toThrow('RESTORE_READER_BASELINE_NOT_CONFIRMED')
  await expect(port.readDependencyMetadata()).rejects.toThrow('RESTORE_READER_UNAVAILABLE')
 }finally{
  await port.dispose()
  rmSync(folder,{recursive:true,force:true})
 }
})
