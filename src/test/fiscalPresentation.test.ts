import { describe, expect, it } from 'vitest'
import { prepareFiscalPresentationFacts, validateFiscalPresentationProposal, validateFiscalPresentationRecord } from '../../supabase/functions/_shared/fiscalPresentation'
const operation='12345678-1234-4234-8234-123456789abc'
const sale='22345678-1234-4234-8234-123456789abc'
const facts=()=>({version:1,emisor:{razon_social:'Comercio ñ',domicilio_comercial:'Calle 12',ingresos_brutos:'Exento',inicio_actividades:'20240229'},receptor:{nombre:'Consumidor final',domicilio:'Sin identificar'},lineas:[{detalle_id:operation,descripcion:'Artículo "especial"'}],otros_impuestos_nacionales_indirectos:'0.00'})
describe('historical fiscal presentation facts',()=>{
 it('preserves explicit Unicode and freezes historical facts',async()=>{
  const source=facts(),result=await prepareFiscalPresentationFacts(source)
  source.emisor.razon_social='Changed'
  expect(result.datos.emisor.razon_social).toBe('Comercio ñ')
  expect(Object.isFrozen(result.datos.emisor)).toBe(true)
  expect(await validateFiscalPresentationProposal({canonico:result.canonico,sha256:result.sha256})).toEqual({canonico:result.canonico,sha256:result.sha256})
 })
 it.each(['20230229','20241301','00000101','29/02/2024'])('rejects invalid canonical date %s',async inicio=>{
  const v=facts();v.emisor.inicio_actividades=inicio
  await expect(prepareFiscalPresentationFacts(v)).rejects.toThrow()
 })
 it.each(['0','0,00','-1.00','1e2','01.00'])('rejects ambiguous tax %s',async value=>{
  const v=facts();v.otros_impuestos_nacionales_indirectos=value
  await expect(prepareFiscalPresentationFacts(v)).rejects.toThrow()
 })
 it.each(['','  ','Name\u0000','Name\u0085','\ud800'])('rejects invalid historical text',async value=>{
  const v=facts();v.emisor.razon_social=value
  await expect(prepareFiscalPresentationFacts(v)).rejects.toThrow()
 })
 it('rejects duplicate detail identities and extra fields',async()=>{
  const v=facts();v.lineas.push({...v.lineas[0]})
  await expect(prepareFiscalPresentationFacts(v)).rejects.toThrow()
  await expect(prepareFiscalPresentationFacts({...facts(),extra:true})).rejects.toThrow()
 })
 it('verifies durable record scope, hash and disabled emission',async()=>{
  const p=await prepareFiscalPresentationFacts(facts())
  const wire={operacion_id:operation,venta_id:sale,solicitud_sha256:'a'.repeat(64),presentacion_sha256:p.sha256,estado:'DATOS_REPRESENTACION_GUARDADOS',emision_habilitada:false,canonico:p.canonico}
  expect((await validateFiscalPresentationRecord(wire,sale,operation)).datos).toEqual(p.datos)
  await expect(validateFiscalPresentationRecord({...wire,emision_habilitada:true},sale,operation)).rejects.toThrow()
  await expect(validateFiscalPresentationRecord({...wire,presentacion_sha256:'b'.repeat(64)},sale,operation)).rejects.toThrow()
  await expect(validateFiscalPresentationRecord(wire,operation,operation)).rejects.toThrow()
 })
})
