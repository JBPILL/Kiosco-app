// @vitest-environment node
import { expect, it } from 'vitest'
import { prepareFiscalData, requestFromPreparedFiscalData, validateFiscalPreparationContext, verifySavedFiscalPreparation } from '../../supabase/functions/_shared/fiscalPreparation'
import type { FiscalPreparationContext, FiscalPreparationInput } from '../../supabase/functions/_shared/fiscalPreparationContract'
import { wsfeSample } from './fixtures/fiscalWsfe'

// Catálogo sintético inyectado. No acredita parámetros ni padrón ARCA reales.
const context:FiscalPreparationContext={version:1,venta_id:crypto.randomUUID(),total:'123.45',cuit_emisor:wsfeSample.cuitEmisor,punto_venta:7,
 incluye_recepcion_envases:false,revision_parametros:1,condiciones:[{id:5,descripcion:'Consumidor final de ensayo',comprobantes:[6,11]},{id:1,descripcion:'RI de ensayo',comprobantes:[1,11]}],
 alicuotas:[{id:5,descripcion:'IVA ensayo 21%'}]}
function input():FiscalPreparationInput {
 const {tipoComprobante,concepto,tipoDocumento,numeroDocumento,condicionIvaReceptor,fecha,servicioDesde,servicioHasta,vencimientoPago,moneda,cotizacion,iva,tributos}=wsfeSample
 const {total:_serverOnly,...importes}=wsfeSample.importes
 return {condicionEmisor:'MONOTRIBUTO',datos:{tipoComprobante,concepto,tipoDocumento,numeroDocumento,condicionIvaReceptor,fecha,servicioDesde,servicioHasta,vencimientoPago,moneda,cotizacion,iva,tributos,importes}}
}
it('usa identidad/total de servidor y no reserva un número al preparar datos',async()=>{
 const prepared=await prepareFiscalData(context,input())
 expect(prepared.datos.cuitEmisor).toBe(context.cuit_emisor);expect(prepared.datos.puntoVenta).toBe(7)
 expect(prepared.datos.importes.total).toBe(context.total);expect(prepared.datos).not.toHaveProperty('numero')
 expect(Object.isFrozen(prepared.datos)).toBe(true);expect(Object.isFrozen(prepared.datos.importes)).toBe(true)
 const a=await requestFromPreparedFiscalData(prepared,42),b=await requestFromPreparedFiscalData(prepared,43)
 expect(a.solicitud.numero).toBe(42);expect(a.sha256).not.toBe(prepared.sha256);expect(b.sha256).not.toBe(a.sha256)
 expect(await prepareFiscalData(context,input())).toEqual(prepared)
})
it.each(['MONOTRIBUTO','EXENTO'] as const)('permite C explícita para emisor %s sin alícuota implícita',async condicionEmisor=>{
 expect((await prepareFiscalData(context,{...input(),condicionEmisor})).datos.iva).toEqual([])
})
it.each([1,6])('prepara tipo %i con IVA detallado suministrado, sin calcular 21% por defecto',async type=>{
 const i=input();i.condicionEmisor='RESPONSABLE_INSCRIPTO';i.datos.tipoComprobante=type;i.datos.condicionIvaReceptor=type===1?1:5
 i.datos.importes={neto:'100.00',iva:'21.00',noGravado:'0.00',exento:'0.00',tributos:'0.00'};i.datos.iva=[{id:5,base:'100.00',importe:'21.00'}]
 expect((await prepareFiscalData({...context,total:'121.00'},i)).datos.importes.iva).toBe('21.00')
})
it.each(['condicionEmisor','datos'])('dato obligatorio %s ausente no se sustituye',async key=>{
 const i:Record<string,unknown>={...input()};delete i[key];await expect(prepareFiscalData(context,i)).rejects.toThrow()
})
it.each(['tipoComprobante','fecha','condicionIvaReceptor','iva','importes'])('campo explícito %s ausente se rechaza',async key=>{
 const i=input();delete (i.datos as unknown as Record<string,unknown>)[key];await expect(prepareFiscalData(context,i)).rejects.toThrow()
})
it.each(['numero','cuitEmisor','puntoVenta','total'])('no permite al formulario imponer %s',async key=>{
 const i=input();await expect(prepareFiscalData(context,{...i,datos:{...i.datos,[key]:999}})).rejects.toThrow()
})
it.each(['neto','iva','noGravado','exento','tributos'])('importe %s ausente no se reemplaza por cero',async key=>{
 const i=input();delete (i.datos.importes as unknown as Record<string,unknown>)[key];await expect(prepareFiscalData(context,i)).rejects.toThrow()
})
it('no acepta número de punto por defecto ni metadatos ajenos al DTO público',()=>{
 expect(()=>validateFiscalPreparationContext({...context,punto_venta:undefined})).toThrow()
 expect(()=>validateFiscalPreparationContext({...context,credencial_id:crypto.randomUUID()})).toThrow()
})
it('rechaza condición/IVA fuera del catálogo versionado y clasificación incompatible con emisor',async()=>{
 const i=input();i.datos.condicionIvaReceptor=99;await expect(prepareFiscalData(context,i)).rejects.toThrow()
 i.datos.condicionIvaReceptor=5;i.condicionEmisor='RESPONSABLE_INSCRIPTO';await expect(prepareFiscalData(context,i)).rejects.toThrow()
 i.datos.tipoComprobante=6;i.datos.iva=[{id:8,base:'123.45',importe:'0.00'}];await expect(prepareFiscalData(context,i)).rejects.toThrow()
})
it('envases recibidos requieren criterio fiscal confirmado, sin reducir ni sumar importes por inferencia',async()=>{
 await expect(prepareFiscalData({...context,incluye_recepcion_envases:true},input())).rejects.toThrow('FISCAL_ENVASES_REQUIERE_CRITERIO_CONFIRMADO')
})
it('no redondea importes que no concilian con la venta, fechas inválidas ni IVA de tipo C',async()=>{
 const i=input();i.datos.importes.neto='123.451';await expect(prepareFiscalData(context,i)).rejects.toThrow()
 i.datos.importes.neto='123.45';i.datos.fecha='20260231';await expect(prepareFiscalData(context,i)).rejects.toThrow()
 i.datos.fecha=wsfeSample.fecha;i.datos.importes={...i.datos.importes,neto:'122.45',exento:'1.00'};await expect(prepareFiscalData(context,i)).rejects.toThrow()
})
it('cambio del hash/datos de preparación y numeración inválida no crean cuerpo final',async()=>{
 const p=await prepareFiscalData(context,input())
 await expect(requestFromPreparedFiscalData({...p,sha256:'0'.repeat(64)},1)).rejects.toThrow()
 await expect(requestFromPreparedFiscalData({...p,datos:{...p.datos,fecha:'20261022'}},1)).rejects.toThrow()
 for(const n of [0,1.1,NaN,100000000])await expect(requestFromPreparedFiscalData(p,n)).rejects.toThrow()
})
it('datos guardados se verifican contra su canónico exacto y contexto actual',async()=>{
 const p=await prepareFiscalData(context,input())
 expect(await verifySavedFiscalPreparation(context,p.canonico,p.sha256)).toEqual(p)
 await expect(verifySavedFiscalPreparation({...context,revision_parametros:2},p.canonico,p.sha256)).rejects.toThrow()
 await expect(verifySavedFiscalPreparation(context,p.canonico,'0'.repeat(64))).rejects.toThrow()
 await expect(verifySavedFiscalPreparation(context,' '+p.canonico,p.sha256)).rejects.toThrow()
})
