// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { crearHashPinSupervisor } from '../../supabase/functions/_shared/supervisorPinCrypto'
import { verificarPinConLimite } from '../../supabase/functions/_shared/supervisorPinVerification'
const actor = '10000000-0000-0000-0000-000000000001'
const kid = '20000000-0000-0000-0000-000000000001'
const id = '30000000-0000-0000-0000-000000000001'
const pepper = new Uint8Array(32).fill(9)
async function dependencias() {
 const registro = await crearHashPinSupervisor('0042', kid, pepper, '1')
 return { reservar: vi.fn().mockResolvedValue({ estado: 'RESERVADO', id, actor_auth_id: actor, kiosco_id: kid, revision: 1, pin_hash: registro }),
  finalizar: vi.fn(async (_actor: string, _id: string, valido: boolean) => ({ estado: 'FINALIZADO', valido })), obtenerPepper: vi.fn().mockResolvedValue(pepper) }
}
it('reserva antes de comparar y sólo devuelve estado e identidad del intento', async () => {
 const deps = await dependencias()
 expect(await verificarPinConLimite(actor,kid,'0042',deps)).toEqual({ estado: 'VALIDO', intentoId: id })
 expect(deps.finalizar).toHaveBeenCalledWith(actor,id,true)
 expect(deps.obtenerPepper).toHaveBeenCalledWith('1')
})
it('PIN incorrecto registra fallo y no acepta finalización contradictoria', async () => {
 const deps = await dependencias()
 expect(await verificarPinConLimite(actor,kid,'0043',deps)).toEqual({ estado: 'INVALIDO', intentoId: id })
 expect(deps.finalizar).toHaveBeenCalledWith(actor,id,false)
 deps.finalizar.mockResolvedValue({ estado: 'FINALIZADO', valido: true })
 await expect(verificarPinConLimite(actor,kid,'0043',deps)).rejects.toThrow('No se pudo verificar el PIN de supervisor')
})
it('la revisión o caducidad del servidor prevalecen sobre el PIN correcto', async () => {
 const deps = await dependencias(); deps.finalizar.mockResolvedValue({ estado: 'FINALIZADO', valido: false })
 expect((await verificarPinConLimite(actor,kid,'0042',deps)).estado).toBe('INVALIDO')
})
it('un bloqueo no obtiene el pepper ni compara el PIN', async () => {
 const deps = await dependencias(); deps.reservar.mockResolvedValue({ estado: 'BLOQUEADO', reintentar_en: '2026-10-07T12:00:00Z' })
 expect((await verificarPinConLimite(actor,kid,'0042',deps)).estado).toBe('BLOQUEADO')
 expect(deps.obtenerPepper).not.toHaveBeenCalled(); expect(deps.finalizar).not.toHaveBeenCalled()
})
it('fallo del gestor de secretos conserva reserva y oculta detalles internos', async () => {
 const deps = await dependencias(); deps.obtenerPepper.mockRejectedValue(new Error('SECRET_INTERNO'))
 await expect(verificarPinConLimite(actor,kid,'0042',deps)).rejects.toThrow('No se pudo verificar el PIN de supervisor')
 expect(deps.finalizar).not.toHaveBeenCalled()
})
