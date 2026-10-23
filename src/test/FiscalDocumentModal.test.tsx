import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { FiscalDocumentModal } from '../components/pos/FiscalDocumentModal'
import { Modal } from '../components/ui/Modal'
import type { FiscalClient } from '../lib/fiscalClient'
import { wsfeSample } from './fixtures/fiscalWsfe'
const scope={authId:'11111111-1111-4111-8111-111111111111',kioskId:'22222222-2222-4222-8222-222222222222',saleId:'33333333-3333-4333-8333-333333333333'}
const operation='44444444-4444-4444-8444-444444444444',approval='55555555-5555-4555-8555-555555555555'
const empty={venta_id:scope.saleId,estado:'SIN_PREPARACION' as const,operacion_id:null,preparacion_sha256:null,emision_habilitada:false as const}
const saved={...empty,estado:'DATOS_PREPARADOS' as const,operacion_id:operation,preparacion_sha256:'a'.repeat(64)}
function fixture(){
 const resolve=vi.fn<FiscalClient['resolve']>().mockResolvedValue(empty)
 const context=vi.fn<FiscalClient['context']>().mockResolvedValue({version:1,venta_id:scope.saleId,total:'123.45',cuit_emisor:wsfeSample.cuitEmisor,punto_venta:7,incluye_recepcion_envases:false,revision_parametros:1,condiciones:[{id:5,descripcion:'Ensayo',comprobantes:[11]}],alicuotas:[]})
 const review=vi.fn<FiscalClient['review']>().mockResolvedValue({operacion_id:operation,estado:'RESERVADA',revision:1,solicitud:{version:1,solicitud:wsfeSample,sha256:'a'.repeat(64)},aprobacion:null})
 const receipt=vi.fn<FiscalClient['receipt']>().mockRejectedValue(new Error('SYNTHETIC_UNAVAILABLE'))
 const diagnosis=vi.fn<FiscalClient['diagnosis']>().mockResolvedValue({version:1,entorno:'HOMOLOGACION',operacion_id:operation,venta_id:scope.saleId,solicitud_sha256:'a'.repeat(64),estado:'AUTORIZADA',recepcion:null,ultima_consulta:{estado:'AUTORIZACION_COINCIDENTE',codigo:null},puedeReenviar:false})
 const client:FiscalClient={cancelReplacement:vi.fn(),pendingReplacement:vi.fn(()=>null),replace:vi.fn(),retryReplacement:vi.fn(),resolve,context,review,receipt,diagnosis,cancel:vi.fn(async()=>({operacion_id:operation,venta_id:scope.saleId,estado:'CANCELADA' as const,emision_habilitada:false as const})),prepare:vi.fn(async()=>review(operation)),pending:vi.fn(()=>null),save:vi.fn(async()=>saved),approvalId:vi.fn(()=>approval),approve:vi.fn<FiscalClient['approve']>(async()=>({id:approval,operacion_id:operation,solicitud_sha256:'a'.repeat(64),revision:1,aprobada:true,vence_en:new Date(Date.now()+600000).toISOString(),emision_habilitada:false}))}
 return {client,resolve,context,review,diagnosis}
}
it('abre carga explícita desde una venta sin datos fiscales previos',async()=>{
 const f=fixture();render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 await screen.findByRole('form',{name:'Preparación fiscal explícita'})
 expect(f.context).toHaveBeenCalledTimes(1);expect(f.review).not.toHaveBeenCalled()
})
it.each(['REGISTRO_FISCAL_HEREDADO','REQUIERE_REVISION','NO_DISPONIBLE','DATOS_PREPARADOS'] as const)('estado %s no ofrece nueva carga ni factura emitida',async estado=>{
 const f=fixture();f.resolve.mockResolvedValue({...empty,estado})
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 await waitFor(()=>expect(screen.queryByText('Consultando el estado fiscal de la venta…')).toBeNull())
 expect(screen.queryByRole('form')).toBeNull();expect(f.context).not.toHaveBeenCalled();expect(f.client.save).not.toHaveBeenCalled()
})
it('recupera revisión existente y aprueba sin emitir ni cargar un formulario nuevo',async()=>{
 const f=fixture();f.resolve.mockResolvedValue({...saved,estado:'RESERVADA'})
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 fireEvent.click(await screen.findByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Aprobar revisión'}))
 await waitFor(()=>expect(screen.getByText(/todavía no se emitió desde esta pantalla/)).toBeTruthy())
 expect(f.client.approve).toHaveBeenCalledTimes(1);expect(f.context).not.toHaveBeenCalled();expect(f.client.save).not.toHaveBeenCalled()
})
it('ignora respuesta tardía de otra venta al cambiar selección',async()=>{
 const first=fixture(),second=fixture();let resolve!:(value:typeof empty)=>void
 first.resolve.mockReturnValue(new Promise(done=>{resolve=done}))
 second.resolve.mockResolvedValue({...empty,estado:'REGISTRO_FISCAL_HEREDADO'})
 const view=render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={first.client} />)
 await waitFor(()=>expect(first.resolve).toHaveBeenCalledTimes(1))
 view.rerender(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={{...scope,saleId:'66666666-6666-4666-8666-666666666666'}} client={second.client} />)
 await screen.findByText(/Existe un registro fiscal anterior/)
 await act(async()=>resolve(empty))
 expect(screen.queryByRole('form')).toBeNull();expect(first.context).not.toHaveBeenCalled()
})
it('conserva error consultable sin mostrar respuesta privada como éxito',async()=>{
 const f=fixture();f.resolve.mockRejectedValue(new Error('PRIVATE_ERROR'))
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 expect((await screen.findByRole('alert')).textContent).not.toContain('PRIVATE_ERROR')
 expect(screen.queryByRole('form')).toBeNull()
})
it('modales superpuestos conservan su título accesible propio',()=>{
 render(<><Modal isOpen onClose={vi.fn()} title="Historial">Venta</Modal><Modal isOpen onClose={vi.fn()} title="Revisión fiscal">Datos</Modal></>)
 expect(screen.getByRole('dialog',{name:'Historial'})).toBeTruthy();expect(screen.getByRole('dialog',{name:'Revisión fiscal'})).toBeTruthy()
})
it('guardar desde el formulario pasa a datos preparados, sin indicar factura emitida',async()=>{
 const f=fixture();f.resolve.mockResolvedValueOnce(empty).mockResolvedValue(saved)
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 await screen.findByRole('form')
 const change=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}})
 change('Condición fiscal del emisor','MONOTRIBUTO');change('Tipo de comprobante','11');change('Concepto','1');change('Fecha del comprobante','22/10/2026')
 change('Documento del receptor','99');change('Número de documento (cero si corresponde)','0');change('Condición IVA del receptor','5');change('Moneda / cotización','PES');change('Neto','123,45')
 for(const label of ['IVA total','No gravado','Exento','Otros tributos total'])change(label,'0')
 fireEvent.submit(screen.getByRole('form'))
 await screen.findByText(/Todavía falta preparar el cuerpo/)
 expect(f.client.save).toHaveBeenCalledTimes(1);expect(f.client.approve).not.toHaveBeenCalled();expect(screen.queryByRole('form')).toBeNull()
})
it('no pierde el estado autorizado si falla la carga de la constancia',async()=>{
 const f=fixture();f.resolve.mockResolvedValue({...saved,estado:'AUTORIZADA'});f.review.mockRejectedValue(new Error('private'))
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 expect((await screen.findByRole('alert')).textContent).toContain('Se recuperó el estado fiscal')
 expect(screen.getByText(/La operación figura autorizada en el servidor/)).toBeTruthy()
 expect(screen.queryByRole('form')).toBeNull();expect(f.client.save).not.toHaveBeenCalled()
})
it('preparar cuerpo usa la operación original y abre revisión sin aprobar ni emitir',async()=>{
 const f=fixture();f.resolve.mockResolvedValueOnce(saved).mockResolvedValue({...saved,estado:'RESERVADA'})
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 fireEvent.click(await screen.findByRole('button',{name:'Preparar comprobante para revisar'}))
 await screen.findByLabelText('Revisé el receptor, las fechas, los importes y el detalle fiscal de este comprobante.');expect(f.client.prepare).toHaveBeenCalledExactlyOnceWith(operation)
 expect(f.client.approve).not.toHaveBeenCalled();expect(f.client.save).not.toHaveBeenCalled()
})
it('cuerpo sin confirmación conserva estado e identidad para consulta',async()=>{
 const f=fixture();f.resolve.mockResolvedValue(saved);vi.mocked(f.client.prepare).mockRejectedValue(new Error('lost'))
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 fireEvent.click(await screen.findByRole('button',{name:'Preparar comprobante para revisar'}))
 await screen.findByRole('alert');expect(f.client.prepare).toHaveBeenCalledExactlyOnceWith(operation)
 expect(f.client.save).not.toHaveBeenCalled();expect(screen.queryByRole('form')).toBeNull()
})

it('muestra constancia de homologación recuperada sin controles de aprobar ni emitir',async()=>{
 const f=fixture();f.resolve.mockResolvedValue({...saved,estado:'AUTORIZADA'})
 vi.mocked(f.client.receipt).mockResolvedValue({version:1,entorno:'HOMOLOGACION',estado:'AUTORIZADA',operacion_id:operation,venta_id:scope.saleId,solicitud:{version:1,solicitud:wsfeSample,sha256:'a'.repeat(64)},autorizacion:{cae:'11111111111111',vencimiento:'20261031',procesado_en:null}})
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 await screen.findByRole('region',{name:'Constancia fiscal de homologación'})
 expect(screen.getByText('11111111111111')).toBeTruthy();expect(screen.getByText('31/10/2026')).toBeTruthy()
 expect(screen.getByText(/sin validez fiscal/)).toBeTruthy();expect(screen.getByText('No informadas')).toBeTruthy()
 expect(f.client.receipt).toHaveBeenCalledExactlyOnceWith(operation);expect(f.review).not.toHaveBeenCalled()
 expect(screen.queryByRole('checkbox')).toBeNull();expect(screen.queryByRole('form')).toBeNull();expect(f.client.approve).not.toHaveBeenCalled()
})
it('constancia tardía no aparece al seleccionar otra venta',async()=>{
 const first=fixture(),second=fixture();first.resolve.mockResolvedValue({...saved,estado:'AUTORIZADA'})
 let finish!:(value:Awaited<ReturnType<FiscalClient['receipt']>>)=>void
 vi.mocked(first.client.receipt).mockReturnValue(new Promise(done=>{finish=done}))
 const view=render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={first.client} />)
 await waitFor(()=>expect(first.client.receipt).toHaveBeenCalledTimes(1))
 view.rerender(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={{...scope,saleId:'66666666-6666-4666-8666-666666666666'}} client={second.client} />)
 await screen.findByRole('form')
 await act(async()=>finish({version:1,entorno:'HOMOLOGACION',estado:'AUTORIZADA',operacion_id:operation,venta_id:scope.saleId,solicitud:{version:1,solicitud:wsfeSample,sha256:'a'.repeat(64)},autorizacion:{cae:'11111111111111',vencimiento:'20261031',procesado_en:null}}))
 expect(screen.queryByText('11111111111111')).toBeNull()
})

function uncertain(f:ReturnType<typeof fixture>){
 f.resolve.mockResolvedValue({...saved,estado:'ENVIO_INCIERTO'});f.review.mockResolvedValue({operacion_id:operation,estado:'ENVIO_INCIERTO',revision:1,solicitud:{version:1,solicitud:wsfeSample,sha256:'a'.repeat(64)},aprobacion:null})
 f.diagnosis.mockResolvedValue({version:1,entorno:'HOMOLOGACION',operacion_id:operation,venta_id:scope.saleId,solicitud_sha256:'a'.repeat(64),estado:'ENVIO_INCIERTO',recepcion:{estado:'RECHAZO_RECIBIDO',codigos:[10017],puedeReenviar:false},ultima_consulta:{estado:'CONCILIAR',codigo:'SIN_CONFIRMACION'},puedeReenviar:false})
}
it('muestra rechazo recibido y consulta no confirmada sin aprobar, reenviar ni preparar',async()=>{
 const f=fixture();uncertain(f)
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 await screen.findByRole('region',{name:'Diagnóstico fiscal'});expect(screen.getByText(/Se recibió un rechazo/)).toBeTruthy();expect(screen.getByText('10017')).toBeTruthy()
 expect(screen.getByText('La consulta no confirmó la autorización.')).toBeTruthy();expect(screen.queryByRole('checkbox')).toBeNull();expect(screen.queryByRole('form')).toBeNull()
 expect(f.client.approve).not.toHaveBeenCalled();expect(f.client.prepare).not.toHaveBeenCalled();expect(f.client.save).not.toHaveBeenCalled()
})
it('falta de recepción no se presenta como rechazo',async()=>{
 const f=fixture();uncertain(f);f.diagnosis.mockResolvedValue({...await f.diagnosis(operation),recepcion:null,ultima_consulta:null});f.diagnosis.mockClear()
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 await screen.findByText('No hay una respuesta de emisión registrada. Eso no confirma un rechazo.');expect(screen.queryByText(/Se recibió un rechazo/)).toBeNull()
})
it('fallo de diagnóstico no oculta constancia autorizada ni muestra error privado',async()=>{
 const f=fixture();f.resolve.mockResolvedValue({...saved,estado:'AUTORIZADA'});f.diagnosis.mockRejectedValue(new Error('PRIVATE_SENTINEL'))
 vi.mocked(f.client.receipt).mockResolvedValue({version:1,entorno:'HOMOLOGACION',estado:'AUTORIZADA',operacion_id:operation,venta_id:scope.saleId,solicitud:{version:1,solicitud:wsfeSample,sha256:'a'.repeat(64)},autorizacion:{cae:'11111111111111',vencimiento:'20261031',procesado_en:null}})
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 await screen.findByRole('region',{name:'Constancia fiscal de homologación'});expect((await screen.findByRole('alert')).textContent).not.toContain('PRIVATE_SENTINEL')
 expect(screen.queryByRole('form')).toBeNull()
})
it('diagnóstico atrasado no revierte autorización a estado incierto',async()=>{
 const f=fixture();uncertain(f);f.resolve.mockResolvedValue({...saved,estado:'AUTORIZADA'})
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 await screen.findByText(/La operación figura autorizada en el servidor/);expect(screen.queryByRole('checkbox')).toBeNull();expect(screen.queryByRole('region',{name:'Diagnóstico fiscal'})).toBeNull()
})
it('hash de diagnóstico distinto no muestra controles de revisión',async()=>{
 const f=fixture();uncertain(f);f.diagnosis.mockResolvedValue({...await f.diagnosis(operation),solicitud_sha256:'b'.repeat(64)});f.diagnosis.mockClear()
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 await screen.findByRole('alert');expect(screen.queryByRole('checkbox')).toBeNull()
})
it('diagnóstico tardío no aparece en otra venta',async()=>{
 const first=fixture(),second=fixture();uncertain(first)
 let finish!:(value:Awaited<ReturnType<FiscalClient['diagnosis']>>)=>void
 const value=await first.diagnosis(operation);first.diagnosis.mockClear();first.diagnosis.mockReturnValue(new Promise(done=>{finish=done}))
 const view=render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={first.client} />)
 await waitFor(()=>expect(first.diagnosis).toHaveBeenCalledTimes(1))
 view.rerender(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={{...scope,saleId:'66666666-6666-4666-8666-666666666666'}} client={second.client} />)
 await screen.findByRole('form');await act(async()=>finish(value));expect(screen.queryByRole('region',{name:'Diagnóstico fiscal'})).toBeNull()
})

it('aprobación recibida no se presenta como autorización conciliada',async()=>{
 const f=fixture();uncertain(f);f.diagnosis.mockResolvedValue({...await f.diagnosis(operation),recepcion:{estado:'APROBACION_RECIBIDA',codigos:[],puedeReenviar:false}});f.diagnosis.mockClear()
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 await screen.findByText('Se recibió una aprobación, pero aún falta confirmar la autorización mediante conciliación.')
 expect(screen.queryByRole('region',{name:'Constancia fiscal de homologación'})).toBeNull();expect(screen.queryByRole('checkbox')).toBeNull()
})
it('autorización confirmada durante el diagnóstico recupera constancia sin abrir revisión',async()=>{
 const f=fixture();f.resolve.mockResolvedValue({...saved,estado:'ENVIO_INCIERTO'})
 vi.mocked(f.client.receipt).mockResolvedValue({version:1,entorno:'HOMOLOGACION',estado:'AUTORIZADA',operacion_id:operation,venta_id:scope.saleId,solicitud:{version:1,solicitud:wsfeSample,sha256:'a'.repeat(64)},autorizacion:{cae:'11111111111111',vencimiento:'20261031',procesado_en:null}})
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 await screen.findByRole('region',{name:'Constancia fiscal de homologación'});expect(f.review).not.toHaveBeenCalled();expect(screen.queryByRole('checkbox')).toBeNull()
})
it('revisión reservada obsoleta no habilita aprobación de un envío incierto',async()=>{
 const f=fixture();uncertain(f);f.review.mockResolvedValue({...await f.review(operation),estado:'RESERVADA'});f.review.mockClear()
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 await screen.findByRole('alert');expect(screen.queryByRole('checkbox')).toBeNull();expect(f.client.approve).not.toHaveBeenCalled()
})

it('cancelar exige confirmación explícita, conserva UUID y vuelve al formulario tras cierre confirmado',async()=>{
 const f=fixture();f.resolve.mockResolvedValueOnce(saved).mockResolvedValue(empty)
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 const button=await screen.findByRole('button',{name:'Cancelar preparación sin número'});expect(button.hasAttribute('disabled')).toBe(true)
 fireEvent.click(screen.getByLabelText('Confirmo que quiero cerrar este intento y cargar otra preparación.'));fireEvent.click(button)
 await screen.findByRole('form');expect(f.client.cancel).toHaveBeenCalledExactlyOnceWith(operation);expect(f.client.prepare).not.toHaveBeenCalled();expect(f.client.approve).not.toHaveBeenCalled()
})
it('cancelación incierta conserva intento y no abre otro formulario',async()=>{
 const f=fixture();f.resolve.mockResolvedValue(saved);vi.mocked(f.client.cancel).mockRejectedValue(new Error('PRIVATE_SENTINEL'))
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 fireEvent.click(await screen.findByLabelText('Confirmo que quiero cerrar este intento y cargar otra preparación.'));fireEvent.click(screen.getByRole('button',{name:'Cancelar preparación sin número'}))
 expect((await screen.findByRole('alert')).textContent).not.toContain('PRIVATE_SENTINEL');expect(screen.queryByRole('form')).toBeNull();expect(f.client.cancel).toHaveBeenCalledExactlyOnceWith(operation)
})
it('guardado pendiente local puede cancelarse con su UUID original',async()=>{
 const f=fixture();vi.mocked(f.client.pending).mockReturnValueOnce({version:1,operationId:operation,input:null}).mockReturnValue(null)
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 fireEvent.click(await screen.findByLabelText('Confirmo que quiero cerrar este intento y cargar otra preparación.'));fireEvent.click(screen.getByRole('button',{name:'Cancelar preparación sin número'}))
 await screen.findByRole('form');expect(f.client.cancel).toHaveBeenCalledExactlyOnceWith(operation)
})
it.each(['RESERVADA','ENVIO_INCIERTO','AUTORIZADA'] as const)('estado %s no ofrece cancelación sin número',async estado=>{
 const f=fixture();if(estado==='ENVIO_INCIERTO')uncertain(f);else f.resolve.mockResolvedValue({...saved,estado})
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 await waitFor(()=>expect(screen.queryByText('Consultando el estado fiscal de la venta…')).toBeNull())
 expect(screen.queryByRole('button',{name:'Cancelar preparación sin número'})).toBeNull();expect(f.client.cancel).not.toHaveBeenCalled()
})
it('respuesta tardía de cancelación no cambia otra venta',async()=>{
 const first=fixture(),second=fixture();first.resolve.mockResolvedValue(saved)
 let finish!:(value:Awaited<ReturnType<FiscalClient['cancel']>>)=>void
 vi.mocked(first.client.cancel).mockReturnValue(new Promise(done=>{finish=done}))
 const view=render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={first.client} />)
 fireEvent.click(await screen.findByLabelText('Confirmo que quiero cerrar este intento y cargar otra preparación.'));fireEvent.click(screen.getByRole('button',{name:'Cancelar preparación sin número'}))
 view.rerender(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={{...scope,saleId:'66666666-6666-4666-8666-666666666666'}} client={second.client} />)
 await screen.findByRole('form');await act(async()=>finish({operacion_id:operation,venta_id:scope.saleId,estado:'CANCELADA',emision_habilitada:false}))
 expect(first.resolve).toHaveBeenCalledTimes(1);expect(screen.queryByRole('button',{name:'Cancelar preparación sin número'})).toBeNull()
})



function fillCorrection(){
 const change=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}})
 change('Condición fiscal del emisor','MONOTRIBUTO');change('Tipo de comprobante','11');change('Concepto','1');change('Fecha del comprobante','23/10/2026')
 change('Documento del receptor','99');change('Número de documento (cero si corresponde)','0');change('Condición IVA del receptor','5');change('Moneda / cotización','PES');change('Neto','123,45')
 for(const label of ['IVA total','No gravado','Exento','Otros tributos total'])change(label,'0')
}
it('corrección exige confirmación, formulario sin defaults y nueva revisión sin aprobar la anterior',async()=>{
 const f=fixture(),next='77777777-7777-4777-8777-777777777777';f.resolve.mockResolvedValue({...saved,estado:'RESERVADA'})
 vi.mocked(f.client.replace).mockImplementation(async()=>{
  f.resolve.mockResolvedValue({...saved,estado:'RESERVADA',operacion_id:next});f.review.mockResolvedValue({operacion_id:next,estado:'RESERVADA',revision:1,solicitud:{version:1,solicitud:wsfeSample,sha256:'b'.repeat(64)},aprobacion:null})
  return {operacion_id:operation,sucesora_id:next,venta_id:scope.saleId,anterior_sha256:'a'.repeat(64),preparacion_sha256:'c'.repeat(64),sucesora_sha256:'b'.repeat(64),numero:1,estado:'SUSTITUIDA',emision_habilitada:false}
 })
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 fireEvent.click(await screen.findByRole('button',{name:'Corregir datos conservando el número'}));await screen.findByRole('form')
 expect(screen.queryByRole('button',{name:'Aprobar revisión'})).toBeNull()
 expect((screen.getByLabelText('Condición fiscal del emisor') as HTMLSelectElement).value).toBe('')
 fillCorrection();fireEvent.submit(screen.getByRole('form'));expect(f.client.replace).not.toHaveBeenCalled()
 fireEvent.click(screen.getByLabelText('Confirmo que quiero sustituir esta preparación conservando su número.'))
 fireEvent.submit(screen.getByRole('form'))
 await waitFor(()=>expect(f.review).toHaveBeenLastCalledWith(next))
 expect(f.client.replace).toHaveBeenCalledTimes(1);expect(f.client.save).not.toHaveBeenCalled();expect(f.client.approve).not.toHaveBeenCalled();expect(f.client.prepare).not.toHaveBeenCalled()
 await screen.findByRole('button',{name:'Aprobar revisión'});expect(screen.queryByRole('form')).toBeNull()
})
function pendingCorrection(){return {version:1 as const,operationId:operation,successorId:'77777777-7777-4777-8777-777777777777',previousHash:'a'.repeat(64),numero:1,proposal:{canonico:'SYNTHETIC_PENDING_VALIDATED_BY_CLIENT',sha256:'c'.repeat(64)}}}
it('pendiente al reabrir oculta aprobación y permite sólo reintentar o descartar la misma propuesta',async()=>{
 const f=fixture();f.resolve.mockResolvedValue({...saved,estado:'RESERVADA'});vi.mocked(f.client.pendingReplacement).mockReturnValue(pendingCorrection())
 vi.mocked(f.client.retryReplacement).mockImplementation(async()=>{throw new Error('PRIVATE_DETAIL')})
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 const retry=await screen.findByRole('button',{name:'Reintentar corrección guardada'});expect(f.review).not.toHaveBeenCalled();expect(f.context).not.toHaveBeenCalled();expect(screen.queryByRole('form')).toBeNull()
 expect(screen.queryByRole('button',{name:'Aprobar revisión'})).toBeNull()
 fireEvent.click(retry);await waitFor(()=>expect(f.client.retryReplacement).toHaveBeenCalledTimes(1))
 expect((await screen.findByRole('alert')).textContent).not.toContain('PRIVATE_DETAIL');expect(screen.getByRole('button',{name:'Reintentar corrección guardada'})).toBeTruthy()
})
it('descarte de propuesta requiere confirmación y conserva revisión del número original',async()=>{
 const f=fixture();f.resolve.mockResolvedValue({...saved,estado:'RESERVADA'});vi.mocked(f.client.pendingReplacement).mockReturnValue(pendingCorrection())
 vi.mocked(f.client.cancelReplacement).mockImplementation(async()=>{vi.mocked(f.client.pendingReplacement).mockReturnValue(null);return 'DESCARTADA'})
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 const discard=await screen.findByRole('button',{name:'Descartar propuesta no confirmada'});expect((discard as HTMLButtonElement).disabled).toBe(true)
 fireEvent.click(screen.getByLabelText('Quiero descartar sólo la propuesta no confirmada.'));fireEvent.click(discard)
 await screen.findByRole('button',{name:'Aprobar revisión'});expect(f.client.cancelReplacement).toHaveBeenCalledTimes(1);expect(f.client.cancel).not.toHaveBeenCalled();expect(f.client.save).not.toHaveBeenCalled()
})
it('contexto de corrección tardío no abre formulario en otra venta',async()=>{
 const first=fixture(),second=fixture();first.resolve.mockResolvedValue({...saved,estado:'RESERVADA'})
 let done!:(value:Awaited<ReturnType<FiscalClient['context']>>)=>void;first.context.mockReturnValue(new Promise(resolve=>{done=resolve}))
 second.resolve.mockResolvedValue({...empty,estado:'REGISTRO_FISCAL_HEREDADO'})
 const view=render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={first.client} />)
 fireEvent.click(await screen.findByRole('button',{name:'Corregir datos conservando el número'}));await waitFor(()=>expect(first.context).toHaveBeenCalledTimes(1))
 view.rerender(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={{...scope,saleId:'66666666-6666-4666-8666-666666666666'}} client={second.client} />)
 await screen.findByText(/Existe un registro fiscal anterior/)
 await act(async()=>done({version:1,venta_id:scope.saleId,total:'123.45',cuit_emisor:wsfeSample.cuitEmisor,punto_venta:7,incluye_recepcion_envases:false,revision_parametros:1,condiciones:[],alicuotas:[]}))
 expect(screen.queryByRole('form')).toBeNull();expect(first.client.replace).not.toHaveBeenCalled()
})
it('reintento de corrección tardío no reemplaza la pantalla de otra venta',async()=>{
 const first=fixture(),second=fixture();first.resolve.mockResolvedValue({...saved,estado:'RESERVADA'});vi.mocked(first.client.pendingReplacement).mockReturnValue(pendingCorrection())
 let done!:(value:Awaited<ReturnType<FiscalClient['retryReplacement']>>)=>void;vi.mocked(first.client.retryReplacement).mockReturnValue(new Promise(resolve=>{done=resolve}))
 second.resolve.mockResolvedValue({...empty,estado:'REGISTRO_FISCAL_HEREDADO'})
 const view=render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={first.client} />)
 fireEvent.click(await screen.findByRole('button',{name:'Reintentar corrección guardada'}));await waitFor(()=>expect(first.client.retryReplacement).toHaveBeenCalledTimes(1))
 view.rerender(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={{...scope,saleId:'66666666-6666-4666-8666-666666666666'}} client={second.client} />)
 await screen.findByText(/Existe un registro fiscal anterior/)
 await act(async()=>done({operacion_id:operation,sucesora_id:pendingCorrection().successorId,venta_id:scope.saleId,anterior_sha256:'a'.repeat(64),preparacion_sha256:'c'.repeat(64),sucesora_sha256:'b'.repeat(64),numero:1,estado:'SUSTITUIDA',emision_habilitada:false}))
 expect(first.resolve).toHaveBeenCalledTimes(1);expect(screen.queryByRole('form')).toBeNull();expect(screen.queryByRole('button',{name:'Aprobar revisión'})).toBeNull()
})
it('error de resolución conserva acceso a recuperar/descartar una propuesta local',async()=>{
 const f=fixture();f.resolve.mockRejectedValue(new Error('PRIVATE_NETWORK'));vi.mocked(f.client.pendingReplacement).mockReturnValue(pendingCorrection())
 render(<FiscalDocumentModal isOpen onClose={vi.fn()} scope={scope} client={f.client} />)
 expect(await screen.findByRole('button',{name:'Reintentar corrección guardada'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Aprobar revisión'})).toBeNull()
 expect((await screen.findByRole('alert')).textContent).not.toContain('PRIVATE_NETWORK');expect(f.context).not.toHaveBeenCalled();expect(f.review).not.toHaveBeenCalled()
})
