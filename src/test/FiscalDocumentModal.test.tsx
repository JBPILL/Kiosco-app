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
 const client:FiscalClient={resolve,context,review,pending:vi.fn(()=>null),save:vi.fn(async()=>saved),approvalId:vi.fn(()=>approval),approve:vi.fn<FiscalClient['approve']>(async()=>({id:approval,operacion_id:operation,solicitud_sha256:'a'.repeat(64),revision:1,aprobada:true,vence_en:new Date(Date.now()+600000).toISOString(),emision_habilitada:false}))}
 return {client,resolve,context,review}
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
