import { act,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { it,expect,vi } from 'vitest'
import { FiscalCreditCommercialPanel } from '../components/pos/FiscalCreditCommercialPanel'
import type { FiscalCreditClient } from '../lib/fiscalCreditClient'
import type { FiscalCreditCommercialApplication } from '../../supabase/functions/_shared/fiscalCreditCommercialApplication'
function fixture(){
 const kioskId=crypto.randomUUID(),cash={id:crypto.randomUUID(),kiosco_id:kioskId,estado:'ABIERTA' as const},target={saleId:crypto.randomUUID(),operationId:crypto.randomUUID(),requestId:crypto.randomUUID(),sha256:'a'.repeat(64)}
 const value:FiscalCreditCommercialApplication={version:1,estado:'APLICACION_NC_REGISTRADA',id:target.requestId,venta_id:target.saleId,operacion_origen_id:target.operationId,solicitud_sha256:'b'.repeat(64),kiosco_id:kioskId,sesion_caja_id:cash.id,importe:'100.00',detalles:[{detalle_id:crypto.randomUUID(),producto_id:crypto.randomUUID(),tipo:'PRODUCTO',cantidad:'1.000',importe:'100.00',reingresa_stock:false}],stock:[],emision_habilitada:false,nuevo_reintegro:false}
 let pending:ReturnType<FiscalCreditClient['commercial']['pending']>=null
 const client={pending:vi.fn(()=>pending),status:vi.fn<FiscalCreditClient['commercial']['status']>(async()=>null),apply:vi.fn<FiscalCreditClient['commercial']['apply']>(async()=>value),recover:vi.fn<FiscalCreditClient['commercial']['recover']>(async()=>{pending=null;return value}),retry:vi.fn<FiscalCreditClient['commercial']['retry']>(async()=>{pending=null;return value})}
 const setPending=()=>{pending={version:1,operationId:target.operationId,requestId:target.requestId,sha256:target.sha256,cashId:cash.id}}
 const onRecorded=vi.fn(),props={client,target,kioskId,amount:'100.00',restocks:false,cash,onRecorded}
 const consult=async()=>{fireEvent.click(screen.getByRole('button',{name:'Consultar devolución registrada'}));await screen.findByText(/No hay una devolución registrada/)}
 return{client,target,cash,value,props,setPending,onRecorded,consult}
}
it('panel052 no consulta ni aplica al montar; lectura vacía no acredita CAE y exige confirmación',async()=>{
 const f=fixture();render(<FiscalCreditCommercialPanel {...f.props}/>);expect(f.client.status).not.toHaveBeenCalled();expect(f.client.apply).not.toHaveBeenCalled();expect(screen.queryByRole('checkbox')).toBeNull()
 await f.consult();expect(screen.getByText(/no acredita por sí solo una NC autorizada/)).toBeTruthy();const button=screen.getByRole('button',{name:'Solicitar registro de devolución'});expect(button.hasAttribute('disabled')).toBe(true)
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(button);await screen.findByText(/Devolución registrada:.*100,00/);expect(f.client.apply).toHaveBeenCalledExactlyOnceWith(f.target,f.cash.id);expect(f.onRecorded).toHaveBeenCalledTimes(1);expect(screen.queryByRole('button',{name:'Solicitar registro de devolución'})).toBeNull()
})
it.each(['sin-caja','cerrada','ajena'])('panel052 no solicita aplicación con caja %s',async kind=>{
 const f=fixture(),cash=kind==='sin-caja'?null:{...f.cash,...(kind==='cerrada'?{estado:'CERRADA' as const}:{kiosco_id:crypto.randomUUID()})};render(<FiscalCreditCommercialPanel {...f.props} cash={cash}/>);await f.consult();fireEvent.click(screen.getByRole('checkbox'));expect(screen.getByRole('button',{name:'Solicitar registro de devolución'}).hasAttribute('disabled')).toBe(true);expect(f.client.apply).not.toHaveBeenCalled()
})
it('panel052 fallo conserva pendiente, no hace retry automático y pide confirmar de nuevo',async()=>{
 const f=fixture();f.client.apply.mockImplementation(async()=>{f.setPending();throw new Error('ACK_LOST')});render(<FiscalCreditCommercialPanel {...f.props}/>);await f.consult();fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Solicitar registro de devolución'}));await screen.findByRole('alert');expect(f.client.retry).not.toHaveBeenCalled();expect(f.onRecorded).not.toHaveBeenCalled()
 expect(screen.getByRole('button',{name:'Reintentar aplicación original'}).hasAttribute('disabled')).toBe(true);fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Reintentar aplicación original'}));await screen.findByText(/Devolución registrada:.*100,00/);expect(f.client.retry).toHaveBeenCalledTimes(1);expect(f.client.apply).toHaveBeenCalledTimes(1)
})
it('panel052 recupera pendiente original sin caja actual ni nueva escritura',async()=>{
 const f=fixture();f.setPending();render(<FiscalCreditCommercialPanel {...f.props} cash={null}/>);fireEvent.click(screen.getByRole('button',{name:'Recuperar aplicación pendiente'}));await screen.findByText(/Devolución registrada:.*100,00/);expect(f.client.recover).toHaveBeenCalledTimes(1);expect(f.client.apply).not.toHaveBeenCalled();expect(f.client.retry).not.toHaveBeenCalled()
})
it('panel052 doble clic no duplica solicitud y respuesta tardía no afecta otro caso',async()=>{
 const f=fixture();let release:((v:FiscalCreditCommercialApplication)=>void)|undefined;f.client.apply.mockImplementation(()=>new Promise(resolve=>{release=resolve}));const view=render(<FiscalCreditCommercialPanel {...f.props}/>);await f.consult();fireEvent.click(screen.getByRole('checkbox'));const button=screen.getByRole('button',{name:'Solicitar registro de devolución'});fireEvent.click(button);fireEvent.click(button);expect(f.client.apply).toHaveBeenCalledTimes(1)
 view.rerender(<FiscalCreditCommercialPanel {...f.props} target={{...f.target,requestId:crypto.randomUUID()}}/>);await act(async()=>release?.(f.value));expect(f.onRecorded).not.toHaveBeenCalled();expect(screen.queryByText(/Devolución registrada:/)).toBeNull()
})
it('panel052 importe distinto no se muestra como devolución confirmada',async()=>{
 const f=fixture();f.client.status.mockResolvedValue({...f.value,importe:'999.00'});render(<FiscalCreditCommercialPanel {...f.props}/>);fireEvent.click(screen.getByRole('button',{name:'Consultar devolución registrada'}));await waitFor(()=>expect(screen.getByRole('alert')).toBeTruthy());expect(f.onRecorded).not.toHaveBeenCalled();expect(screen.queryByText(/Devolución registrada:/)).toBeNull()
})

it('panel052 pendiente ilegible bloquea escrituras aunque una consulta devuelva null',async()=>{
 const f=fixture();f.client.pending.mockImplementation(()=>{throw new Error('STORAGE_CORRUPT')});render(<FiscalCreditCommercialPanel {...f.props}/>);await screen.findByRole('alert');await f.consult();expect(screen.getByRole('button',{name:'Solicitar registro de devolución'}).hasAttribute('disabled')).toBe(true);expect(screen.getByRole('checkbox').hasAttribute('disabled')).toBe(true);expect(f.client.apply).not.toHaveBeenCalled()
})