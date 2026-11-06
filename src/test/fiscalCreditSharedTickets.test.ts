import { expect, it, vi } from 'vitest'
import { createSharedFiscalCreditTicketLoader } from '../../supabase/functions/_shared/fiscalCreditSharedTickets'
import type { FiscalCreditNumberBinding } from '../../supabase/functions/_shared/fiscalCreditNumberSource'
import type { FiscalRpc } from '../../supabase/functions/_shared/fiscalPersistence'

async function fixture() {
  const binding: FiscalCreditNumberBinding = { version: 1, entorno: 'HOMOLOGACION', servicio: 'wsfe', finalidad: 'NUMERACION_NC',
    venta_id: crypto.randomUUID(), operacion_origen_id: crypto.randomUUID(), solicitud_id: crypto.randomUUID(), propuesta_sha256: 'a'.repeat(64),
    preparacion_sha256: 'b'.repeat(64), kiosco_id: crypto.randomUUID(), usuario_id: crypto.randomUUID(), actor_auth_id: crypto.randomUUID(),
    cuit_emisor: '20415005963', punto_venta: 7, tipo_comprobante: 13, credencial_id: crypto.randomUUID(), certificado_sha256: 'c'.repeat(64),
    revision_emisor: 1, revision_parametros: 1, emision_habilitada: false }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']), keyId = crypto.randomUUID()
  const keys = { active: vi.fn(async () => ({ id: keyId, key })), read: vi.fn(async () => key) }
  let cipher: unknown = null, loseStart = false, loseConfirm = false
  const actions: string[] = []
  const db: FiscalRpc = { rpc: vi.fn(async (_name, args) => {
    const action = String(args.p_accion); actions.push(action)
    const ack = { intento_id: args.p_intento, revision: 1 }
    if (action === 'SOLICITAR') return { data: cipher ? { estado: 'DISPONIBLE', nuevo_intento: false, cifrado: cipher } : { estado: 'RENOVAR', nuevo_intento: true, ...ack }, error: null }
    if (action === 'INICIAR') {
      if (loseStart) throw new Error('synthetic lost acknowledgement')
      return { data: { estado: 'ENVIO_INCIERTO', nuevo_envio: true, ...ack }, error: null }
    }
    if (action === 'CONFIRMAR') {
      cipher = args.p_cifrado
      if (loseConfirm) throw new Error('synthetic lost acknowledgement')
      return { data: { estado: 'DISPONIBLE', ...ack, cifrado_sha256: 'd'.repeat(64) }, error: null }
    }
    return { data: { estado: 'CANCELADA', ...ack }, error: null }
  }) }
  const ticket = { entorno: 'HOMOLOGACION' as const, servicio: 'wsfe' as const, cuitEmisor: binding.cuit_emisor,
    credencialId: binding.credencial_id, certificadoSha256: binding.certificado_sha256, expiresAt: Date.now() + 3600000, token: 'synthetic-token', sign: 'synthetic-sign' }
  const wsaa = vi.fn(async (_binding: Readonly<FiscalCreditNumberBinding>, _signal: AbortSignal, beforeSend: () => Promise<void>) => { await beforeSend(); return ticket })
  const guard = vi.fn(async () => undefined), controller = new AbortController()
  const load = () => createSharedFiscalCreditTicketLoader(db, keys, wsaa, guard)(binding, controller.signal)
  return { binding, keys, db, wsaa, guard, controller, actions, ticket, load,
    loseStart: () => { loseStart = true }, loseConfirm: () => { loseConfirm = true } }
}

it('cifra y reutiliza TA entre instancias sin otro envío ni clave activa', async () => {
  const f = await fixture(), first = await f.load(), second = await f.load()
  expect(first.token).toBe(f.ticket.token); expect(second.sign).toBe(f.ticket.sign)
  expect(JSON.stringify(first)).not.toContain(f.ticket.token)
  expect(f.wsaa).toHaveBeenCalledTimes(1); expect(f.keys.active).toHaveBeenCalledTimes(1); expect(f.keys.read).toHaveBeenCalledTimes(1)
  expect(f.actions).toEqual(['SOLICITAR', 'INICIAR', 'CONFIRMAR', 'SOLICITAR'])
})
it('guard rechazado impide diario, claves y WSAA', async () => {
  const f = await fixture(); f.guard.mockRejectedValue(new Error('closed'))
  await expect(f.load()).rejects.toThrow('FISCAL_TICKET_NC_NO_CONFIRMADO')
  expect(f.actions).toEqual([]); expect(f.keys.active).not.toHaveBeenCalled(); expect(f.wsaa).not.toHaveBeenCalled()
})
it('fallo de clave previo al envío cancela sólo preparación', async () => {
  const f = await fixture(); f.keys.active.mockRejectedValue(new Error('unavailable'))
  await expect(f.load()).rejects.toThrow('FISCAL_TICKET_NC_NO_CONFIRMADO')
  expect(f.actions).toEqual(['SOLICITAR', 'CANCELAR']); expect(f.wsaa).not.toHaveBeenCalled()
})
it('ACK INICIAR perdido conserva incertidumbre sin cancelar', async () => {
  const f = await fixture(); f.loseStart()
  await expect(f.load()).rejects.toThrow('FISCAL_TICKET_NC_NO_CONFIRMADO')
  expect(f.actions).toEqual(['SOLICITAR', 'INICIAR'])
})
it('ACK CONFIRMAR perdido recupera el cifrado sin otro WSAA', async () => {
  const f = await fixture(); f.loseConfirm()
  await expect(f.load()).rejects.toThrow('FISCAL_TICKET_NC_NO_CONFIRMADO')
  expect((await f.load()).token).toBe(f.ticket.token); expect(f.wsaa).toHaveBeenCalledTimes(1)
  expect(f.actions).not.toContain('CANCELAR')
})
it('respuesta tardía tras abortar se conserva cifrada pero no se entrega', async () => {
  const f = await fixture()
  f.wsaa.mockImplementation(async (_binding, _signal, beforeSend) => { await beforeSend(); f.controller.abort(); return f.ticket })
  await expect(f.load()).rejects.toThrow('FISCAL_TICKET_NC_NO_CONFIRMADO')
  expect(f.actions).toEqual(['SOLICITAR', 'INICIAR', 'CONFIRMAR'])
})
it('TA con emisor distinto no se confirma ni libera lease enviado', async () => {
  const f = await fixture(); f.ticket.cuitEmisor = '20123456786'
  await expect(f.load()).rejects.toThrow('FISCAL_TICKET_NC_NO_CONFIRMADO')
  expect(f.actions).toEqual(['SOLICITAR', 'INICIAR'])
})
