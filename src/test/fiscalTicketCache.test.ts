// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { createFiscalTicketCache } from '../../supabase/functions/_shared/fiscalTicketCache'
import type { WsaaTicketEnvelope } from '../../supabase/functions/_shared/fiscalTicketCache'
import type { FiscalWorkerBinding } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'

const binding: FiscalWorkerBinding={version:1,entorno:'HOMOLOGACION',servicio:'wsfe',operacion_id:randomUUID(),kiosco_id:randomUUID(),usuario_id:randomUUID(),
  cuit_emisor:'20123456786',punto_venta:2,credencial_id:randomUUID(),certificado_sha256:'a'.repeat(64),revision:1}
let time=1000000
function envelope(b=binding):WsaaTicketEnvelope {
  return {entorno:b.entorno,servicio:b.servicio,cuitEmisor:b.cuit_emisor,credencialId:b.credencial_id,certificadoSha256:b.certificado_sha256,
    token:'SYNTHETIC_TOKEN',sign:'SYNTHETIC_SIGN',expiresAt:time+120000}
}
afterEach(()=>{vi.useRealTimers();time=1000000})
it('reutiliza TA vigente sin exponer Token/Sign en serialización habitual',async()=>{
  const cache=createFiscalTicketCache({now:()=>time}),load=vi.fn(async()=>envelope())
  const first=await cache.get(binding,load)
  expect(first.token).toBe('SYNTHETIC_TOKEN');expect(first.sign).toBe('SYNTHETIC_SIGN')
  expect(await cache.get(binding,load)).toBe(first);expect(load).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(first)).not.toContain('SYNTHETIC')
  expect({...first}).toEqual({expiresAt:time+120000});expect(String(first)).toBe('[Ticket WSAA privado]')
  expect(Object.isFrozen(first)).toBe(true)
})
it('excluye renovaciones simultáneas y renueva antes del vencimiento',async()=>{
  const cache=createFiscalTicketCache({now:()=>time}),load=vi.fn(async()=>envelope())
  const results=await Promise.all(Array.from({length:12},()=>cache.get(binding,load)))
  expect(load).toHaveBeenCalledTimes(1);expect(new Set(results).size).toBe(1)
  time+=60000
  await cache.get(binding,load);expect(load).toHaveBeenCalledTimes(2)
})
it.each(['credencial','certificado','revision','tenant','punto'])('separa caché al cambiar %s',async mode=>{
  const cache=createFiscalTicketCache({now:()=>time}),load=vi.fn(async(b:Readonly<FiscalWorkerBinding>)=>envelope(b))
  await cache.get(binding,load)
  const other={...binding}
  if(mode==='credencial')other.credencial_id=randomUUID()
  if(mode==='certificado')other.certificado_sha256='b'.repeat(64)
  if(mode==='revision')other.revision=2
  if(mode==='tenant')other.kiosco_id=randomUUID()
  if(mode==='punto')other.punto_venta=3
  await cache.get(other,load);expect(load).toHaveBeenCalledTimes(2)
})
it.each(['emisor','certificado','credencial','vencido','token','control','sign'])('rechaza TA de fuente inconsistente %s',async mode=>{
  const cache=createFiscalTicketCache({now:()=>time}),value={...envelope()}
  if(mode==='emisor')value.cuitEmisor='30123456789'
  if(mode==='certificado')value.certificadoSha256='b'.repeat(64)
  if(mode==='credencial')value.credencialId=randomUUID()
  if(mode==='vencido')value.expiresAt=time+60000
  if(mode==='token')value.token=''
  if(mode==='control')value.token='x\u0000'
  if(mode==='sign')value.sign='x'.repeat(262145)
  await expect(cache.get(binding,async()=>value)).rejects.toThrow('FISCAL_TICKET_NO_DISPONIBLE')
  expect((await cache.get(binding,async()=>envelope())).token).toBe('SYNTHETIC_TOKEN')
})
it('falla sin filtrar error de custodia y permite renovar después de fallo terminado',async()=>{
  const cache=createFiscalTicketCache({now:()=>time})
  await expect(cache.get(binding,async()=>{throw new Error('SYNTHETIC_PRIVATE')})).rejects.toThrow('FISCAL_TICKET_NO_DISPONIBLE')
  expect(await cache.get(binding,async()=>envelope())).toBeDefined()
})
it('timeout aborta, no solapa fuente colgada y descarta resultado tardío',async()=>{
  vi.useFakeTimers()
  const cache=createFiscalTicketCache({now:()=>time,timeoutMs:100})
  let finish!:(value:WsaaTicketEnvelope)=>void
  const load=vi.fn((_b:Readonly<FiscalWorkerBinding>,_s:AbortSignal)=>new Promise<WsaaTicketEnvelope>(resolve=>{finish=resolve}))
  const first=cache.get(binding,load)
  const rejection=expect(first).rejects.toThrow('FISCAL_TICKET_NO_DISPONIBLE')
  await vi.advanceTimersByTimeAsync(100);await rejection
  expect(load.mock.calls[0][1].aborted).toBe(true)
  await expect(cache.get(binding,load)).rejects.toThrow('FISCAL_TICKET_NO_DISPONIBLE')
  expect(load).toHaveBeenCalledTimes(1)
  finish(envelope());await Promise.resolve();await Promise.resolve();await Promise.resolve()
  const replacement=vi.fn(async()=>envelope())
  await cache.get(binding,replacement);expect(replacement).toHaveBeenCalledTimes(1)
})
it('limita entradas sin desalojar renovaciones activas',async()=>{
  const cache=createFiscalTicketCache({now:()=>time,capacity:1}),load=vi.fn(async(b:Readonly<FiscalWorkerBinding>)=>envelope(b))
  await cache.get(binding,load)
  await expect(cache.get({...binding,credencial_id:randomUUID()},load)).rejects.toThrow('FISCAL_TICKET_NO_DISPONIBLE')
  expect(load).toHaveBeenCalledTimes(1)
  time+=60000
  await cache.get({...binding,credencial_id:randomUUID()},load);expect(load).toHaveBeenCalledTimes(2)
})
it.each([{...binding,entorno:'PRODUCCION'},{...binding,credencial_id:'-'.repeat(36)},
  {...binding,certificado_sha256:'a'.repeat(65)},{...binding,revision:0}])('rechaza metadatos antes de tocar custodia %#',async data=>{
  const cache=createFiscalTicketCache({now:()=>time}),load=vi.fn(async()=>envelope())
  await expect(cache.get(data as FiscalWorkerBinding,load)).rejects.toThrow('FISCAL_TICKET_NO_DISPONIBLE')
  expect(load).not.toHaveBeenCalled()
})
