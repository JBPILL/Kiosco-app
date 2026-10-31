// @vitest-environment node
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { verifyRestoreDependencyMetadata } from '../../scripts/backup/restore-dependency-preflight.mjs'
interface MetadataRow { [key: string]: unknown }
const reviewed: {metadata: Record<string,MetadataRow[]>; observedAt:string} = JSON.parse(readFileSync('scripts/backup/restore-dependency-reviewed.json','utf8'))
const now=Date.parse('2026-10-30T18:00:00.000Z')
function evidence() { return { ...structuredClone(reviewed.metadata),read_only:'on',query_role:'postgres',identity_fuse:true,server_version:'17.11',observed_at:new Date(now).toISOString() } }
it('compares all reviewed metadata with semantic keys independent of row ordering',()=>{
  const input=evidence()
  const reversed={...input,...Object.fromEntries(Object.entries(reviewed.metadata).map(([key,rows])=>[key,[...rows].reverse()]))}
  expect(verifyRestoreDependencyMetadata(reversed,now)).toMatchObject({status:'METADATA_MATCH_ONLY',tables:16,functions:21,triggers:16,columns:145,constraints:78})
})
it.each(['function','trigger','column','constraint','rls','duplicate','extra','missing','readonly','role','identity','version','old','future','invalid-time'])('rejects %s drift with a safe category',mode=>{
  const input=evidence() as Record<string,unknown>,rows=(key:string)=>input[key] as MetadataRow[]
  if(mode==='function')rows('functions')[0].body_sha256='0'.repeat(64)
  if(mode==='trigger')rows('triggers')[0].enabled='D'
  if(mode==='column')rows('columns')[0].not_null=false
  if(mode==='constraint')rows('constraints')[0].validated=false
  if(mode==='rls')rows('tables')[0].rls=false
  if(mode==='duplicate')rows('triggers')[1]={...rows('triggers')[0]}
  if(mode==='extra')rows('functions')[0].unexpected='SYNTHETIC_EXTERNAL_BODY'
  if(mode==='missing')rows('columns').pop()
  if(mode==='readonly')input.read_only='off'
  if(mode==='role')input.query_role='authenticated'
  if(mode==='identity')input.identity_fuse=false
  if(mode==='version')input.server_version='18.3'
  if(mode==='old')input.observed_at=new Date(now-300001).toISOString()
  if(mode==='future')input.observed_at=new Date(now+30001).toISOString()
  if(mode==='invalid-time')input.observed_at='invalid'
  expect(()=>verifyRestoreDependencyMetadata(input,now)).toThrow('RESTORE_DEPENDENCIES_NOT_CONFIRMED')
})
it('historical baseline is never accepted as fresh evidence by itself',()=>{
  expect(()=>verifyRestoreDependencyMetadata({...evidence(),observed_at:reviewed.observedAt},now)).toThrow('RESTORE_DEPENDENCIES_NOT_CONFIRMED')
})
