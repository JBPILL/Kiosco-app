// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { autorizarDescuentoConPin } from '../../supabase/functions/_shared/supervisorDiscountAuthorization'
import { crearHashPinSupervisor } from '../../supabase/functions/_shared/supervisorPinCrypto'
const actor = '10000000-0000-0000-0000-000000000001'
const kid = '20000000-0000-0000-0000-000000000001'
const id = '30000000-0000-0000-0000-000000000001'
const pepper = new Uint8Array(32).fill(11)
function entrada() {
 return { version: 1, checkoutId: id, kioscoId: kid, usuarioId: actor, sesionCajaId: kid,
 fechaHora: '2026-10-07T12:00:00.000Z', clienteId: null, notas: null, tipoAjuste: 'DESCUENTO_PORCENTAJE', valorAjuste: 20,
 totalEsperado: 80, subtotalesEsperados: [80], componentesEsperados: [],
 lineas: [{ tipo: 'PRODUCTO', id: actor, productoId: kid, cantidad: 1, sinEnvase: false }],
 pagos: [{ id: kid, medio: 'EFECTIVO', montoCentavos: 8000, referencia: null }] }
}
async function dependencias() {
 return { reservarOperacion: vi.fn().mockResolvedValue({ estado: 'RESERVADO', id, actor_auth_id: actor, kiosco_id: kid, revision: 1, pin_hash: await crearHashPinSupervisor('0042',kid,pepper,'1') }),
 obtenerPepper: vi.fn().mockResolvedValue(pepper), finalizar: vi.fn(async (_actor: string,_id: string,valido: boolean) => ({ estado: 'FINALIZADO', valido })),
 emitir: vi.fn().mockResolvedValue({ autorizacion_id: id, vence_en: new Date(Date.now()+120000).toISOString() }) }
}
it('reserva el cuerpo comercial antes de verificar y devuelve sólo permiso y plazo', async () => {
 const deps = await dependencias()
 expect(await autorizarDescuentoConPin(actor,entrada(),'0042',deps)).toMatchObject({ estado: 'AUTORIZADO', autorizacionId: id })
 expect(deps.reservarOperacion).toHaveBeenCalledWith(actor,'DESCUENTO',entrada())
 expect(deps.emitir).toHaveBeenCalledWith(actor,id)
})
it('un PIN inválido no emite permisos', async () => {
 const deps = await dependencias()
 expect((await autorizarDescuentoConPin(actor,entrada(),'0043',deps)).estado).toBe('INVALIDO')
 expect(deps.emitir).not.toHaveBeenCalled()
})
it('rechaza emisión incompleta o vencida sin divulgar errores del servidor', async () => {
 const deps = await dependencias(); deps.emitir.mockResolvedValue({ autorizacion_id: id, vence_en: '2000-01-01T12:00:00Z' })
 await expect(autorizarDescuentoConPin(actor,entrada(),'0042',deps)).rejects.toThrow('Autorización sin confirmar')
})
