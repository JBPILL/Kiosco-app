// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { openPositiveWindowJournal } from '../../scripts/fiscal-positive-window-journal.mjs'
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'kiosko-positive-journal-'))
  const path = join(root, 'journal.jsonl')
  const binding = { projectRef: 'acoyfwwmhaeruciyedri', planSha256: 'a'.repeat(64), operationId: randomUUID() }
  const assertExclusive = vi.fn(async () => undefined)
  const create = () => openPositiveWindowJournal(path, binding, { create: true, assertExclusive })
  const resume = () => openPositiveWindowJournal(path, binding, { assertExclusive })
  const cleanup = () => {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('kiosko-positive-journal-')) throw Error('Unexpected cleanup path')
    rmSync(root, { recursive: true, force: true })
  }
  return { path, binding, assertExclusive, create, resume, cleanup }
}
it('preserves the exact microsecond receipt and write-ahead attempts across reopen without overwriting history', async () => {
  const f = fixture(), journal = f.create()
  try {
    await journal.record('OPEN_ATTEMPT')
    await journal.record('OPEN_RECEIPT', { openedAt: '2026-10-28 15:10:01.123456+00' })
    await journal.record('FLAGS_ENABLED')
    await journal.record('SAVE_ATTEMPT'); await journal.record('BODY_ATTEMPT')
    await journal.record('PREPARED', { requestSha256: 'b'.repeat(64), number: 41 })
    const before = readFileSync(f.path, 'utf8')
    expect(() => f.create()).toThrow('POSITIVE_WINDOW_JOURNAL_NOT_CONFIRMED')
    expect(readFileSync(f.path, 'utf8')).toBe(before)
    journal.dispose()
    const recovered = f.resume()
    try {
      expect(recovered.state().openedAt).toBe('2026-10-28 15:10:01.123456+00')
      expect(recovered.flowJournal()).toEqual({ planSha256: f.binding.planSha256, operationId: f.binding.operationId, saveAttempted: true, bodyAttempted: true, prepared: { requestSha256: 'b'.repeat(64), number: 41 } })
    } finally { recovered.dispose() }
  } finally { journal.dispose(); f.cleanup() }
})
it('never stores unexpected fields or authentication material in an operational event', async () => {
  const f = fixture(), journal = f.create()
  try {
    const before = readFileSync(f.path, 'utf8')
    await expect(journal.record('STOP', { stage: 'AUTH', jwt: 'SYNTHETIC_MUST_NOT_PERSIST' })).rejects.toThrow('POSITIVE_WINDOW_JOURNAL_NOT_CONFIRMED')
    expect(readFileSync(f.path, 'utf8')).toBe(before)
    await expect(journal.record('SQL_CLOSED')).rejects.toThrow('POSITIVE_WINDOW_JOURNAL_NOT_CONFIRMED')
    expect(readFileSync(f.path, 'utf8')).toBe(before)
  } finally { journal.dispose(); f.cleanup() }
})
it.each(['truncated', 'modified', 'foreign-binding'])('rejects %s history without repairing, truncating or replacing it', mode => {
  const f = fixture(), journal = f.create(); journal.dispose()
  try {
    if (mode === 'truncated') writeFileSync(f.path, readFileSync(f.path, 'utf8').slice(0, -1))
    if (mode === 'modified') writeFileSync(f.path, readFileSync(f.path, 'utf8').replace('HEADER', 'ALTERED'))
    if (mode === 'foreign-binding') f.binding.operationId = randomUUID()
    const before = readFileSync(f.path, 'utf8')
    expect(f.resume).toThrow('POSITIVE_WINDOW_JOURNAL_NOT_CONFIRMED')
    expect(readFileSync(f.path, 'utf8')).toBe(before)
  } finally { f.cleanup() }
})
it('never records SQL closed before flags closed, and keeps the receipt after the full closure sequence', async () => {
  const f = fixture(), journal = f.create()
  try {
    await journal.record('OPEN_ATTEMPT'); await journal.record('OPEN_RECEIPT', { openedAt: '2026-10-28 15:10:01.123456+00' })
    await expect(journal.record('SQL_CLOSED')).rejects.toThrow('POSITIVE_WINDOW_JOURNAL_NOT_CONFIRMED')
    await journal.record('FLAGS_CLOSED'); await journal.record('SQL_CLOSED')
    await journal.record('LOGOUT_CONFIRMED'); await journal.record('BACKEND_CLOSED')
    expect(journal.state()).toMatchObject({ openedAt: '2026-10-28 15:10:01.123456+00', flagsClosed: true, sqlClosed: true, logoutConfirmed: true, backendClosed503: true })
    await expect(journal.record('OPEN_ATTEMPT')).rejects.toThrow('POSITIVE_WINDOW_JOURNAL_NOT_CONFIRMED')
  } finally { journal.dispose(); f.cleanup() }
})
it('STOP prevents new attempts while still permitting receipt-based cleanup and local logout', async () => {
  const f = fixture(), journal = f.create()
  try {
    await journal.record('OPEN_ATTEMPT'); await journal.record('OPEN_RECEIPT', { openedAt: '2026-10-28 15:10:01.123456+00' })
    await journal.record('FLAGS_ENABLED'); await journal.record('STOP', { stage: 'DATA' })
    await expect(journal.record('SAVE_ATTEMPT')).rejects.toThrow('POSITIVE_WINDOW_JOURNAL_NOT_CONFIRMED')
    await journal.record('FLAGS_CLOSED'); await journal.record('SQL_CLOSED'); await journal.record('LOGOUT_CONFIRMED')
    expect(journal.state().stopped).toBe(true)
  } finally { journal.dispose(); f.cleanup() }
})
it('does not append or claim a durable attempt after exclusive session ownership is lost', async () => {
  const f = fixture(), journal = f.create()
  try {
    const before = readFileSync(f.path, 'utf8')
    f.assertExclusive.mockRejectedValue(Error('WINDOW_SESSION_OWNERSHIP_LOST'))
    await expect(journal.record('OPEN_ATTEMPT')).rejects.toThrow('POSITIVE_WINDOW_JOURNAL_NOT_CONFIRMED')
    expect(readFileSync(f.path, 'utf8')).toBe(before)
  } finally { journal.dispose(); f.cleanup() }
})
