// @vitest-environment node
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'

interface Parameter { Id: number; Description: string; VoucherClasses: string; ValidFrom: string; ValidUntil: string }
interface Evidence {version:number;entorno:string;operacion:string;origen:string;consultado_en:string;respuesta_sha256:string;parametros:Parameter[];importado_en_staging:boolean;emision_habilitada:boolean}
interface Plan {sql:string;manifest:{revision:number;consultado_en:string;vence_en:string;plan_sha256:string;fuente_sha256:string;habilitado:boolean;condiciones:{id:number;descripcion:string;comprobantes:number[]}[];alicuotas:{id:number;descripcion:string}[];excluded_classes:string[];excluded_rate_ids:number[];baseline_sha256?:string}}
const { planFiscalParameters } = await import(pathToFileURL(resolve('scripts/plan-fiscal-parameters.mjs')).href) as {
  planFiscalParameters:(input:Record<string,unknown>)=>Plan
}
const hash = (text:string) => createHash('sha256').update(text).digest('hex')
const stamp='2026-10-26T22:03:33.000Z'
const source=(operation:string, rows:Parameter[]):Evidence=>({version:1,entorno:'HOMOLOGACION',operacion:operation,
  origen:'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',consultado_en:stamp,respuesta_sha256:'a'.repeat(64),
  parametros:rows,importado_en_staging:false,emision_habilitada:false})
const iva=()=>source('FEParamGetTiposIva',[
  {Id:5,Description:'21%',VoucherClasses:'',ValidFrom:'20100917',ValidUntil:'NULL'},
  {Id:4,Description:'10.5%',VoucherClasses:'',ValidFrom:'20100917',ValidUntil:'NULL'},
])
const conditions=()=>source('FEParamGetCondicionIvaReceptor',[
  {Id:1,Description:'Responsable',VoucherClasses:'A/ALEY/C',ValidFrom:'',ValidUntil:''},
  {Id:5,Description:'Consumidor final',VoucherClasses:'B/C',ValidFrom:'',ValidUntil:''},
  {Id:10,Description:'Exento',VoucherClasses:'C/49',ValidFrom:'',ValidUntil:''},
])
function input(rates=iva(), receiver=conditions()) {
  const ivaText=JSON.stringify(rates), conditionText=JSON.stringify(receiver)
  return {projectRef:'acoyfwwmhaeruciyedri',ivaText,conditionText,ivaSha256:hash(ivaText),conditionSha256:hash(conditionText),
    now:'2026-10-26T22:20:00.000Z',expiresAt:'2026-10-27T02:59:00.000Z',revision:1}
}
it('normaliza clases explícitas sin convertir ALEY/49, habilitar o elegir un IVA de venta',()=>{
  const original=input(), snapshot=JSON.stringify(original), result=planFiscalParameters(original)
  expect(JSON.stringify(original)).toBe(snapshot)
  expect(result.manifest.condiciones.map(r=>r.comprobantes)).toEqual([[1,11],[6,11],[11]])
  expect(result.manifest.alicuotas.map(r=>r.id)).toEqual([4,5])
  expect(result.manifest.excluded_classes).toEqual(['49','ALEY'])
  expect(result.manifest.habilitado).toBe(false)
  expect(result.sql).not.toMatch(/UPDATE|DELETE|ON CONFLICT|fiscal_emisores|INSERT.*operaciones|habilitado.*true/i)
  expect(planFiscalParameters(original)).toEqual(result)
  expect(result.manifest).toHaveProperty('sql_sha256',hash(result.sql))
  expect(result.sql).toContain('SET LOCAL search_path=pg_catalog,public;')
})
it.each([
  ['Production',{projectRef:'lllkjnqpltnwvxzphncr'}],['missing revision',{revision:undefined}],['fractional revision',{revision:1.1}],
  ['hash mismatch',{ivaSha256:'b'.repeat(64)}],['future source',{now:'2026-10-26T22:00:00Z'}],
  ['stale source',{now:'2026-10-27T22:20:00Z',expiresAt:'2026-10-28T01:00:00Z'}],
  ['expired proposal',{expiresAt:'2026-10-26T22:19:00Z'}],['next business day',{expiresAt:'2026-10-27T03:01:00Z'}],
  ['non UTC clock',{now:'2026-10-26T19:20:00-03:00'}],['invalid timestamp',{expiresAt:'2026-02-30T02:00:00Z'}],
] as const)('rechaza %s antes de generar SQL',(_name,changes)=>{
  expect(()=>planFiscalParameters({...input(),...changes})).toThrow(/CATALOG_/)
})
it.each(['unknown-class','duplicate-class','duplicate-id','description-conflict','extra-field','method','enabled','foreign-host','empty','invalid-date','null-from','rate-duplicate'])('rechaza evidencia %s aun con hash recalculado',mode=>{
  const rates=iva(), receiver=conditions()
  if(mode==='unknown-class')receiver.parametros[0]={...receiver.parametros[0],VoucherClasses:'A/X/C'}
  if(mode==='duplicate-class')receiver.parametros[0]={...receiver.parametros[0],VoucherClasses:'A/A/C'}
  if(mode==='duplicate-id')receiver.parametros=[...receiver.parametros,receiver.parametros[0]]
  if(mode==='description-conflict')receiver.parametros=[...receiver.parametros,{...receiver.parametros[0],Description:'Changed',VoucherClasses:'B'}]
  if(mode==='extra-field')Object.assign(receiver,{Token:'SYNTHETIC'})
  if(mode==='method')receiver.operacion='FEParamGetTiposCbte'
  if(mode==='enabled')receiver.emision_habilitada=true
  if(mode==='foreign-host')receiver.origen='https://servicios1.afip.gov.ar/wsfev1/service.asmx'
  if(mode==='empty')rates.parametros=[]
  if(mode==='invalid-date')rates.parametros[0]={...rates.parametros[0],ValidFrom:'20260230'}
  if(mode==='null-from')rates.parametros[0]={...rates.parametros[0],ValidFrom:'NULL'}
  if(mode==='rate-duplicate')rates.parametros=[...rates.parametros,rates.parametros[0]]
  expect(()=>planFiscalParameters(input(rates,receiver))).toThrow(/CATALOG_/)
})
it('excluye tasas aún no vigentes/vencidas y fusiona sólo clases disjuntas de igual id/descripción',()=>{
  const rates=iva(), receiver=conditions()
  rates.parametros=[...rates.parametros,{Id:8,Description:'Futura',VoucherClasses:'',ValidFrom:'20261027',ValidUntil:'NULL'},
    {Id:9,Description:'Vencida',VoucherClasses:'',ValidFrom:'20100101',ValidUntil:'20261025'}]
  receiver.parametros=[{Id:5,Description:'Final',VoucherClasses:'B',ValidFrom:'',ValidUntil:''},
    {Id:5,Description:'Final',VoucherClasses:'C',ValidFrom:'',ValidUntil:''}]
  const result=planFiscalParameters(input(rates,receiver))
  expect(result.manifest.excluded_rate_ids).toEqual([8,9])
  expect(result.manifest.condiciones).toEqual([{id:5,descripcion:'Final',comprobantes:[6,11]}])
})
const ddl=readFileSync('supabase/pilot-fiscal/012_fiscal_preparation.sql','utf8')
  .match(/CREATE TABLE IF NOT EXISTS public\.fiscal_parametros_homologacion \([\s\S]*?\r?\n\);/)?.[0]
if(!ddl)throw Error('Canonical catalog DDL missing')
function liveInput() {
  const now=new Date(), before=new Date(now.getTime()-60000).toISOString()
  const localDate=new Date(now.getTime()-3*3600000)
  const nextMidnight=Date.UTC(localDate.getUTCFullYear(),localDate.getUTCMonth(),localDate.getUTCDate()+1,3)
  return {...input({...iva(),consultado_en:before},{...conditions(),consultado_en:before}),now:now.toISOString(),
    expiresAt:new Date(Math.min(now.getTime()+600000,nextMidnight)).toISOString()}
}
async function approve(db:PGlite, result:Plan, target='acoyfwwmhaeruciyedri') {
  await db.query("SELECT set_config('kioskopos.catalog_target_ref',$1,false),set_config('kioskopos.approved_catalog_plan_sha256',$2,false)",[target,result.manifest.plan_sha256])
}
it('SQL exige GO y destino explícitos, inserta una sola revisión inactiva, trata descripciones como datos y rechaza replay',async()=>{
  const db=new PGlite()
  try {
    await db.exec(ddl)
    const live=liveInput(), raw=JSON.parse(live.conditionText) as Evidence
    const label="D'Angelo \\'); COMMIT; --"
    raw.parametros[0]={...raw.parametros[0],Description:label}
    const text=JSON.stringify(raw), result=planFiscalParameters({...live,conditionText:text,conditionSha256:hash(text)})
    await expect(db.exec(result.sql)).rejects.toThrow('CATALOG_GO_AND_TARGET_REQUIRED')
    await db.exec('ROLLBACK')
    await approve(db,result,'lllkjnqpltnwvxzphncr')
    await expect(db.exec(result.sql)).rejects.toThrow('CATALOG_GO_AND_TARGET_REQUIRED')
    await db.exec('ROLLBACK')
    await approve(db,result)
    await db.exec(result.sql)
    const row=(await db.query<{habilitado:boolean;condiciones:{descripcion:string}[];fuente_sha256:string}>('SELECT * FROM public.fiscal_parametros_homologacion')).rows
    expect(row).toHaveLength(1);expect(row[0].habilitado).toBe(false)
    expect(row[0].condiciones[0].descripcion).toBe(label)
    expect(row[0].fuente_sha256).toBe(result.manifest.fuente_sha256)
    await expect(db.exec(result.sql)).rejects.toThrow('CATALOG_BASELINE_CHANGED')
    await db.exec('ROLLBACK')
    expect((await db.query('SELECT * FROM public.fiscal_parametros_homologacion')).rows).toHaveLength(1)
  } finally {await db.close()}
})
it('SQL vuelve a comprobar vigencia en servidor aunque la propuesta local fuera válida',async()=>{
  const db=new PGlite()
  try {
    await db.exec(ddl)
    const result=planFiscalParameters(input())
    await approve(db,result)
    // Exercise the actual generated guard with a clock after this proposal's expiry.
    await db.exec("CREATE FUNCTION public.catalog_expired_clock() RETURNS timestamptz LANGUAGE sql AS $$ SELECT '2100-01-01T00:00:00Z'::timestamptz $$")
    await expect(db.exec(result.sql.replaceAll('clock_timestamp()','public.catalog_expired_clock()'))).rejects.toThrow('CATALOG_PROPOSAL_EXPIRED')
    await db.exec('ROLLBACK')
    expect((await db.query('SELECT * FROM public.fiscal_parametros_homologacion')).rows).toHaveLength(0)
  } finally {await db.close()}
})

function baselineOf(plan:Plan) {
  const {revision,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,habilitado}=plan.manifest
  return {revision,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,habilitado}
}
function renewedInput(first:Plan) {
  const original=liveInput(),rates=JSON.parse(original.ivaText) as Evidence,receiver=JSON.parse(original.conditionText) as Evidence
  const next=new Date(Date.parse(first.manifest.consultado_en)+1000).toISOString()
  const ivaText=JSON.stringify({...rates,consultado_en:next}),conditionText=JSON.stringify({...receiver,consultado_en:next})
  const baselineText=JSON.stringify([baselineOf(first)])
  return {...original,ivaText,conditionText,ivaSha256:hash(ivaText),conditionSha256:hash(conditionText),
    revision:first.manifest.revision+1,baselineText,baselineSha256:hash(baselineText)}
}
it('renueva con INSERT inactivo y conserva exactamente la revisión anterior; rechaza replay',async()=>{
  const db=new PGlite()
  try {
    await db.exec(ddl)
    const first=planFiscalParameters(liveInput())
    await approve(db,first);await db.exec(first.sql)
    const before=(await db.query('SELECT to_jsonb(t) AS snapshot FROM public.fiscal_parametros_homologacion t WHERE revision=1')).rows
    const renewal=renewedInput(first),second=planFiscalParameters(renewal)
    expect(second.manifest.baseline_sha256).toBe(renewal.baselineSha256)
    expect(second.sql).not.toMatch(/UPDATE|DELETE|ON CONFLICT/i)
    await approve(db,second);await db.exec(second.sql)
    expect((await db.query('SELECT revision,habilitado FROM public.fiscal_parametros_homologacion ORDER BY revision')).rows)
      .toEqual([{revision:1,habilitado:false},{revision:2,habilitado:false}])
    expect((await db.query('SELECT to_jsonb(t) AS snapshot FROM public.fiscal_parametros_homologacion t WHERE revision=1')).rows).toEqual(before)
    await expect(db.exec(second.sql)).rejects.toThrow('CATALOG_BASELINE_CHANGED')
    await db.exec('ROLLBACK')
    expect((await db.query('SELECT * FROM public.fiscal_parametros_homologacion')).rows).toHaveLength(2)
  } finally {await db.close()}
})
it.each(['enabled','payload','extra-revision'])('bloquea renovación si cambia baseline %s tras preparar la propuesta',async mode=>{
  const db=new PGlite()
  try {
    await db.exec(ddl)
    const first=planFiscalParameters(liveInput())
    await approve(db,first);await db.exec(first.sql)
    const second=planFiscalParameters(renewedInput(first))
    // Simulate drift after review; no hosted writes and no change to the canonical schema.
    if(mode==='enabled')await db.exec('UPDATE public.fiscal_parametros_homologacion SET habilitado=true WHERE revision=1')
    if(mode==='payload')await db.exec("UPDATE public.fiscal_parametros_homologacion SET alicuotas='[]'::jsonb WHERE revision=1")
    if(mode==='extra-revision')await db.exec('INSERT INTO public.fiscal_parametros_homologacion SELECT 3,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,false FROM public.fiscal_parametros_homologacion WHERE revision=1')
    const before=(await db.query('SELECT to_jsonb(t) AS snapshot FROM public.fiscal_parametros_homologacion t ORDER BY revision')).rows
    await approve(db,second)
    await expect(db.exec(second.sql)).rejects.toThrow('CATALOG_BASELINE_CHANGED')
    await db.exec('ROLLBACK')
    expect((await db.query('SELECT to_jsonb(t) AS snapshot FROM public.fiscal_parametros_homologacion t ORDER BY revision')).rows).toEqual(before)
  } finally {await db.close()}
})
it.each(['checksum','missing-hash','duplicate','extra-field','wrong-revision','older-source','same-provenance','two-enabled'])('rechaza renovación %s antes de producir SQL',mode=>{
  const first=planFiscalParameters(liveInput()),renewal=renewedInput(first)
  const baseline=[baselineOf(first)]
  let candidate:Record<string,unknown>=renewal
  if(mode==='checksum')candidate={...renewal,baselineSha256:'b'.repeat(64)}
  if(mode==='missing-hash'){const {baselineSha256:_omitted,...rest}=renewal;candidate=rest}
  if(mode==='duplicate')baseline.push(baselineOf(first))
  if(mode==='two-enabled'){
    baseline[0]={...baseline[0],habilitado:true}
    baseline.push({...baseline[0],revision:2})
    candidate={...renewal,revision:3}
  }
  if(mode==='extra-field')Object.assign(baseline[0],{Token:'SYNTHETIC'})
  if(mode==='wrong-revision')candidate={...renewal,revision:3}
  if(mode==='older-source')baseline[0]={...baseline[0],consultado_en:new Date(Date.parse(renewal.now)-1).toISOString()}
  if(mode==='same-provenance')baseline[0]={...baseline[0],fuente_sha256:planFiscalParameters({...renewal,baselineText:'[]',baselineSha256:hash('[]'),revision:1}).manifest.fuente_sha256}
  if(['duplicate','extra-field','older-source','same-provenance','two-enabled'].includes(mode)){
    const baselineText=JSON.stringify(baseline);candidate={...candidate,baselineText,baselineSha256:hash(baselineText)}
  }
  expect(()=>planFiscalParameters(candidate)).toThrow(/CATALOG_/)
})

function cleanupPlanRoot(root:string):void {
  const target=resolve(root)
  if(dirname(target)!==resolve(tmpdir())||!basename(target).startsWith('kiosko-catalog-plan-test-'))throw Error('Unexpected temporary catalog target')
  rmSync(target,{recursive:true,force:true})
}
it('CLI lee snapshot/hash, genera revisión siguiente sin conectar, rechaza overwrite y hash incorrecto',()=>{
  const root=mkdtempSync(join(tmpdir(),'kiosko-catalog-plan-test-'))
  try {
    const first=planFiscalParameters(liveInput()),renewal=renewedInput(first)
    const ivaPath=join(root,'iva.json'),conditionPath=join(root,'conditions.json'),baselinePath=join(root,'baseline.json')
    writeFileSync(ivaPath,renewal.ivaText);writeFileSync(conditionPath,renewal.conditionText);writeFileSync(baselinePath,renewal.baselineText)
    const config={projectRef:renewal.projectRef,ivaPath,conditionPath,baselinePath,ivaSha256:renewal.ivaSha256,
      conditionSha256:renewal.conditionSha256,baselineSha256:renewal.baselineSha256,expiresAt:renewal.expiresAt,revision:2}
    const configPath=join(root,'config.json'),destination=join(root,'proposal')
    writeFileSync(configPath,JSON.stringify(config))
    const run=(directory:string)=>spawnSync(process.execPath,[resolve('scripts/plan-fiscal-parameters.mjs'),configPath,directory],{encoding:'utf8',timeout:10000})
    const generated=run(destination)
    expect(generated.status,generated.stderr).toBe(0)
    expect(generated.stdout).toContain('SQL_EXECUTED=false')
    const sql=readFileSync(join(destination,'catalogo-inactivo.sql'),'utf8')
    const manifest=JSON.parse(readFileSync(join(destination,'revision-publica.json'),'utf8')) as Plan['manifest']
    expect(manifest.revision).toBe(2);expect(manifest.habilitado).toBe(false)
    expect(manifest.baseline_sha256).toBe(renewal.baselineSha256)
    expect(run(destination).status).toBe(1)
    expect(readFileSync(join(destination,'catalogo-inactivo.sql'),'utf8')).toBe(sql)
    writeFileSync(configPath,JSON.stringify({...config,baselineSha256:'0'.repeat(64)}))
    const rejected=run(join(root,'invalid'))
    expect(rejected.status).toBe(1)
    expect(rejected.stderr).toContain('No connection or SQL execution performed')
    expect(existsSync(join(root,'invalid'))).toBe(false)
  } finally {cleanupPlanRoot(root)}
})
