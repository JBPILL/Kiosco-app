// @vitest-environment node
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, it, vi } from 'vitest'
import { diagnoseFiscalManagementReadonly } from '../../scripts/diagnose-fiscal-management-readonly.mjs'
import { custodySecretNames } from '../../scripts/fiscal-custody-plan.mjs'
const token = 'sbp_fcSYNTHETIC_NOT_A_REAL_TOKEN'
const keyId = 'b14101fb-ba80-4d3f-a102-d2f8c96f3072'
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
function rows() {
  return custodySecretNames('9a4916d1-b6b5-499f-98ef-9f6cf79510be', keyId).map(name => ({ name,
    value: sha(name.endsWith('_REVISION') ? '1' : name.endsWith('_ACTIVE_KEY_ID') ? keyId : 'SYNTHETIC_ONLY') }))
}
it('makes exactly one pinned GET and checks metadata without opening anything or echoing data', async () => {
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    expect(url).toBe('https://api.supabase.com/v1/projects/acoyfwwmhaeruciyedri/secrets')
    expect(options?.method).toBe('GET'); expect(options?.body).toBeUndefined(); expect(options?.redirect).toBe('error')
    return Response.json(rows())
  })
  expect(await diagnoseFiscalManagementReadonly(token, { fetcher })).toBe('MGMT_READONLY_PASS status=200 names=6 flags_closed=true original_read=false write_attempted=false')
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it.each([401,403,429])('reports only the safe HTTP %s category with no retry or response echo', async status => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ private: 'SYNTHETIC_DO_NOT_ECHO' }, { status }))
  const result = await diagnoseFiscalManagementReadonly(token, { fetcher })
  expect(result).toContain('reason=HTTP_' + status); expect(result).not.toContain('SYNTHETIC')
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('distinguishes an accepted HTTP response from rejected metadata', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json([{ ...rows()[0], unsafe: 'SYNTHETIC_DO_NOT_ECHO' }]))
  expect(await diagnoseFiscalManagementReadonly(token, { fetcher })).toContain('reason=METADATA_REJECTED')
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('distinguishes custody binding failure without revealing its value', async () => {
  const data = rows(); data.at(-1)!.value = sha('SYNTHETIC_OTHER_SELECTOR')
  expect(await diagnoseFiscalManagementReadonly(token, { fetcher: async () => Response.json(data) })).toContain('reason=CUSTODY_REJECTED')
})
it('rejects invalid tokens before network and sanitizes network failures', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => { throw Error('SYNTHETIC_PRIVATE_ERROR') })
  expect(await diagnoseFiscalManagementReadonly('not-a-token', { fetcher })).toContain('reason=TOKEN_FORMAT')
  expect(fetcher).not.toHaveBeenCalled()
  expect(await diagnoseFiscalManagementReadonly(token, { fetcher })).toContain('reason=NETWORK_OR_TLS')
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('rejects CLI arguments containing credentials without printing them or making network calls', () => {
  const result = spawnSync(process.execPath, [resolve('scripts/diagnose-fiscal-management-readonly.mjs'), 'SYNTHETIC_DO_NOT_ECHO'], { encoding: 'utf8', timeout: 30000 })
  expect(result.status).toBe(1); expect(result.stdout).toContain('reason=ENTRY')
  expect(result.stdout).not.toContain('SYNTHETIC')
}, 40000)
it('parses the private PowerShell wrapper without executing prompts', () => {
  const path = resolve('scripts/diagnosticar-acceso-fiscal-staging.ps1').replaceAll("'", "''")
  const command = "$t=$null;$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('" + path + "',[ref]$t,[ref]$e);if($e.Count){exit 1};[Console]::Out.Write('PARSE_PASS')"
  const result = spawnSync('pwsh', ['-NoProfile','-NonInteractive','-Command',command], { encoding: 'utf8', timeout: 30000, windowsHide: true })
  expect(result.status).toBe(0); expect(result.stdout).toBe('PARSE_PASS')
}, 40000)
