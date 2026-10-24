import type { FiscalRpc } from './fiscalPersistence.ts'
import type { FiscalTicketKeys } from './fiscalSharedTickets.ts'
import type { WsaaTicketEnvelope, PrivateWsaaTicket } from './fiscalTicketCache.ts'
import type { FiscalCreditNumberBinding } from './fiscalCreditNumberSource.ts'
import { validateFiscalCreditNumberBinding } from './fiscalCreditNumberSource.ts'
import { encryptFiscalTicket, decryptFiscalTicket, validateFiscalTicketKey } from './fiscalTicketCipher.ts'
import type { FiscalTicketCipherContext } from './fiscalTicketCipher.ts'
import { fiscalUuid, fiscalSha } from './fiscalReplacement.ts'

export type GuardedCreditWsaaTicketLoader = (binding: Readonly<FiscalCreditNumberBinding>, signal: AbortSignal, beforeSend: () => Promise<void>) => Promise<WsaaTicketEnvelope>
export type CreditWsaaTicketLoader = (binding: Readonly<FiscalCreditNumberBinding>, signal: AbortSignal) => Promise<WsaaTicketEnvelope>
const fail = (): never => { throw new Error('FISCAL_TICKET_NC_NO_CONFIRMADO') }
function object(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail()
  const value = input as Record<string, unknown>
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) return fail()
  return value
}
function envelope(b: Readonly<FiscalCreditNumberBinding>, ticket: PrivateWsaaTicket): WsaaTicketEnvelope {
  const value: WsaaTicketEnvelope = { entorno: 'HOMOLOGACION', servicio: 'wsfe', cuitEmisor: b.cuit_emisor, credencialId: b.credencial_id,
    certificadoSha256: b.certificado_sha256, expiresAt: ticket.expiresAt, token: ticket.token, sign: ticket.sign }
  Object.defineProperties(value, { token: { enumerable: false, writable: false }, sign: { enumerable: false, writable: false },
    toString: { value: () => '[Ticket WSAA NC privado]', enumerable: false } })
  return Object.freeze(value)
}
/** Después de Auth/fuente038. Guard obligatorio antes de uso de claves/envío;
 * SQL039 conserva propiedad/exclusión. No hereda operación/permiso de factura. */
export function createSharedFiscalCreditTicketLoader(db: FiscalRpc, keys: FiscalTicketKeys, wsaa: GuardedCreditWsaaTicketLoader, beforeUse: () => Promise<void>): CreditWsaaTicketLoader {
  return async (input, signal) => {
    let cancelPrepared: (() => Promise<void>) | undefined, sendAttempted = false
    try {
      const binding = validateFiscalCreditNumberBinding(structuredClone(input)), id = crypto.randomUUID()
      if (typeof beforeUse !== 'function' || signal.aborted) return fail()
      const guard = async () => { if (signal.aborted) return fail(); await beforeUse(); if (signal.aborted) return fail() }
      const args = { p_actor: binding.actor_auth_id, p_venta: binding.venta_id, p_operacion: binding.operacion_origen_id, p_caso: binding.solicitud_id,
        p_sha: binding.propuesta_sha256, p_preparacion_sha: binding.preparacion_sha256, p_binding: binding }
      const context: FiscalTicketCipherContext = { projectRef: 'acoyfwwmhaeruciyedri', entorno: 'HOMOLOGACION', servicio: 'wsfe', certificadoSha256: binding.certificado_sha256 }
      const call = async (action: string, generation: unknown = null, cipher: unknown = null) => {
        const result = await db.rpc('coordinar_ta_nc_homologacion', { ...args, p_accion: action, p_intento: action === 'ESTADO' ? null : id, p_generacion: generation, p_cifrado: cipher })
        if (result.error) return fail()
        return result.data
      }
      await guard()
      const raw = await call('SOLICITAR')
      if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'estado' in raw && raw.estado === 'DISPONIBLE') {
        const grant = object(raw, ['estado', 'nuevo_intento', 'cifrado'])
        if (grant.nuevo_intento !== false) return fail()
        const cipher = object(grant.cifrado, ['version', 'keyId', 'nonce', 'ciphertext', 'expiresAt'])
        if (!fiscalUuid(cipher.keyId)) return fail()
        await guard()
        const key = await keys.read(cipher.keyId), ticket = await decryptFiscalTicket(cipher, context, key, cipher.keyId)
        await guard()
        return envelope(binding, ticket)
      }
      const grant = object(raw, ['estado', 'nuevo_intento', 'intento_id', 'revision'])
      if (grant.estado !== 'RENOVAR' || grant.nuevo_intento !== true || grant.intento_id !== id || typeof grant.revision !== 'number' || !Number.isSafeInteger(grant.revision) || grant.revision < 1) return fail()
      cancelPrepared = async () => {
        const ack = object(await call('CANCELAR', grant.revision), ['estado', 'intento_id', 'revision'])
        if (ack.estado !== 'CANCELADA' || ack.intento_id !== id || ack.revision !== grant.revision) return fail()
      }
      await guard()
      const key = await keys.active(); validateFiscalTicketKey(context, key.key, key.id)
      await guard()
      let authorized = false
      const ticket = await wsaa(binding, signal, async () => {
        await guard()
        if (sendAttempted) return fail()
        // Antes de RPC: un ACK perdido nunca habilita cancelación/reintento.
        sendAttempted = true
        const ack = object(await call('INICIAR', grant.revision), ['estado', 'nuevo_envio', 'intento_id', 'revision'])
        if (ack.estado !== 'ENVIO_INCIERTO' || ack.nuevo_envio !== true || ack.intento_id !== id || ack.revision !== grant.revision) return fail()
        authorized = true
      })
      if (!authorized || !Number.isSafeInteger(ticket.expiresAt) || ticket.expiresAt <= Date.now() || ticket.expiresAt > Date.now() + 43260000
        || ticket.entorno !== binding.entorno || ticket.servicio !== binding.servicio || ticket.cuitEmisor !== binding.cuit_emisor
        || ticket.credencialId !== binding.credencial_id || ticket.certificadoSha256 !== binding.certificado_sha256) return fail()
      // Si el TA llegó tras abortar al consumidor, conservarlo evita renovarlo.
      const cipher = await encryptFiscalTicket(ticket, context, key.key, key.id)
      const saved = object(await call('CONFIRMAR', grant.revision, cipher), ['estado', 'intento_id', 'revision', 'cifrado_sha256'])
      if (saved.estado !== 'DISPONIBLE' || saved.intento_id !== id || saved.revision !== grant.revision || !fiscalSha(saved.cifrado_sha256)) return fail()
      if (signal.aborted) return fail()
      return envelope(binding, ticket)
    } catch {
      if (cancelPrepared && !sendAttempted) await cancelPrepared().catch(() => undefined)
      return fail()
    }
  }
}
