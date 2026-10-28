// @vitest-environment node
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { acquirePreparationSession } from '../../scripts/fiscal-preparation-session.mjs'

function fixture() {
  const client = Object.assign(new EventEmitter(), {
    held: false, pid: 41, started: '2026-10-28 08:00:00.123456+00',
    query: vi.fn(async (sql: string): Promise<{ rows: Record<string, unknown>[] }> => {
      const identity = { actor: 'postgres', pid: client.pid, started: client.started }
      if (sql.includes('pg_try_advisory_lock')) { client.held = true; return { rows: [{ acquired: true }] } }
      if (sql.includes('pg_advisory_unlock')) { client.held = false; return { rows: [{ released: true }] } }
      return { rows: [{ ...identity, held: client.held }] }
    }),
  })
  const binding = { projectRef: 'acoyfwwmhaeruciyedri', planSha256: 'a'.repeat(64), operationId: randomUUID() }
  const receipt = { planSha256: binding.planSha256, operationId: binding.operationId, openedAt: '2026-10-28 15:10:01.123456+00' }
  return { client, binding, receipt }
}

it('reconciles a lost opening ACK once under the original session, retaining microseconds', async () => {
  const { client, binding, receipt } = fixture()
  const session = await acquirePreparationSession(client, binding)
  const open = vi.fn(async () => { throw Error('sensitive transport diagnostic') })
  const read = vi.fn(async () => receipt)
  expect(await session.openOnce(open, read)).toEqual({ receipt, reconciled: true })
  expect(session.receipt().openedAt).toBe(receipt.openedAt)
  await expect(session.openOnce(open, read)).rejects.toThrow('WINDOW_OPEN_REPLAY_REJECTED')
  expect(open).toHaveBeenCalledTimes(1)
  expect(read).toHaveBeenCalledTimes(1)
  await session.releaseAfterClosed(async () => true)
  await expect(session.assertHeld()).rejects.toThrow('WINDOW_SESSION_OWNERSHIP_LOST')
})

it.each(['error', 'end', 'pid', 'started', 'held'])('never claims a matching active window after %s ownership loss', async mode => {
  const { client, binding, receipt } = fixture()
  const session = await acquirePreparationSession(client, binding)
  const read = vi.fn(async () => receipt)
  await expect(session.openOnce(async () => {
    if (mode === 'error') client.emit('error', Error('private diagnostic'))
    if (mode === 'end') client.emit('end')
    if (mode === 'pid') client.pid++
    if (mode === 'started') client.started += 'drift'
    if (mode === 'held') client.held = false
    throw Error('lost ACK')
  }, read)).rejects.toThrow('WINDOW_SESSION_OWNERSHIP_LOST')
  expect(read).not.toHaveBeenCalled()
  expect(() => session.receipt()).toThrow('WINDOW_OPEN_RECEIPT_UNAVAILABLE')
})

it('rejects double assistants using the same client before acquiring a reentrant advisory lock', async () => {
  const { client, binding } = fixture()
  await acquirePreparationSession(client, binding)
  await expect(acquirePreparationSession(client, binding)).rejects.toThrow('WINDOW_SESSION_REENTRY_REJECTED')
  expect(client.query.mock.calls.filter(([sql]) => sql.includes('pg_try_advisory_lock'))).toHaveLength(1)
})

it('rejects another assistant without executing opening or reading its receipt', async () => {
  const { client, binding } = fixture()
  client.query.mockImplementation(async sql => sql.includes('pg_try_advisory_lock')
    ? { rows: [{ acquired: false }] }
    : { rows: [{ actor: 'postgres', pid: 41, started: client.started }] })
  await expect(acquirePreparationSession(client, binding)).rejects.toThrow('WINDOW_SESSION_BUSY')
})

it('does not release exclusion while cleanup is unconfirmed', async () => {
  const { client, binding } = fixture()
  const session = await acquirePreparationSession(client, binding)
  await expect(session.releaseAfterClosed(async () => false)).rejects.toThrow('WINDOW_SESSION_CLEANUP_NOT_CONFIRMED')
  expect(client.held).toBe(true)
  await session.assertHeld()
  await session.releaseAfterClosed(async () => true)
})

it('rejects concurrent open calls before the first asynchronous check completes', async () => {
  const { client, binding, receipt } = fixture()
  const session = await acquirePreparationSession(client, binding)
  const open = vi.fn(async () => undefined)
  const first = session.openOnce(open, async () => receipt)
  await expect(session.openOnce(open, async () => receipt)).rejects.toThrow('WINDOW_OPEN_REPLAY_REJECTED')
  await first
  expect(open).toHaveBeenCalledTimes(1)
})

it.each(['missing', 'foreign-plan', 'foreign-operation', 'Date', 'extra-field'])('rejects %s receipt', async mode => {
  const { client, binding, receipt } = fixture()
  const session = await acquirePreparationSession(client, binding)
  const altered: Record<string, unknown> = { ...receipt }
  if (mode === 'foreign-plan') altered.planSha256 = 'b'.repeat(64)
  if (mode === 'foreign-operation') altered.operationId = randomUUID()
  if (mode === 'Date') altered.openedAt = new Date()
  if (mode === 'extra-field') altered.token = 'must not be persisted'
  await expect(session.openOnce(async () => undefined, async () => mode === 'missing' ? null : altered)).rejects.toThrow('WINDOW_OPEN_RECEIPT_REJECTED')
  expect(() => session.receipt()).toThrow('WINDOW_OPEN_RECEIPT_UNAVAILABLE')
})

it('does not retry a failed independent verifier', async () => {
  const { client, binding } = fixture()
  const session = await acquirePreparationSession(client, binding)
  const read = vi.fn(async () => { throw Error('private external payload') })
  await expect(session.openOnce(async () => undefined, read)).rejects.toThrow('WINDOW_OPEN_RECONCILIATION_REQUIRED')
  expect(read).toHaveBeenCalledTimes(1)
})
