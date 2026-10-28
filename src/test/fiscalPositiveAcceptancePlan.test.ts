// @vitest-environment node
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { planFiscalPositiveAcceptance } from '../../scripts/plan-fiscal-positive-acceptance.mjs'

const hash=(v:string)=>createHash('sha256').update(v).digest('hex')
function fixture(){
  const ownerAuthId=randomUUID(),kioskId=randomUUID(),saleId=randomUUID()
  const snapshot={read_only:'on',observed_at:'2026-10-28T07:20:00Z',
    owner:{auth_user_id:ownerAuthId,kiosco_id:kioskId,rol:'DUEÑO',activo:true,es_superadmin:false},kiosk_active:true,
    sale:{id:saleId,kiosco_id:kioskId,estado:'COMPLETADA',fecha_hora:'2026-10-26T15:34:50Z',total:'200.00',has_legacy_cae:false},
    details:[{id:randomUUID(),producto_id:randomUUID(),cantidad:1,precio_unitario:200,subtotal:200,es_devolucion_envase:false}],returns:0,operations:0,
    issuer:{kiosco_id:kioskId,cuit_emisor:'20123456786',punto_venta:2,credencial_id:randomUUID(),certificado_sha256:'a'.repeat(64),revision:1,habilitado:false,actualizado_en:'2026-10-28T01:00:00Z'},
    catalog:{revision:2,condiciones:[{id:5,descripcion:'Synthetic final',comprobantes:[11]}],alicuotas:[],fuente_sha256:'b'.repeat(64),consultado_en:'2026-10-28T03:06:15Z',vence_en:'2026-10-29T02:59:00Z',habilitado:false}}
  const snapshotText=JSON.stringify(snapshot)
  const config={projectRef:'acoyfwwmhaeruciyedri',snapshotText,snapshotSha256:hash(snapshotText),ownerAuthId,kioskId,operationId:randomUUID(),
    invoice:{condicionEmisor:'MONOTRIBUTO',datos:{tipoComprobante:11,concepto:1,tipoDocumento:99,numeroDocumento:'0',condicionIvaReceptor:5,fecha:'20261028',servicioDesde:null,servicioHasta:null,vencimientoPago:null,moneda:'PES',cotizacion:'1',importes:{neto:'200.00',iva:'0.00',noGravado:'0.00',exento:'0.00',tributos:'0.00'},iva:[],tributos:[]}},
    now:'2026-10-28T07:30:00.000Z',startsAt:'2026-10-28T15:10:00.000Z',endsAt:'2026-10-28T15:25:00.000Z',taNotBefore:'2026-10-28T15:06:15.411Z'}
  return {config,snapshot}
}
it('creates deterministic explicit data with stable operation identity and no authority to activate or emit',async()=>{
  const {config}=fixture(),before=JSON.stringify(config),plan=await planFiscalPositiveAcceptance(config)
  expect(JSON.stringify(config)).toBe(before)
  expect(plan).toEqual(await planFiscalPositiveAcceptance(config))
  expect(plan.prepared.datos.importes.total).toBe('200.00')
  expect(plan.prepared.datos).not.toHaveProperty('numero')
  expect(plan.requests[2]).toMatchObject({accion:'GUARDAR_DATOS_FISCALES',operacion_id:config.operationId,entrada:config.invoice})
  expect(plan.requests.map(r=>r.accion)).not.toContain('ENVIAR_NC')
  expect(plan.requests.map(r=>r.accion)).not.toContain('APROBAR_REVISION')
  expect(plan.manifest).toMatchObject({requiresSpecificGo:true,requiresLiveRevalidation:true,requestsExecuted:false,sqlExecuted:false,hostedAcceptanceProven:false,emissionEnabled:false,automaticApproval:false,rollbackPackageReady:false})
  expect(plan.manifest.alwaysClosedFlags).toContain('ARCA_HOMO_EMISSION_ENABLED')
  expect(plan.manifest.alwaysClosedFlags).toContain('ARCA_HOMO_RECONCILIATION_ENABLED')
  expect(plan.manifest.alwaysClosedFlags).toContain('ARCA_HOMO_CREDIT_APPLY_ENABLED')
})
it('accepts existing UUID versions supported by the database instead of assuming every detail is v4',async()=>{
  const {config,snapshot}=fixture()
  snapshot.details[0].id='11111111-1111-8111-a111-111111111111'
  const snapshotText=JSON.stringify(snapshot)
  expect((await planFiscalPositiveAcceptance({...config,snapshotText,snapshotSha256:hash(snapshotText)})).prepared.datos.importes.total).toBe('200.00')
})
it.each(['production','ta-live','expired','long-window','day-change','catalog-expired','checksum','private-field','bad-json','local-time'])('rejects %s without networking or leaking input',async mode=>{
  const {config,snapshot}=fixture();let candidate:Record<string,unknown>={...config}
  if(mode==='production')candidate.projectRef='lllkjnqpltnwvxzphncr'
  if(mode==='ta-live')candidate.startsAt=config.taNotBefore
  if(mode==='local-time')candidate.startsAt='2026-10-28T15:10:00'
  if(mode==='expired')candidate.startsAt='2026-10-28T07:00:00Z'
  if(mode==='long-window')candidate.endsAt='2026-10-28T15:26:00Z'
  if(mode==='day-change'){candidate.startsAt='2026-10-29T02:55:00Z';candidate.endsAt='2026-10-29T03:05:00Z'}
  if(mode==='catalog-expired')snapshot.catalog.vence_en='2026-10-28T15:20:00Z'
  if(mode==='checksum')candidate.snapshotSha256='c'.repeat(64)
  if(mode==='private-field')candidate.Token='SYNTHETIC_PRIVATE_NEVER_LOG'
  if(mode==='bad-json'){candidate.snapshotText='SYNTHETIC_PRIVATE_NEVER_LOG';candidate.snapshotSha256=hash(String(candidate.snapshotText))}
  if(mode==='catalog-expired'){candidate.snapshotText=JSON.stringify(snapshot);candidate.snapshotSha256=hash(String(candidate.snapshotText))}
  await expect(planFiscalPositiveAcceptance(candidate)).rejects.toThrow(/^POSITIVE_ACCEPTANCE_PROPOSAL_REJECTED$/)
})
it.each(['cashier','inactive-owner','foreign-owner','superadmin','kiosk-suspended','sale-annulled','cae','return','operation','fractional','envase','total','enabled-issuer','enabled-catalog','revision'])('rejects snapshot drift %s',async mode=>{
  const {config,snapshot}=fixture()
  if(mode==='cashier')snapshot.owner.rol='CAJERO'
  if(mode==='inactive-owner')snapshot.owner.activo=false
  if(mode==='foreign-owner')snapshot.owner.kiosco_id=randomUUID()
  if(mode==='superadmin')snapshot.owner.es_superadmin=true
  if(mode==='kiosk-suspended')snapshot.kiosk_active=false
  if(mode==='sale-annulled')snapshot.sale.estado='ANULADA'
  if(mode==='cae')snapshot.sale.has_legacy_cae=true
  if(mode==='return')snapshot.returns=1
  if(mode==='operation')snapshot.operations=1
  if(mode==='fractional')snapshot.details[0].cantidad=1.013
  if(mode==='envase')snapshot.details[0].es_devolucion_envase=true
  if(mode==='total')snapshot.sale.total='201.00'
  if(mode==='enabled-issuer')snapshot.issuer.habilitado=true
  if(mode==='enabled-catalog')snapshot.catalog.habilitado=true
  if(mode==='revision')snapshot.catalog.revision=1
  const snapshotText=JSON.stringify(snapshot)
  await expect(planFiscalPositiveAcceptance({...config,snapshotText,snapshotSha256:hash(snapshotText)})).rejects.toThrow('POSITIVE_ACCEPTANCE_PROPOSAL_REJECTED')
})
it.each(['emitter','type','receiver','date','amount','document','missing-iva'])('does not infer explicit fiscal input %s',async mode=>{
  const {config}=fixture()
  if(mode==='emitter')config.invoice.condicionEmisor='RESPONSABLE_INSCRIPTO'
  if(mode==='type')config.invoice.datos.tipoComprobante=6
  if(mode==='receiver')config.invoice.datos.condicionIvaReceptor=1
  if(mode==='date')config.invoice.datos.fecha='20261027'
  if(mode==='amount')config.invoice.datos.importes.neto='201.00'
  if(mode==='document')config.invoice.datos.numeroDocumento='1'
  if(mode==='missing-iva')delete (config.invoice.datos as Partial<typeof config.invoice.datos>).iva
  await expect(planFiscalPositiveAcceptance(config)).rejects.toThrow('POSITIVE_ACCEPTANCE_PROPOSAL_REJECTED')
})
function cleanupProposal(root:string){
  const checked=resolve(root)
  if(dirname(checked)!==resolve(tmpdir())||!basename(checked).startsWith('kiosko-positive-plan-'))throw Error('Unexpected cleanup target')
  rmSync(checked,{recursive:true,force:true,maxRetries:5,retryDelay:100})
}
it('CLI writes a public draft once, preserves its UUID and refuses to overwrite after reload',()=>{
  const root=mkdtempSync(join(tmpdir(),'kiosko-positive-plan-'))
  try{
    const {config,snapshot}=fixture(),{snapshotText:_fixedSnapshot,now,...settings}=config
    // The child process uses the real clock; keep this test valid after today.
    expect(now).toBeTruthy()
    const runtimeNow=Date.now(),start=new Date(runtimeNow+8*3600000);start.setUTCMinutes(0,0,0)
    settings.startsAt=start.toISOString();settings.endsAt=new Date(start.getTime()+900000).toISOString()
    settings.taNotBefore=new Date(runtimeNow+6*3600000).toISOString()
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(start)
    settings.invoice.datos.fecha=['year','month','day'].map(k=>parts.find(p=>p.type===k)?.value).join('')
    snapshot.observed_at=new Date(runtimeNow-1000).toISOString();snapshot.catalog.consultado_en=snapshot.observed_at
    snapshot.catalog.vence_en=new Date(start.getTime()+3600000).toISOString()
    const snapshotText=JSON.stringify(snapshot);settings.snapshotSha256=hash(snapshotText)
    const snapshotPath=join(root,'snapshot.json'),configPath=join(root,'config.json'),output=join(root,'proposal')
    writeFileSync(snapshotPath,snapshotText);writeFileSync(configPath,JSON.stringify({...settings,snapshotPath}))
    const command=[resolve('scripts/plan-fiscal-positive-acceptance.mjs'),configPath,output]
    const first=spawnSync(process.execPath,command,{encoding:'utf8',timeout:10000})
    expect(first.status).toBe(0);expect(first.stdout).toContain('REMOTE_EXECUTED=false GO_READY=false')
    const before=readFileSync(join(output,'manifest.json'),'utf8')
    expect(JSON.parse(before).operationId).toBe(config.operationId)
    const second=spawnSync(process.execPath,command,{encoding:'utf8',timeout:10000})
    expect(second.status).toBe(1);expect(second.stderr).toBe('POSITIVE_ACCEPTANCE_PROPOSAL_NOT_CONFIRMED. No network or activation.\n')
    expect(readFileSync(join(output,'manifest.json'),'utf8')).toBe(before)
  }finally{cleanupProposal(root)}
})
