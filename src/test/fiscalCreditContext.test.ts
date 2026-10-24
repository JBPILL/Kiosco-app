import { expect, it } from 'vitest'
import { fiscalCreditFixture } from './fixtures/fiscalCredit'
import { validateFiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditContext'
import { fiscalRepresentationFixture } from './fixtures/fiscalRepresentation'
import { validateFiscalRepresentation } from '../../supabase/functions/_shared/fiscalRepresentation'
import { prepareFiscalCreditDraft } from '../../supabase/functions/_shared/fiscalCreditDraft'
async function fixture() {
  const f = await fiscalCreditFixture()
  const context = { version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation, solicitud_id: f.proposal.datos.solicitud_id,
    propuesta_sha256: f.proposal.sha256, checkout_sha256: 'c'.repeat(64), fuente_comercial_sha256: 'b'.repeat(64), unidades_sha256: 'd'.repeat(64),
    cuit_emisor: f.proposal.datos.origen.cuit, punto_venta: 7, revision_emisor: 1, revision_parametros: 1, tipo_nota_credito: 13,
    condiciones: [{ id: 5, descripcion: 'Condición sintética', comprobantes: [13] }], alicuotas: [], emision_habilitada: false }
  return { ...f, context }
}
it('liga caso exacto y factura, congela catálogo NC sin aceptar defaults de facturas', async () => {
  const f = await fixture(), value = await validateFiscalCreditContext(f.context, f.source, f.proposal)
  expect(value).toEqual(f.context); expect(Object.isFrozen(value.condiciones[0].comprobantes)).toBe(true)
  f.context.condiciones[0].comprobantes[0] = 11; expect(value.condiciones[0].comprobantes).toEqual([13])
  expect(value.emision_habilitada).toBe(false)
})
it.each(['venta', 'operacion', 'caso', 'hash', 'emisor', 'tipo', 'flag', 'punto', 'revision', 'checksum', 'unidades', 'factura', 'duplicado', 'condicion', 'extra', 'coercion', 'control', 'unicode'] as const)('rechaza contexto NC alterado %s', async reason => {
  const f = await fixture(); let value: unknown = f.context
  if (reason === 'venta') value = { ...f.context, venta_id: crypto.randomUUID() }
  if (reason === 'operacion') value = { ...f.context, operacion_origen_id: crypto.randomUUID() }
  if (reason === 'caso') value = { ...f.context, solicitud_id: crypto.randomUUID() }
  if (reason === 'hash') value = { ...f.context, propuesta_sha256: 'a'.repeat(64) }
  if (reason === 'emisor') value = { ...f.context, cuit_emisor: '20123456789' }
  if (reason === 'tipo') value = { ...f.context, tipo_nota_credito: 3 }
  if (reason === 'flag') value = { ...f.context, emision_habilitada: true }
  if (reason === 'punto') value = { ...f.context, punto_venta: 99999 }
  if (reason === 'revision') value = { ...f.context, revision_parametros: '1' }
  if (reason === 'checksum') value = { ...f.context, checkout_sha256: 'bad' }
  if (reason === 'unidades') value = { ...f.context, unidades_sha256: null }
  if (reason === 'factura') value = { ...f.context, condiciones: [{ ...f.context.condiciones[0], comprobantes: [11] }] }
  if (reason === 'duplicado') value = { ...f.context, condiciones: [...f.context.condiciones, ...f.context.condiciones] }
  if (reason === 'condicion') value = { ...f.context, condiciones: [{ ...f.context.condiciones[0], id: 6 }] }
  if (reason === 'extra') value = { ...f.context, credencial_id: crypto.randomUUID() }
  if (reason === 'coercion') value = { ...f.context, condiciones: [{ ...f.context.condiciones[0], comprobantes: ['13'] }] }
  if (reason === 'control') value = { ...f.context, condiciones: [{ ...f.context.condiciones[0], descripcion: 'Bad\ntext' }] }
  if (reason === 'unicode') value = { ...f.context, condiciones: [{ ...f.context.condiciones[0], descripcion: '\ud800' }] }
  await expect(validateFiscalCreditContext(value, f.source, f.proposal)).rejects.toThrow('FISCAL_CONTEXTO_NC_NO_CONFIRMADO')
})
it.each([[1,3],[6,8]])('contexto para factura %i exige tipo NC %i y alícuotas acreditadas', async(invoice,note)=>{
  const f=await fixture(),original=await fiscalRepresentationFixture({tipoComprobante:invoice,importes:{total:'123.45',neto:'100.00',iva:'21.00',noGravado:'0.00',exento:'0.00',tributos:'2.45'},iva:[{id:5,base:'100.00',importe:'21.00'}],tributos:[{id:99,descripcion:'Tributo',base:'100.00',alicuota:'2.45',importe:'2.45'}]})
  const source=await validateFiscalRepresentation({...original.wire,condicion_emisor:'RESPONSABLE_INSCRIPTO'},original.sale,original.operation),body=source.constancia.solicitud.solicitud
  const proposal=await prepareFiscalCreditDraft(source,{...f.input,lineas:[{...f.input.lineas[0],detalle_id:source.contexto.lineas[0].detalle_id}],importes:body.importes,iva:body.iva,tributos:body.tributos},f.input.fecha)
  const context={...f.context,venta_id:source.venta_id,operacion_origen_id:source.operacion_id,solicitud_id:proposal.datos.solicitud_id,propuesta_sha256:proposal.sha256,tipo_nota_credito:note,condiciones:[{id:5,descripcion:'Condición NC',comprobantes:[note]}],alicuotas:[{id:5,descripcion:'Alícuota sintética'}]}
  expect((await validateFiscalCreditContext(context,source,proposal)).tipo_nota_credito).toBe(note)
  await expect(validateFiscalCreditContext({...context,alicuotas:[]},source,proposal)).rejects.toThrow('FISCAL_CONTEXTO_NC_NO_CONFIRMADO')
})
it('captura DTO antes de esperar y rechaza propuesta con canónico alterado', async () => {
  const f = await fixture(), validation = validateFiscalCreditContext(f.context, f.source, f.proposal)
  f.context.punto_venta = 99999; expect((await validation).punto_venta).toBe(7)
  f.context.punto_venta = 7
  await expect(validateFiscalCreditContext(f.context, f.source, { ...f.proposal, canonico: '{}' })).rejects.toThrow('FISCAL_CONTEXTO_NC_NO_CONFIRMADO')
})
