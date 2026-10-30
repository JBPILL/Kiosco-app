// @vitest-environment node
import { expect, it } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename, resolve } from 'node:path'
import { connectRestoreReadOnlyPostgres } from '../../scripts/backup/restore-readonly-postgres.mjs'
import { PLAN_HASH, createRestoreJournal } from '../../scripts/backup/restore-acceptance-engine.mjs'
const reviewed: {metadata: Record<string,unknown>} = JSON.parse(readFileSync('scripts/backup/restore-dependency-reviewed.json','utf8'))
const now=Date.parse('2026-10-30T18:00:00Z'),secret='SYNTHETIC_PRIVATE_DB_PASSWORD_ERROR'
const credentials={password:secret,rootCertificate:'-----BEGIN CERTIFICATE-----\nSYNTHETIC\n-----END CERTIFICATE-----'}
function mock(mode='ok') {
 const queries:string[]=[],configs:unknown[]=[]
 let ends=0,errorHandler:(()=>void)|undefined
 class Client {
  connection={stream:{encrypted:mode!=='unencrypted',authorized:mode!=='unauthorized'}}
  constructor(config:unknown){configs.push(config)}
  on(_event:string,listener:()=>void){errorHandler=listener}
  async connect(){if(mode==='connect')throw Error(secret)}
  async end(){ends++;if(mode==='close')throw Error(secret)}
  async query(sql:string):Promise<unknown>{
   queries.push(sql)
   if(sql.startsWith('SELECT current_setting'))return {rows:[{read_only:mode==='rw'?'off':'on',query_role:mode==='role'?'authenticated':'postgres',database_name:'postgres'}]}
   if(sql.startsWith('BEGIN')&&mode==='begin')throw Error(secret)
   if(sql==='ROLLBACK'&&mode==='rollback')throw Error(secret)
   if(sql.includes("'fixture_counts'")){
    const value={read_only:'on',identity_fuse:true,plan_sha256:PLAN_HASH,observed_at:new Date(now).toISOString(),public_overloads:4,operation_collisions:0,stock_operation_collisions:mode==='stock-collision'?1:0,fixture_counts:{clientes:mode==='fixture'?1:0,proveedores:0,productos:0,lotes_producto:0},functions:['public.capacidades_restauracion_backup(uuid)','public.restaurar_contacto_backup(uuid,uuid,text,uuid,jsonb)','public.restaurar_lote_backup(uuid,uuid,uuid,jsonb)','public.restaurar_producto_backup(uuid,uuid,uuid,jsonb)'].map(signature=>({signature,present:true,metadata_matches:mode!=='rpc-drift'}))}
    if(mode==='signatures')value.functions[0].signature='public.unreviewed()'
    return [{rows:[]},{rows:[{evidence:value}]}]
   }
   if(sql.includes("'tables'")){
    if(mode==='read')throw Error(secret)
    if(mode==='event')errorHandler?.()
    const evidence={...structuredClone(reviewed.metadata),read_only:'on',query_role:'postgres',identity_fuse:true,server_version:'17.11',observed_at:new Date(now).toISOString()}
    if(mode==='metadata')evidence.identity_fuse=false
    return [{rows:[]},{rows:mode==='multiple'?[{evidence},{evidence}]:[{evidence}]}]
   }
   return {rows:[]}
  }
 }
 return {Client,queries,configs,get ends(){return ends}}
}
it('pins TLS/host/project/default readonly and exposes only fixed read methods',async()=>{
 const state=mock(),port=await connectRestoreReadOnlyPostgres(credentials,{Client:state.Client,now:()=>now})
 expect(state.configs[0]).toMatchObject({host:'aws-1-sa-east-1.pooler.supabase.com',port:5432,user:'postgres.acoyfwwmhaeruciyedri',database:'postgres',ssl:{rejectUnauthorized:true,servername:'aws-1-sa-east-1.pooler.supabase.com'},options:'-c default_transaction_read_only=on -c search_path=pg_catalog,public'})
 expect(Object.keys(port).sort()).toEqual(['dispose','readDependencyMetadata','readInitialPreflight','readOwnedState'])
 expect(await port.readInitialPreflight()).toMatchObject({status:'METADATA_MATCH_ONLY',initialState:'ABSENT_FIXTURES_NO_COLLISIONS_ONLY'})
 expect(state.queries[1]).toBe('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
 expect(state.queries.at(-1)).toBe('ROLLBACK')
 expect(state.queries.some(sql=>/\b(COMMIT|INSERT|UPDATE|DELETE|CREATE|GRANT|CALL)\b/.test(sql))).toBe(false)
 await port.dispose();await port.dispose();expect(state.ends).toBe(1)
 await expect(port.readDependencyMetadata()).rejects.toThrow('RESTORE_READER_UNAVAILABLE')
})
it.each(['connect','unencrypted','unauthorized','rw','role'])('rejects %s before preflight and closes without external diagnostics',async mode=>{
 const state=mock(mode)
 await expect(connectRestoreReadOnlyPostgres(credentials,{Client:state.Client})).rejects.toMatchObject({message:'RESTORE_READER_CONNECTION_NOT_CONFIRMED'})
 expect(state.ends).toBe(1)
})
it.each(['begin','read','rollback','metadata','multiple','stock-collision','fixture','rpc-drift','signatures','event'])('read %s rolls back and permanently poisons the port',async mode=>{
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
   if(sql.includes("'stock_ids'")){
    state.queries.push(sql)
    return {rows:[{evidence:{read_only:'on',observed_at:new Date(now).toISOString(),plan_hash:PLAN_HASH,cursor:0,commercial_active:true,owner_active:true,cashier_active:true,fixtures:Object.fromEntries(['clientes','proveedores','productos','lotes_producto'].map(table=>[table,{count:0,matches:true}])),operations:[],stock_ids:[],stock_context:true,movements:0,cost_rows:0}}]}
   }
   return super.query(sql)
  }
 }
 const port=await connectRestoreReadOnlyPostgres(credentials,{Client:StateClient,now:()=>now})
 try{
  expect(()=>port.readOwnedState(undefined as never)).toThrow('RESTORE_READER_STATE_REQUIRED')
  expect(await port.readOwnedState(journal)).toMatchObject({status:'METADATA_MATCH_ONLY',ownedState:'OWNED_FIXTURES_MATCH_ONLY',cursor:0})
  expect(state.queries.at(-1)).toBe('ROLLBACK')
 }finally{
  await port.dispose()
  rmSync(folder,{recursive:true,force:true})
 }
})
