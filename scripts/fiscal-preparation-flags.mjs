// Private metadata/flag coordinator. No fetch/credentials or standalone runner.
// Supply scoped Management adapters only inside the approved operator window.
import { createHash } from 'node:crypto'
import { custodyInventory } from './fiscal-custody-plan.mjs'
const flags = Object.freeze(['ARCA_HOMO_BACKEND_ENABLED', 'ARCA_HOMO_DATA_PREPARATION_ENABLED', 'ARCA_HOMO_PREPARATION_ENABLED'])
const digest = value => createHash('sha256').update(String(value)).digest('hex')
const enabledDigest = digest(true), closedDigest = digest(false)
const fail = code => { throw Error(code) }

export function createPreparationFlags({ baselineInventory, readInventory, writeFlag, assertExclusive, assertOwnerAndWindow }) {
  if (![readInventory, writeFlag, assertExclusive, assertOwnerAndWindow].every(value => typeof value === 'function')) fail('WINDOW_FLAGS_INPUT_REJECTED')
  // Initial baseline must have ALL fiscal flags false/absent, not just these three.
  const baseline = custodyInventory(baselineInventory)
  let enabling = false, closing = false, enableUsed = false, closeUsed = false
  const touched = new Set()
  let expected = new Map(flags.map(name => [name, false]))
  let recoveredEnableAcks = 0, recoveredCloseAcks = 0

  async function observe() {
    try {
      const raw = await readInventory()
      if (!Array.isArray(raw)) throw Error()
      const mutable = new Map()
      // Validate through the existing closed-inventory parser after normalizing
      // only our three names. All other secrets must retain their exact digests.
      const normalized = raw.map(row => {
        if (!flags.includes(row?.name)) return row
        if (mutable.has(row.name) || ![closedDigest, enabledDigest].includes(row.digest)) throw Error()
        mutable.set(row.name, row.digest === enabledDigest)
        return { ...row, digest: closedDigest }
      })
      const current = custodyInventory(normalized)
      for (const [name, value] of baseline) if (!flags.includes(name) && current.get(name) !== value) throw Error()
      for (const [name, value] of current) if (!flags.includes(name) && baseline.get(name) !== value) throw Error()
      return new Map(flags.map(name => [name, mutable.get(name) ?? false]))
    } catch { fail('WINDOW_FLAGS_RECONCILIATION_REQUIRED') }
  }
  const equal = (left, right) => flags.every(name => left.get(name) === right.get(name))
  async function change(name, value, next) {
    await assertExclusive()
    // Record the attempt before a write can lose its ACK. No automatic retry.
    touched.add(name)
    let ackLost = false
    try { await writeFlag(name, value) } catch { ackLost = true }
    await assertExclusive()
    const observed = await observe()
    if (!equal(observed, next)) fail('WINDOW_FLAGS_CHANGE_NOT_CONFIRMED')
    expected = new Map(next)
    return ackLost
  }
  return Object.freeze({
    async enable() {
      if (enableUsed || closing || closeUsed) fail('WINDOW_FLAGS_ENABLE_REENTRY_REJECTED')
      enableUsed = true
      enabling = true
      try {
        await assertExclusive()
        await assertOwnerAndWindow()
        if (!equal(await observe(), expected)) fail('WINDOW_FLAGS_BASELINE_CHANGED')
        for (const name of flags) {
          await assertOwnerAndWindow()
          if (!equal(await observe(), expected)) fail('WINDOW_FLAGS_BASELINE_CHANGED')
          const next = new Map(expected); next.set(name, true)
          if (await change(name, true, next)) recoveredEnableAcks++
        }
        return Object.freeze({ preparationFlagsEnabled: true, recoveredEnableAcks })
      } finally { enabling = false }
    },
    async close() {
      if (enabling || closing || closeUsed) fail('WINDOW_FLAGS_CLOSE_REENTRY_REJECTED')
      closeUsed = true
      closing = true
      try {
        await assertExclusive()
        const current = await observe()
        // Never claim an unexpected, untouched enabled flag belongs to this run.
        for (const name of flags) if (current.get(name) && !touched.has(name)) fail('WINDOW_FLAGS_FOREIGN_CHANGE')
        expected = current
        for (const name of [...flags].reverse()) {
          await assertExclusive()
          if (!equal(await observe(), expected)) fail('WINDOW_FLAGS_BASELINE_CHANGED')
          if (!expected.get(name)) continue
          const next = new Map(expected); next.set(name, false)
          if (await change(name, false, next)) recoveredCloseAcks++
        }
        if (!equal(await observe(), new Map(flags.map(name => [name, false])))) fail('WINDOW_FLAGS_CLOSE_NOT_CONFIRMED')
        return Object.freeze({ flagsClosed: true, recoveredCloseAcks })
      } finally { closing = false }
    },
    async verifyClosed() {
      await assertExclusive()
      if (!equal(await observe(), new Map(flags.map(name => [name, false])))) fail('WINDOW_FLAGS_CLOSE_NOT_CONFIRMED')
      return true
    },
  })
}
