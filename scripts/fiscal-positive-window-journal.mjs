// Append-only SAFE operational metadata. Caller supplies an already private
// directory/ACL and the current exclusive PostgreSQL session assertion.
// Hash chaining detects corruption; it is NOT authentication against an editor
// with filesystem access and does not establish ownership of a remote window.
import { constants, openSync, closeSync, fstatSync, lstatSync, readSync, writeSync, fsyncSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
const sha = value => createHash('sha256').update(value).digest('hex')
const fail = () => { throw Error('POSITIVE_WINDOW_JOURNAL_NOT_CONFIRMED') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const receiptText = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(value)
const empty = () => ({ baseline: null, openAttempted: false, openedAt: null, flagsEnabled: false, saveAttempted: false,
  bodyAttempted: false, prepared: null, flagsClosed: false, sqlClosed: false, logoutConfirmed: false, backendClosed503: false, stopped: false })
function advance(previous, event, payload) {
  const state = { ...previous }
  if (state.stopped && ['OPEN_ATTEMPT','FLAGS_ENABLED','SAVE_ATTEMPT','BODY_ATTEMPT'].includes(event)) return fail()
  const nullPayload = payload === null
  if (event === 'BASELINE' && !state.baseline && !state.openAttempted && exact(payload, ['historySha256','commercialSha256','observedAt'])
    && hash(payload.historySha256) && hash(payload.commercialSha256) && typeof payload.observedAt === 'string' && Number.isFinite(Date.parse(payload.observedAt))) state.baseline = { ...payload }
  else if (event === 'OPEN_ATTEMPT' && nullPayload && !state.openAttempted && !state.logoutConfirmed) state.openAttempted = true
  else if (event === 'OPEN_RECEIPT' && state.openAttempted && !state.openedAt && exact(payload, ['openedAt']) && receiptText(payload.openedAt)) state.openedAt = payload.openedAt
  else if (event === 'FLAGS_ENABLED' && nullPayload && state.openedAt && !state.flagsEnabled && !state.flagsClosed && !state.logoutConfirmed) state.flagsEnabled = true
  else if (event === 'SAVE_ATTEMPT' && nullPayload && state.flagsEnabled && !state.flagsClosed && !state.saveAttempted && !state.logoutConfirmed) state.saveAttempted = true
  else if (event === 'BODY_ATTEMPT' && nullPayload && state.saveAttempted && !state.bodyAttempted && !state.flagsClosed && !state.logoutConfirmed) state.bodyAttempted = true
  else if (event === 'PREPARED' && state.bodyAttempted && !state.prepared && !state.flagsClosed && !state.logoutConfirmed
    && exact(payload, ['requestSha256', 'number']) && hash(payload.requestSha256) && Number.isSafeInteger(payload.number) && payload.number >= 1 && payload.number <= 99999999) state.prepared = { ...payload }
  else if (event === 'FLAGS_CLOSED' && nullPayload && state.openedAt && !state.flagsClosed) state.flagsClosed = true
  else if (event === 'SQL_CLOSED' && nullPayload && state.openedAt && state.flagsClosed && !state.sqlClosed) state.sqlClosed = true
  else if (event === 'LOGOUT_CONFIRMED' && nullPayload && !state.logoutConfirmed) state.logoutConfirmed = true
  else if (event === 'BACKEND_CLOSED' && nullPayload && state.logoutConfirmed && !state.backendClosed503) state.backendClosed503 = true
  else if (event === 'STOP' && exact(payload, ['stage']) && ['PREFLIGHT','OPEN','AUTH','FLAGS','DATA','BODY','RELOAD','CLOSE','LOGOUT','FINAL_PROBE','SESSION','UNEXPECTED'].includes(payload.stage)) state.stopped = true
  else return fail()
  return state
}
/** create=true uses exclusive creation; resume verifies exact binding/chain.
 * No filesystem operation here can reopen a window, reacquire a DB session,
 * invoke Auth/ARCA or establish that this process owns a historical receipt.
 */
export function openPositiveWindowJournal(path, binding, { create = false, assertExclusive } = {}) {
  if (!isAbsolute(path) || !exact(binding, ['projectRef', 'planSha256', 'operationId'])
    || binding.projectRef !== 'acoyfwwmhaeruciyedri' || !hash(binding.planSha256) || !uuid(binding.operationId)
    || typeof create !== 'boolean' || typeof assertExclusive !== 'function') return fail()
  const expected = JSON.parse(JSON.stringify(binding))
  let fd, disposed = false, busy = false
  try {
    if (!lstatSync(dirname(path)).isDirectory() || lstatSync(dirname(path)).isSymbolicLink()) return fail()
    if (!create && (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())) return fail()
    fd = openSync(path, constants.O_RDWR | constants.O_APPEND | (create ? constants.O_CREAT | constants.O_EXCL : 0) | (constants.O_NOFOLLOW ?? 0), 0o600)
    if (create) {
      const entry = { seq: 0, previousSha256: null, event: 'HEADER', payload: { version: 1, ...expected } }
      const line = JSON.stringify({ entry, sha256: sha(JSON.stringify(entry)) }) + '\n'
      const buffer = Buffer.from(line)
      if (writeSync(fd, buffer) !== buffer.length) return fail()
      fsyncSync(fd)
    }
  } catch { if (fd !== undefined) closeSync(fd); return fail() }
  function read() {
    try {
      if (disposed) return fail()
      const file = fstatSync(fd), named = lstatSync(path)
      if (!file.isFile() || named.isSymbolicLink() || file.ino !== named.ino || file.dev !== named.dev || file.size < 1 || file.size > 65536) return fail()
      const buffer = Buffer.alloc(file.size)
      if (readSync(fd, buffer, 0, buffer.length, 0) !== buffer.length) return fail()
      const text = buffer.toString('utf8')
      if (!text.endsWith('\n')) return fail() // Partial crash write is preserved, never repaired/truncated.
      const lines = text.slice(0, -1).split('\n')
      if (lines.length > 100) return fail()
      let previousHash = null, state = empty()
      for (const [seq, line] of lines.entries()) {
        const record = JSON.parse(line)
        if (!exact(record, ['entry','sha256']) || !exact(record.entry, ['seq','previousSha256','event','payload'])
          || record.entry.seq !== seq || record.entry.previousSha256 !== previousHash || record.sha256 !== sha(JSON.stringify(record.entry))) return fail()
        if (seq === 0) {
          if (record.entry.event !== 'HEADER' || JSON.stringify(record.entry.payload) !== JSON.stringify({ version: 1, ...expected })) return fail()
        } else state = advance(state, record.entry.event, record.entry.payload)
        previousHash = record.sha256
      }
      return { state, previousHash, seq: lines.length }
    } catch { return fail() }
  }
  try { read() } catch { closeSync(fd); throw Error('POSITIVE_WINDOW_JOURNAL_NOT_CONFIRMED') }
  return Object.freeze({
    state() { return Object.freeze(read().state) },
    flowJournal() {
      const { state } = read()
      return Object.freeze({ planSha256: expected.planSha256, operationId: expected.operationId,
        saveAttempted: state.saveAttempted, bodyAttempted: state.bodyAttempted,
        prepared: state.prepared === null ? null : Object.freeze({ ...state.prepared }) })
    },
    async record(event, payload = null) {
      if (busy || disposed) return fail()
      busy = true
      try {
        await assertExclusive()
        const current = read()
        advance(current.state, event, payload) // Validate BEFORE any bytes are written.
        const entry = { seq: current.seq, previousSha256: current.previousHash, event, payload: payload === null ? null : JSON.parse(JSON.stringify(payload)) }
        const buffer = Buffer.from(JSON.stringify({ entry, sha256: sha(JSON.stringify(entry)) }) + '\n')
        if (writeSync(fd, buffer) !== buffer.length) return fail()
        fsyncSync(fd)
        await assertExclusive()
        const observed = read()
        if (observed.seq !== current.seq + 1 || observed.previousHash !== sha(JSON.stringify(entry))) return fail()
        return Object.freeze(observed.state)
      } catch { return fail() }
      finally { busy = false }
    },
    dispose() { if (!disposed && !busy) { disposed = true; closeSync(fd) } else if (busy) return fail() },
  })
}
