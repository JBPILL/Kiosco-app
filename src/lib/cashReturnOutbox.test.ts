import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CashReturnOutbox, procesarDevolucionEfectivo } from './cashReturnOutbox'

const id = (n: number) => `df000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const kid=id(1), uid=id(2)
const solicitud = () => ({ version:1,id:id(3),ventaId:id(4),sesionReintegroId:id(5),metodo:'EFECTIVO_CAJA',motivo:'CAMBIO_PRODUCTO',notas:null,items:[{detalleId:id(6),cantidad:1,reingresaStock:true}] })
const ack = () => ({id:id(3),venta_id:id(4),kiosco_id:kid,sesion_caja_id:id(5),monto_total:0.33,detalles:[{detalle_id:id(6),cantidad:1,importe:0.33}],stock:[]})
let outbox: CashReturnOutbox
beforeEach(()=>{outbox=new CashReturnOutbox(`Return-test-${crypto.randomUUID()}`)})
afterEach(async()=>{vi.restoreAllMocks();await outbox.delete()})

it('reintenta el mismo reintegro después de perder respuesta y conserva entrega física pendiente',async()=>{
  const perdido=vi.fn(async()=>{throw new Error('timeout')})
  await expect(procesarDevolucionEfectivo(outbox,kid,uid,solicitud(),perdido)).rejects.toThrow('timeout')
  const nombre=outbox.name;outbox.close();outbox=new CashReturnOutbox(nombre)
  const recuperar=vi.fn(async()=>({data:ack(),error:null}))
  expect(await procesarDevolucionEfectivo(outbox,kid,uid,solicitud(),recuperar)).toEqual(ack())
  expect(perdido.mock.calls[0]).toEqual(recuperar.mock.calls[0])
  expect(await outbox.recuperables(kid,uid)).toHaveLength(1)
  await outbox.confirmarEntregaLocal(id(3),kid,uid)
  expect(await outbox.recuperables(kid,uid)).toHaveLength(0)
})
it.each([
  {monto_total:1}, {sesion_caja_id:id(99)}, {detalles:[{detalle_id:id(6),cantidad:2,importe:0.33}]}, {detalles:[{detalle_id:id(99),cantidad:1,importe:0.33}]},
])('no presenta confirmación con ACK incompatible %j',async cambios=>{
  await expect(procesarDevolucionEfectivo(outbox,kid,uid,solicitud(),async()=>({data:{...ack(),...cambios},error:null}))).rejects.toThrow()
  expect(await outbox.pendientes(kid,uid)).toHaveLength(1)
})
it.each(['CUENTA_CORRIENTE','OTRO'])('no guarda ni envía el método excluido %s',async metodo=>{
  const enviar=vi.fn()
  await expect(procesarDevolucionEfectivo(outbox,kid,uid,{...solicitud(),metodo,sesionReintegroId:null},enviar)).rejects.toThrow('reintegro en efectivo')
  expect(enviar).not.toHaveBeenCalled()
})
