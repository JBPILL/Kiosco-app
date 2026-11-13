// @vitest-environment node
import { expect, it } from 'vitest'
import { validateFiscalDiagnosis } from '../../supabase/functions/_shared/fiscalDiagnosis'

const sale=crypto.randomUUID(),op=crypto.randomUUID()
const sample={version:1,entorno:'HOMOLOGACION',operacion_id:op,venta_id:sale,solicitud_sha256:'a'.repeat(64),estado:'ENVIO_INCIERTO',
 recepcion:{estado:'RECHAZO_RECIBIDO',codigos:[10017],puedeReenviar:false},ultima_consulta:{estado:'CONCILIAR',codigo:'SIN_CONFIRMACION'},puedeReenviar:false}
it('copia y congela diagnóstico acotado sin conceder reenvío',()=>{
 const input=structuredClone(sample),result=validateFiscalDiagnosis(input,sale,op)
 input.recepcion.codigos.push(42);input.ultima_consulta.codigo='DATOS_DISTINTOS'
 expect(result.recepcion?.codigos).toEqual([10017]);expect(result.ultima_consulta?.codigo).toBe('SIN_CONFIRMACION')
 expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result.ultima_consulta)).toBe(true);expect(result.puedeReenviar).toBe(false)
})
it('no interpreta ausencia de recepción como rechazo ni aprobación recibida como autorización',()=>{
 expect(validateFiscalDiagnosis({...sample,recepcion:null,ultima_consulta:null},sale,op).recepcion).toBeNull()
 expect(validateFiscalDiagnosis({...sample,recepcion:{...sample.recepcion,estado:'APROBACION_RECIBIDA'}},sale,op).estado).toBe('ENVIO_INCIERTO')
})
it.each(['SOLICITUD_INVALIDA','RESPUESTA_INVALIDA','CONSULTA_DISTINTA','DATOS_DISTINTOS','SIN_CONFIRMACION'])('admite causa de consulta cerrada %s',codigo=>{
 expect(validateFiscalDiagnosis({...sample,ultima_consulta:{estado:'CONCILIAR',codigo}},sale,op).ultima_consulta?.codigo).toBe(codigo)
})
it('reserva sin envío no admite evidencia inventada y autorización exige estado coherente',()=>{
 expect(validateFiscalDiagnosis({...sample,estado:'RESERVADA',recepcion:null,ultima_consulta:null},sale,op).estado).toBe('RESERVADA')
 expect(()=>validateFiscalDiagnosis({...sample,estado:'RESERVADA'},sale,op)).toThrow()
 expect(()=>validateFiscalDiagnosis({...sample,ultima_consulta:{estado:'AUTORIZACION_COINCIDENTE',codigo:null}},sale,op)).toThrow()
 expect(validateFiscalDiagnosis({...sample,estado:'AUTORIZADA',ultima_consulta:{estado:'AUTORIZACION_COINCIDENTE',codigo:null}},sale,op).estado).toBe('AUTORIZADA')
})
it.each([{...sample,venta_id:crypto.randomUUID()},{...sample,operacion_id:crypto.randomUUID()},{...sample,entorno:'PRODUCCION'}, {...sample,version:2}, {...sample,puedeReenviar:true}, {...sample,estado:'RECHAZADA'}, {...sample,solicitud_sha256:'bad'}, {...sample,token:'fixture'}, {...sample,cae:'11111111111111'}, {...sample,ultima_consulta:{estado:'CONCILIAR',codigo:'FUTURO'}}, {...sample,ultima_consulta:{estado:'CONCILIAR',codigo:'SIN_CONFIRMACION',error:'private'}}])('rechaza DTO ajeno o ampliado %#',input=>{
 expect(()=>validateFiscalDiagnosis(input,sale,op)).toThrow()
})
it.each(Object.keys(sample))('no sustituye campo ausente %s',key=>{
 const input:Record<string,unknown>={...sample};delete input[key];expect(()=>validateFiscalDiagnosis(input,sale,op)).toThrow()
})
