// @vitest-environment node
import { createHash } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { createPreparationFlags } from '../../scripts/fiscal-preparation-flags.mjs'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const backend = 'ARCA_HOMO_BACKEND_ENABLED', data = 'ARCA_HOMO_DATA_PREPARATION_ENABLED', preparation = 'ARCA_HOMO_PREPARATION_ENABLED'
function fixture() {
  const inventory = new Map([['ARCA_HOMO_TA_ACTIVE_KEY_ID', hash('synthetic')], [backend, hash('false')]])
  const readInventory = vi.fn(async () => [...inventory].map(([name, digest]) => ({ name, digest })))
  const writeFlag = vi.fn(async (name: string, value: boolean) => { inventory.set(name, hash(String(value))) })
  const assertExclusive = vi.fn(async () => undefined), assertOwnerAndWindow = vi.fn(async () => undefined)
  const controller = createPreparationFlags({ baselineInventory: [...inventory].map(([name, digest]) => ({ name, digest })), readInventory, writeFlag, assertExclusive, assertOwnerAndWindow })
  return { inventory, readInventory, writeFlag, assertExclusive, assertOwnerAndWindow, controller }
}
it('enables only the three approved flags and closes in reverse order before SQL can be declared safe', async () => {
  const f = fixture()
  await expect(f.controller.verifyClosed()).resolves.toBe(true)
  expect(await f.controller.enable()).toEqual({ preparationFlagsEnabled: true, recoveredEnableAcks: 0 })
  await expect(f.controller.verifyClosed()).rejects.toThrow('WINDOW_FLAGS_CLOSE_NOT_CONFIRMED')
  expect(await f.controller.close()).toEqual({ flagsClosed: true, recoveredCloseAcks: 0 })
  await expect(f.controller.verifyClosed()).resolves.toBe(true)
  expect(f.writeFlag.mock.calls).toEqual([[backend, true], [data, true], [preparation, true], [preparation, false], [data, false], [backend, false]])
})
it('recovers a lost flag ACK by metadata read, without repeating the write', async () => {
  const f = fixture()
  f.writeFlag.mockImplementation(async (name, value) => { f.inventory.set(name, hash(String(value))); throw Error('lost ACK') })
  expect(await f.controller.enable()).toEqual({ preparationFlagsEnabled: true, recoveredEnableAcks: 3 })
  expect(await f.controller.close()).toEqual({ flagsClosed: true, recoveredCloseAcks: 3 })
  expect(f.writeFlag).toHaveBeenCalledTimes(6)
})
it('does not retry an unconfirmed write and closes only its attempted enablement', async () => {
  const f = fixture()
  f.writeFlag.mockImplementation(async name => { if (name === data) throw Error('write did not commit'); f.inventory.set(name, hash('true')) })
  await expect(f.controller.enable()).rejects.toThrow('WINDOW_FLAGS_CHANGE_NOT_CONFIRMED')
  await expect(f.controller.enable()).rejects.toThrow('WINDOW_FLAGS_ENABLE_REENTRY_REJECTED')
  f.writeFlag.mockImplementation(async (name, value) => { f.inventory.set(name, hash(String(value))) })
  await f.controller.close()
  expect(f.writeFlag.mock.calls).toEqual([[backend, true], [data, true], [backend, false]])
})
it.each(['credential-drift', 'extra-secret', 'emission-open', 'unknown-flag'])('stops %s before writing', async mode => {
  const f = fixture()
  if (mode === 'credential-drift') f.inventory.set('ARCA_HOMO_TA_ACTIVE_KEY_ID', hash('changed'))
  if (mode === 'extra-secret') f.inventory.set('OTHER_SECRET', hash('new'))
  if (mode === 'emission-open') f.inventory.set('ARCA_HOMO_EMISSION_ENABLED', hash('true'))
  if (mode === 'unknown-flag') f.inventory.set('ARCA_HOMO_UNREVIEWED_ENABLED', hash('false'))
  await expect(f.controller.enable()).rejects.toThrow('WINDOW_FLAGS_RECONCILIATION_REQUIRED')
  expect(f.writeFlag).not.toHaveBeenCalled()
})
it('rejects an initially unexpected allowed flag without claiming it during cleanup', async () => {
  const f = fixture(); f.inventory.set(preparation, hash('true'))
  await expect(f.controller.enable()).rejects.toThrow('WINDOW_FLAGS_BASELINE_CHANGED')
  await expect(f.controller.close()).rejects.toThrow('WINDOW_FLAGS_FOREIGN_CHANGE')
  expect(f.writeFlag).not.toHaveBeenCalled()
})
it('closes after Owner revocation without requiring that revoked Owner to regain authority', async () => {
  const f = fixture(); await f.controller.enable()
  f.assertOwnerAndWindow.mockRejectedValue(Error('Owner revoked'))
  await f.controller.close()
  await expect(f.controller.verifyClosed()).resolves.toBe(true)
})
it('does not close a different session after losing exclusive ownership', async () => {
  const f = fixture(); await f.controller.enable()
  f.assertExclusive.mockRejectedValue(Error('WINDOW_SESSION_OWNERSHIP_LOST'))
  await expect(f.controller.close()).rejects.toThrow('WINDOW_SESSION_OWNERSHIP_LOST')
  expect(f.writeFlag).toHaveBeenCalledTimes(3)
})
it('reports cleanup failure without a blind second close attempt', async () => {
  const f = fixture(); await f.controller.enable()
  f.writeFlag.mockImplementation(async () => { throw Error('write uncertain') })
  await expect(f.controller.close()).rejects.toThrow('WINDOW_FLAGS_CHANGE_NOT_CONFIRMED')
  await expect(f.controller.close()).rejects.toThrow('WINDOW_FLAGS_CLOSE_REENTRY_REJECTED')
  await expect(f.controller.verifyClosed()).rejects.toThrow('WINDOW_FLAGS_CLOSE_NOT_CONFIRMED')
})
