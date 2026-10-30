// Private operator core. No CLI, network adapter, credentials, or browser exports.
import fs from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

export const PLAN_HASH = '717d6524d2291b4ec2a160d1b6fd26f79ece350b5aee0cacd28200efb04c605f'
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const fail = code => { throw Error(code) }
function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (typeof value === 'object' && value) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
  return fail('RESTORE_VALUE_INVALID')
}
export const valueHash = value => createHash('sha256').update(canonical(value)).digest('hex')
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child) }
  return value
}
export function loadRestorePlan() {
  const bytes = fs.readFileSync(new URL('./restore-acceptance-plan.json', import.meta.url))
  if (createHash('sha256').update(bytes).digest('hex') !== PLAN_HASH) fail('RESTORE_PLAN_DRIFT')
  return freeze(JSON.parse(bytes.toString('utf8')))
}
const plan = loadRestorePlan()
const actions = freeze([
  ...plan.steps.flatMap(step => step.expected === 'REJECT'
    ? [{ step, role: 'OWNER', replay: false }]
    : [{ step, role: 'OWNER', replay: false }, { step, role: 'OWNER', replay: true }]),
  ...plan.cashierDeniedCalls.map(step => ({ step, role: 'CASHIER', replay: false })),
])
if (actions.length !== plan.expectedTotalExplicitRpcCalls) fail('RESTORE_PLAN_ACTIONS_INVALID')
function operationRequest(action, authId) {
  const p = action.step.params
  if (action.step.rpc === 'restaurar_contacto_backup') return { tabla: p.p_tabla, registro_id: p.p_registro_id, datos: p.p_datos, actor_auth_id: authId }
  if (action.step.rpc === 'restaurar_producto_backup') return { producto_id: p.p_producto_id, datos: p.p_datos, actor_auth_id: authId }
  return { lote_id: p.p_lote_id, datos: p.p_datos, actor_auth_id: authId }
}
function regular(file) {
  const info = fs.lstatSync(file)
  if (!info.isFile() || info.isSymbolicLink()) fail('RESTORE_JOURNAL_FILE_INVALID')
}
function durableWrite(file, text, flags) {
  const fd = fs.openSync(file, flags, 0o600)
  try {
    const data = Buffer.from(text, 'utf8')
    let offset = 0
    while (offset < data.length) {
      const count = fs.writeSync(fd, data, offset, data.length - offset)
      if (count <= 0) fail('RESTORE_JOURNAL_WRITE_FAILED')
      offset += count
    }
    fs.fsyncSync(fd)
  } finally { fs.closeSync(fd) }
}
export class RestoreJournal {
  constructor(file) { this.file = resolve(file) }
  records() {
    regular(this.file)
    if (fs.statSync(this.file).size > 1000000) fail('RESTORE_JOURNAL_TOO_LARGE')
    const text = fs.readFileSync(this.file, 'utf8')
    if (!text.endsWith('\n')) fail('RESTORE_JOURNAL_TRUNCATED')
    let previous = '0'.repeat(64)
    const records = text.slice(0, -1).split('\n').map((line, index) => {
      let row
      try { row = JSON.parse(line) } catch { fail('RESTORE_JOURNAL_INVALID') }
      const { hash, ...data } = row
      if (data.sequence !== index || data.previous !== previous || valueHash(data) !== hash) fail('RESTORE_JOURNAL_CHAIN_INVALID')
      previous = hash
      return row
    })
    return records
  }
  append(event) {
    const records = this.records()
    const data = { ...event, recordedAt: new Date().toISOString(), sequence: records.length, previous: records.at(-1).hash }
    durableWrite(this.file, canonical({ ...data, hash: valueHash(data) }) + '\n', 'a')
  }
}
export function createRestoreJournal(file, actors) {
  if (!actors || !uuid.test(actors.OWNER) || !uuid.test(actors.CASHIER) || actors.OWNER === actors.CASHIER || Object.keys(actors).sort().join(',') !== 'CASHIER,OWNER') fail('RESTORE_ACTOR_PINS_REQUIRED')
  const data = { kind: 'HEADER', version: 1, planHash: PLAN_HASH, actors: { ...actors }, recordedAt: new Date().toISOString(), sequence: 0, previous: '0'.repeat(64) }
  durableWrite(resolve(file), canonical({ ...data, hash: valueHash(data) }) + '\n', 'wx')
  return new RestoreJournal(file)
}
export function inspectRestoreJournal(journal) {
  const records = journal.records(), header = records[0]
  if (!header || header.kind !== 'HEADER' || header.planHash !== PLAN_HASH || header.version !== 1 || !uuid.test(header.actors?.OWNER) || !uuid.test(header.actors?.CASHIER)) fail('RESTORE_JOURNAL_HEADER_INVALID')
  let cursor = 0, pending = null
  const acks = {}
  for (const row of records.slice(1)) {
    const action = actions[cursor]
    if (!action || row.index !== cursor) fail('RESTORE_JOURNAL_ORDER_INVALID')
    if (row.kind === 'INTENT') {
      if (pending || row.rpc !== action.step.rpc || row.operationId !== action.step.params.p_operacion_id || row.paramsHash !== valueHash(action.step.params) || row.actorAuthId !== header.actors[action.role] || row.requestHash !== valueHash(operationRequest(action, row.actorAuthId))) fail('RESTORE_JOURNAL_INTENT_INVALID')
      pending = row
    } else {
      if (!pending) fail('RESTORE_JOURNAL_ORDER_INVALID')
      if (action.step.expected === 'REJECT') {
        if (row.kind !== 'EXPECTED_REJECTION' || row.sqlstate !== action.step.sqlstate) fail('RESTORE_JOURNAL_RESULT_INVALID')
      } else {
        if (row.kind !== 'CONFIRMED' || !/^[0-9a-f]{64}$/.test(row.ackHash)) fail('RESTORE_JOURNAL_RESULT_INVALID')
        if (action.replay && acks[row.operationId] !== row.ackHash) fail('RESTORE_REPLAY_ACK_MISMATCH')
        if (row.operationId !== pending.operationId) fail('RESTORE_JOURNAL_RESULT_INVALID')
        acks[row.operationId] = row.ackHash
      }
      pending = null; cursor++
    }
  }
  return { cursor, pending, acks, actors: header.actors, complete: cursor === actions.length }
}
function numeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) return Number(value)
  return NaN
}
function validBatch(record, data, productId) {
  return record && record.id === data.id && record.kiosco_id === plan.kioskId && record.producto_id === productId && record.numero_lote === data.numero_lote && record.fecha_vencimiento === data.fecha_vencimiento && numeric(record.cantidad_inicial) === data.cantidad_inicial && numeric(record.cantidad_actual) === data.cantidad_actual && record.activo === data.activo && Date.parse(record.fecha_ingreso) === Date.parse(data.fecha_ingreso)
}
function validAck(action, ack) {
  const p = action.step.params, data = p.p_datos
  if (!ack || typeof ack !== 'object' || Array.isArray(ack)) return false
  const record = action.step.rpc === 'restaurar_producto_backup' ? ack.producto : ack.registro
  const id = p.p_producto_id ?? p.p_registro_id ?? p.p_lote_id
  if (!record || record.id !== id || record.kiosco_id !== plan.kioskId) return false
  if (action.step.rpc === 'restaurar_producto_backup') {
    if (numeric(record.stock_actual) !== data.stock_actual || numeric(record.precio_venta) !== data.precio_venta || numeric(record.precio_costo) !== data.precio_costo || record.descripcion !== data.descripcion || record.es_pesable !== data.es_pesable || record.activo !== false || record.proveedor_id !== data.proveedor_id || !Array.isArray(ack.lotes) || ack.lotes.length !== data.lotes_backup.length) return false
    return data.lotes_backup.every(lot => ack.lotes.some(saved => validBatch(saved, lot, id)))
  }
  if (ack.id !== id || ack.kiosco_id !== plan.kioskId) return false
  if (action.step.rpc === 'restaurar_lote_backup') return validBatch(record, { ...data, id }, data.producto_id)
  const created = action.step.name.endsWith('-create')
  return ack.creado === created && ack.saldo_conservado === !created && record.nombre === data.nombre.trim() && record.activo === false && numeric(record[p.p_tabla === 'clientes' ? 'saldo_deudor' : 'saldo_pendiente']) === 0
}
function acquire(journal) {
  const file = journal.file + '.lock'
  let fd
  try { fd = fs.openSync(file, 'wx', 0o600) } catch { fail('RESTORE_JOURNAL_BUSY') }
  return () => { fs.closeSync(fd); fs.unlinkSync(file) }
}
export async function executeNextRestoreAction(journal, actor, transport) {
  const release = acquire(journal)
  try {
    const state = inspectRestoreJournal(journal)
    if (state.pending) fail('RESTORE_RECONCILIATION_REQUIRED')
    if (state.complete) fail('RESTORE_PLAN_COMPLETE')
    const action = actions[state.cursor]
    if (actor?.role !== action.role || actor.authId !== state.actors[action.role] || actor.kioskId !== plan.kioskId) fail('RESTORE_ACTOR_CHANGED')
    const intent = { kind: 'INTENT', index: state.cursor, rpc: action.step.rpc, operationId: action.step.params.p_operacion_id, paramsHash: valueHash(action.step.params), requestHash: valueHash(operationRequest(action, actor.authId)), actorAuthId: actor.authId }
    try { journal.append(intent) } catch { fail('RESTORE_JOURNAL_WRITE_FAILED') } // fsync BEFORE dispatch.
    let reply
    try { reply = await transport(action.step.rpc, structuredClone(action.step.params)) } catch { fail('RESTORE_OUTCOME_UNCERTAIN') }
    if (action.step.expected === 'REJECT') {
      const status = action.step.sqlstate === '42501' ? 403 : 400
      if (reply?.status !== status || reply?.data?.code !== action.step.sqlstate) fail('RESTORE_OUTCOME_UNCERTAIN')
      try { journal.append({ kind: 'EXPECTED_REJECTION', index: state.cursor, sqlstate: action.step.sqlstate }) } catch { fail('RESTORE_JOURNAL_WRITE_FAILED') }
    } else {
      if (reply?.status !== 200 || !validAck(action, reply.data)) fail('RESTORE_OUTCOME_UNCERTAIN')
      const ackHash = valueHash(reply.data)
      if (action.replay && state.acks[intent.operationId] !== ackHash) fail('RESTORE_REPLAY_ACK_MISMATCH')
      try { journal.append({ kind: 'CONFIRMED', index: state.cursor, operationId: intent.operationId, ackHash }) } catch { fail('RESTORE_JOURNAL_WRITE_FAILED') }
    }
    return { confirmedIndex: state.cursor }
  } finally { release() }
}
export async function inspectUncertainRestoreAction(journal, readOperation) {
  const state = inspectRestoreJournal(journal)
  if (!state.pending) fail('RESTORE_NO_PENDING_INTENT')
  const pending = state.pending
  let observed
  try { observed = await readOperation(pending.operationId) } catch { fail('RESTORE_RECONCILIATION_READ_FAILED') }
  if (!observed) return { outcome: 'ABSENCE_NOT_PROOF_OF_NONEXECUTION', mayResend: false, mayAdvance: false }
  const action = actions[state.cursor]
  const match = action.step.expected !== 'REJECT' && observed.operationId === pending.operationId && observed.kioskId === plan.kioskId && observed.actorAuthId === pending.actorAuthId && observed.requestHash === pending.requestHash && validAck(action, observed.ack)
  const ackMatch = match && (!action.replay || state.acks[pending.operationId] === valueHash(observed.ack))
  return { outcome: match && ackMatch ? 'ACK_MATCH_REQUIRES_REVIEW' : 'CONFLICT_STOP', mayResend: false, mayAdvance: false }
}
