import { expect, it } from 'vitest'
import { fiscalCreditContextFixture } from './fixtures/fiscalCreditContext'
import { validateFiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditContext'
import { prepareFiscalCreditPreparation, validateFiscalCreditPreparationRecord } from '../../supabase/functions/_shared/fiscalCreditPreparation'
const empty = { servicioDesde: null, servicioHasta: null, vencimientoPago: null }
const periods = { servicioDesde: '20261002', servicioHasta: '20261019', vencimientoPago: '20261027' }
async function recordFixture() {
  const f = await fiscalCreditContextFixture(11, 2), context = await validateFiscalCreditContext(f.context, f.source, f.proposal)
  const preparation = await prepareFiscalCreditPreparation(f.source, f.proposal, context, periods)
  const packet = { version: 1, entorno: 'HOMOLOGACION', venta_id: f.source.venta_id, operacion_origen_id: f.source.operacion_id,
    solicitud_id: f.proposal.datos.solicitud_id, propuesta_sha256: f.proposal.sha256, estado: 'DATOS_NC_PREPARADOS',
    preparacion: { canonico: preparation.canonico, sha256: preparation.sha256 }, contexto: context,
    propuesta: { canonico: f.proposal.canonico, sha256: f.proposal.sha256 }, emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false }
  return { ...f, preparation, packet }
}
it.each(['DATOS_NC_PREPARADOS', 'CANCELADA'])('recupera evidencia histórica %s sin conceder efectos', async estado => {
  const f = await recordFixture(), result = await validateFiscalCreditPreparationRecord({ ...f.packet, estado }, f.source, f.proposal)
  expect(result.estado).toBe(estado); expect(result.preparacion.canonico).toBe(f.preparation.canonico)
  expect(result.emision_habilitada || result.reintegro_habilitado || result.reposicion_habilitada).toBe(false)
  expect(Object.isFrozen(result.preparacion.datos.datos)).toBe(true)
})
it.each(['extra', 'venta', 'caso', 'estado', 'permiso', 'hash', 'canonico', 'contexto', 'propuesta', 'periodo', 'numero'])('rechaza evidencia histórica alterada: %s', async reason => {
  const f = await recordFixture(), packet: Record<string, unknown> = structuredClone(f.packet)
  if (reason === 'extra') packet.extra = true
  if (reason === 'venta') packet.venta_id = '00000000-0000-4000-8000-000000000001'
  if (reason === 'caso') packet.solicitud_id = '00000000-0000-4000-8000-000000000001'
  if (reason === 'estado') packet.estado = 'AUTORIZADA'
  if (reason === 'permiso') packet.reintegro_habilitado = true
  if (reason === 'hash') packet.preparacion = { ...f.packet.preparacion, sha256: 'a'.repeat(64) }
  if (reason === 'canonico') packet.preparacion = { ...f.packet.preparacion, canonico: ` ${f.preparation.canonico}` }
  if (reason === 'contexto') packet.contexto = { ...f.packet.contexto, revision_parametros: 999 }
  if (reason === 'propuesta') packet.propuesta = { ...f.packet.propuesta, extra: true }
  if (reason === 'periodo' || reason === 'numero') {
    const data = JSON.parse(f.preparation.canonico)
    if (reason === 'periodo') data.datos.servicioDesde = '20260231'
    else data.datos.numero = 1
    packet.preparacion = { ...f.packet.preparacion, canonico: JSON.stringify(data) }
  }
  await expect(validateFiscalCreditPreparationRecord(packet, f.source, f.proposal)).rejects.toThrow('FISCAL_PREPARACION_NC_INVALIDA')
})
it.each([1,6,11] as const)('preparación de factura %i conserva asociación/receptor/importes sin numerar o emitir',async(invoice)=>{
  const f=await fiscalCreditContextFixture(invoice),context=await validateFiscalCreditContext(f.context,f.source,f.proposal)
  const value=await prepareFiscalCreditPreparation(f.source,f.proposal,context,empty)
  expect(value.estado).toBe('PREPARACION_NC_NO_PERSISTIDA');expect(value.emision_habilitada).toBe(false)
  expect(JSON.parse(value.canonico)).toEqual(value.datos);expect(value.sha256).toMatch(/^[0-9a-f]{64}$/)
  expect(value.datos.datos).not.toHaveProperty('numero');expect(value.datos.datos.tipoComprobante).toBe(f.proposal.datos.tipo_nota_credito)
  expect(value.datos.datos.comprobantesAsociados).toEqual([{tipo:invoice,puntoVenta:2,numero:1,cuit:f.proposal.datos.origen.cuit,fecha:'20261021'}])
  expect(value.datos.datos.importes).toEqual(f.input.importes);expect(value.datos.datos.iva).toEqual(f.input.iva)
  expect(Object.isFrozen(value.datos.datos.comprobantesAsociados[0])).toBe(true)
  expect(value.datos.datos.puntoVenta).toBe(7)
})
it.each([2,3] as const)('concepto %i requiere períodos explícitos, sin reutilizar los de factura',async(concept)=>{
  const f=await fiscalCreditContextFixture(11,concept),context=await validateFiscalCreditContext(f.context,f.source,f.proposal)
  await expect(prepareFiscalCreditPreparation(f.source,f.proposal,context,empty)).rejects.toThrow('FISCAL_PREPARACION_NC_INVALIDA')
  const value=await prepareFiscalCreditPreparation(f.source,f.proposal,context,periods)
  expect(value.datos.datos).toMatchObject(periods);expect(value.datos.datos.servicioDesde).not.toBe(f.source.constancia.solicitud.solicitud.servicioDesde)
})
it.each(['falta','extra','numero','productoConPeriodo','fecha','invertido','coercion','contexto','caso'] as const)('rechaza preparación %s sin fabricar número o parámetros',async(reason)=>{
  const f=await fiscalCreditContextFixture(11,reason==='productoConPeriodo'?1:2),context=await validateFiscalCreditContext(f.context,f.source,f.proposal)
  let input:unknown=periods
  if(reason==='falta')input={servicioDesde:periods.servicioDesde,servicioHasta:periods.servicioHasta}
  if(reason==='extra')input={...periods,cuitEmisor:'20123456789'}
  if(reason==='numero')input={...periods,numero:1}
  if(reason==='fecha')input={...periods,servicioDesde:'20260231'}
  if(reason==='invertido')input={...periods,servicioDesde:'20261020'}
  if(reason==='coercion')input={...periods,servicioDesde:20261002}
  await expect(prepareFiscalCreditPreparation(f.source,reason==='caso'?{...f.proposal,sha256:'a'.repeat(64)}:f.proposal,reason==='contexto'?{...context,propuesta_sha256:'a'.repeat(64)}:context,input)).rejects.toThrow('FISCAL_PREPARACION_NC_INVALIDA')
})
it('captura entrada/contexto antes de hash asíncrono y conserva contenido original',async()=>{
  const f=await fiscalCreditContextFixture(11,2),context=await validateFiscalCreditContext(f.context,f.source,f.proposal),entry={...periods}
  const pending=prepareFiscalCreditPreparation(f.source,f.proposal,context,entry);entry.servicioDesde='20261020'
  expect((await pending).datos.datos.servicioDesde).toBe('20261002')
})
