// @vitest-environment node
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { expect, it, vi } from 'vitest'
import { createCustodyProvisionPlan, custodyPlanHash } from '../../scripts/fiscal-custody-plan.mjs'
const runtime = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: runtime.spawn }))
import { preparePrivateCustodyDelivery } from '../../scripts/arca/private-custody-delivery.mjs'

it.each([
  ['EPERM', 'PROCESS_DENIED'], ['EACCES', 'PROCESS_DENIED'],
  ['ENOENT', 'PROCESS_MISSING'], ['OTHER', 'PROCESS_UNAVAILABLE'],
])('reports synchronous %s without private diagnostics or retry', async (code, stage) => {
  runtime.spawn.mockReset().mockImplementation(() => { throw Object.assign(Error('DO_NOT_EXPOSE_PRIVATE_PATH'), { code }) })
  const plan = createCustodyProvisionPlan({ certificateSha256: 'a'.repeat(64), certificateCuit: '20123456786' })
  await expect(preparePrivateCustodyDelivery({ plan, approvedHash: custodyPlanHash(plan), baseline: [],
    paths: { certificatePath: 'NEVER_READ', encryptedKeyPath: 'NEVER_READ', protectionPath: 'NEVER_READ' },
  })).rejects.toThrow('FISCAL_PRIVATE_DELIVERY_NOT_CONFIRMED:' + stage)
  expect(runtime.spawn).toHaveBeenCalledTimes(1)
})

it('reports asynchronous process denial without private stderr or retry', async () => {
  runtime.spawn.mockReset().mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() })
    queueMicrotask(() => {
      child.stderr.write('DO_NOT_EXPOSE_PRIVATE_DIAGNOSTIC')
      child.emit('error', Object.assign(Error('DO_NOT_EXPOSE_PRIVATE_PATH'), { code: 'EPERM' }))
      child.emit('close', -1)
    })
    return child
  })
  const plan = createCustodyProvisionPlan({ certificateSha256: 'a'.repeat(64), certificateCuit: '20123456786' })
  await expect(preparePrivateCustodyDelivery({ plan, approvedHash: custodyPlanHash(plan), baseline: [],
    paths: { certificatePath: 'NEVER_READ', encryptedKeyPath: 'NEVER_READ', protectionPath: 'NEVER_READ' },
  })).rejects.toThrow('FISCAL_PRIVATE_DELIVERY_NOT_CONFIRMED:PROCESS_DENIED')
  expect(runtime.spawn).toHaveBeenCalledTimes(1)
})
