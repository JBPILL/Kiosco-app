// @vitest-environment node
import { randomUUID, createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, it, vi } from 'vitest'
import { positivePlanFixture } from './fixtures/fiscalPositivePlan'
import { buildPositiveWindowPackage, validatePositiveWindowPackage, POSITIVE_WINDOW_SCOPE } from '../../scripts/fiscal-positive-window-package.mjs'
import { executePrivateWindowPacket, type PrivateWindowPacket } from '../../scripts/fiscal-positive-window-private.mjs'
function cleanupSyntheticDirectory(folder: string, prefix: string) {
  if (dirname(resolve(folder)) !== resolve(tmpdir()) || !basename(folder).startsWith(prefix)) throw Error('Unexpected cleanup path')
  rmSync(folder, { recursive: true, force: true })
}
async function fixture() {
  const { config } = positivePlanFixture(), now = Date.parse(config.startsAt) + 1000
  const reference = { historySha256: 'c'.repeat(64), commercialSha256: 'd'.repeat(64), taKeyId: randomUUID() }
  const proposal = await buildPositiveWindowPackage({ config, ...reference })
  const packet: PrivateWindowPacket = { packageText: JSON.stringify(proposal), approvedPackageHash: proposal.packageSha256, authorizedScope: POSITIVE_WINDOW_SCOPE,
    exclusiveWriteConfirmed: true, journalPath: resolve(tmpdir(), 'synthetic-only/journal.jsonl'), rootCertificate: 'SYNTHETIC_PUBLIC_CA',
    credentials: { publicKey: 'sb_publishable_synthetic', email: 'synthetic@example.test', password: 'synthetic_password', postgresPassword: 'synthetic_db', managementToken: 'sbp_fcSYNTHETIC_ONLY_NOT_REAL' } }
  const client = Object.assign(new EventEmitter(), { query: async () => ({ rows: [] }), end: async () => undefined })
  const dispose = vi.fn(async () => undefined), connect = vi.fn(async (_input: { password: string; rootCertificate: string }) => ({ client, observer: client, dispose }))
  const database = vi.fn(async () => ({ projectRef: config.projectRef, planSha256: proposal.dataPlanSha256,
    assertClosedBaseline: async () => undefined,
    baselineMetadata: () => ({ historySha256: 'c'.repeat(64), commercialSha256: 'd'.repeat(64), observedAt: new Date(now).toISOString() }),
    executeOpen: async () => undefined,
    readOpenedReceipt: async () => ({ planSha256: proposal.dataPlanSha256, operationId: config.operationId, openedAt: '2026-10-28 15:10:01.123456+00' }),
    assertActiveBinding: async () => undefined, executeClose: async () => undefined, verifyPrepared: async () => undefined, verifyClosed: async () => undefined }))
  const management = vi.fn(() => ({ readInventory: async () => [], assertCustodyMetadata: async () => undefined, writeFlag: async () => undefined }))
  const execute = vi.fn(async () => ({ passed: true, cleanupConfirmed: true }))
  const dependencies = { now: () => now, checkDirectory: vi.fn(async () => undefined), connect, database, management, execute }
  return { config, reference, proposal, packet, dependencies, dispose }
}
it('pins config, SQL, read-only query, custody names and all private runtime source hashes in the public package', async () => {
  const f = await fixture()
  expect(await validatePositiveWindowPackage(f.proposal, f.proposal.packageSha256, { now: f.dependencies.now() })).toEqual(f.proposal)
  expect(f.proposal.secretNames).toHaveLength(6)
  expect(f.proposal.runtimeFiles['scripts/fiscal-positive-window-operator.mjs']).toMatch(/^[a-f0-9]{64}$/)
  expect(f.proposal.runtimeFiles['supabase/functions/_shared/fiscalHttp.ts']).toMatch(/^[a-f0-9]{64}$/)
  expect(f.proposal).toMatchObject({ requiresFreshPreflight: true, requiresExplicitGo: true, automaticApproval: false, emissionEnabled: false })
})
it('explicitly permits a fresh read-only anchor policy without treating missing values as reviewed hashes', async () => {
  const f = await fixture()
  const proposal = await buildPositiveWindowPackage({ config: f.config, historySha256: null, commercialSha256: null, taKeyId: f.reference.taKeyId })
  expect(proposal.baselinePolicy).toBe('CAPTURE_FRESH_CLOSED_READ_ONLY_BEFORE_OPEN')
  expect(await validatePositiveWindowPackage(proposal, proposal.packageSha256, { now: f.dependencies.now() })).toEqual(proposal)
  await expect(buildPositiveWindowPackage({ config: f.config, historySha256: null, commercialSha256: f.reference.commercialSha256, taKeyId: f.reference.taKeyId })).rejects.toThrow('PRIVATE_WINDOW_PACKAGE_NOT_CONFIRMED')
})
it.each(['sql','code','scope','operation','commercial','unknown-field'])('rejects %s package drift before any private connection', async mode => {
  const f = await fixture(), changed = { ...structuredClone(f.proposal), config: { ...f.proposal.config }, runtimeFiles: { ...f.proposal.runtimeFiles } }
  if (mode === 'sql') changed.activationSha256 = 'a'.repeat(64)
  if (mode === 'code') changed.runtimeFiles['scripts/fiscal-positive-window-operator.mjs'] = 'a'.repeat(64)
  if (mode === 'scope') changed.scope = 'EMISSION'
  if (mode === 'operation') changed.config.operationId = randomUUID()
  if (mode === 'commercial') changed.commercialSha256 = 'a'.repeat(64)
  if (mode === 'unknown-field') Object.assign(changed, { password: 'must not be accepted' })
  f.packet.packageText = JSON.stringify(changed)
  expect(await executePrivateWindowPacket(f.packet, f.dependencies)).toContain('stage=PACKET')
  expect(f.dependencies.connect).not.toHaveBeenCalled()
  expect(Object.values(f.packet.credentials).every(value => value === '')).toBe(true)
})
it.each(['no-go','not-exclusive','expired','before-start'])('rejects %s before directory/network activity', async mode => {
  const f = await fixture()
  if (mode === 'no-go') f.packet.authorizedScope = ''
  if (mode === 'not-exclusive') f.packet.exclusiveWriteConfirmed = false
  if (mode === 'expired') f.dependencies.now = () => Date.parse(f.config.endsAt)
  if (mode === 'before-start') f.dependencies.now = () => Date.parse(f.config.startsAt) - 1
  expect(await executePrivateWindowPacket(f.packet, f.dependencies)).toContain('stage=PACKET')
  expect(f.dependencies.checkDirectory).not.toHaveBeenCalled()
  expect(f.dependencies.connect).not.toHaveBeenCalled()
})
it('passes only private in-memory credentials to pinned adapters and emits a fixed sanitized marker', async () => {
  const f = await fixture()
  const output = await executePrivateWindowPacket(f.packet, f.dependencies)
  expect(output).toBe('WINDOW_OPERATOR_PASS flags_closed=true sql_closed=true logout_local=true backend503=true emission=false cae=0')
  expect(f.dependencies.connect.mock.calls[0][0]).toEqual({ password: 'synthetic_db', rootCertificate: 'SYNTHETIC_PUBLIC_CA' })
  expect(f.dispose).toHaveBeenCalledTimes(1)
  expect(Object.values(f.packet.credentials).every(value => value === '')).toBe(true)
  expect(output.includes('synthetic_db')).toBe(false)
})
it('does not report PASS if final private-client disposal fails', async () => {
  const f = await fixture(); f.dispose.mockRejectedValue(Error('private connection diagnostics'))
  expect(await executePrivateWindowPacket(f.packet, f.dependencies)).toBe('WINDOW_OPERATOR_NOT_CONFIRMED stage=DISPOSE cleanup_confirmed=false reconcile=true')
})
it('the CLI rejects credential argv/input misuse without executing an operator or echoing supplied text', () => {
  const result = spawnSync(process.execPath, [resolve('scripts/fiscal-positive-window-cli.mjs'), '--unexpected', 'SYNTHETIC_DO_NOT_ECHO'], { encoding: 'utf8', timeout: 30000 })
  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe('WINDOW_OPERATOR_NOT_CONFIRMED stage=ENTRY cleanup_confirmed=false reconcile=true')
  expect(result.stdout.includes('SYNTHETIC_DO_NOT_ECHO')).toBe(false)
}, 40000)
it('private PowerShell scripts parse without running credential prompts, network or filesystem provisioning', () => {
  const files = ['scripts/ejecutar-ventana-fiscal-privada.ps1','scripts/comprobar-directorio-ventana-privada.ps1']
  for (const path of files) {
    const command = '$tokens=$null;$problems=$null;[void][System.Management.Automation.Language.Parser]::ParseFile($args[0],[ref]$tokens,[ref]$problems);if($problems.Count){exit 1};[Console]::Out.Write("PARSE_PASS")'
    // Script path is public argv, never credential material or shell interpolation.
    const folder = mkdtempSync(join(tmpdir(), 'kiosko-window-parse-'))
    try {
      const helper = join(folder, 'parse.ps1'); writeFileSync(helper, command)
      const result = spawnSync('pwsh', ['-NoProfile','-NonInteractive','-File',helper,resolve(path)], { encoding: 'utf8', timeout: 30000, windowsHide: true })
      expect(result.status).toBe(0); expect(result.stdout).toBe('PARSE_PASS')
    } finally {
      cleanupSyntheticDirectory(folder, 'kiosko-window-parse-')
    }
  }
}, 70000)

it('public draft/PowerShell prepare run without credentials, preserve the UUID and refuse to overwrite the reviewed package', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'kiosko-window-public-'))
  try {
    const { config, snapshot } = positivePlanFixture(), current = Date.now(), start = current + 3600000
    config.startsAt = new Date(start).toISOString(); config.endsAt = new Date(start + 900000).toISOString()
    config.taNotBefore = new Date(current - 1000).toISOString(); snapshot.observed_at = new Date(current - 2000).toISOString()
    snapshot.catalog.consultado_en = new Date(current - 3000).toISOString(); snapshot.catalog.vence_en = new Date(start + 3600000).toISOString()
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(start)
    config.invoice.datos.fecha = ['year','month','day'].map(key => parts.find(part => part.type === key)?.value).join('')
    config.snapshotText = JSON.stringify(snapshot); config.snapshotSha256 = createHash('sha256').update(config.snapshotText).digest('hex')
    const snapshotPath = join(folder, 'snapshot.json'), configPath = join(folder, 'config.json'), referencesPath = join(folder, 'references.json'), output = join(folder, 'draft')
    writeFileSync(snapshotPath, config.snapshotText)
    const { snapshotText: _text, now: _now, ...settings } = config
    expect(_text).toBeTruthy(); expect(_now).toBeTruthy()
    writeFileSync(configPath, JSON.stringify({ ...settings, snapshotPath }))
    writeFileSync(referencesPath, JSON.stringify({ historySha256: 'c'.repeat(64), commercialSha256: 'd'.repeat(64), taKeyId: randomUUID() }))
    const args = [resolve('scripts/fiscal-positive-window-cli.mjs'), '--draft', configPath, referencesPath, output]
    const first = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30000 })
    expect(first.error).toBeUndefined(); expect(first.status).toBe(0); expect(first.stdout).toContain('remote_executed=false emission=false')
    const path = join(output, 'package.json'), before = readFileSync(path, 'utf8')
    expect(JSON.parse(before).config.operationId).toBe(config.operationId)
    const second = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30000 })
    expect(second.status).toBe(1); expect(readFileSync(path, 'utf8')).toBe(before)
    const prepared = spawnSync('pwsh', ['-NoProfile','-NonInteractive','-File',resolve('scripts/ejecutar-ventana-fiscal-privada.ps1'),'-Paquete',path,'-Preparar'], { encoding: 'utf8', timeout: 30000, windowsHide: true })
    expect(prepared.error).toBeUndefined(); expect(prepared.status).toBe(0)
    expect(prepared.stdout.trim()).toBe('WINDOW_OPERATOR_PREPARED private_read=false network=0 emission=false')
    const notAuthorized = spawnSync('pwsh', ['-NoProfile','-NonInteractive','-File',resolve('scripts/ejecutar-ventana-fiscal-privada.ps1'),'-Paquete',path,'-Ejecutar'], { encoding: 'utf8', timeout: 30000, windowsHide: true })
    expect(notAuthorized.status).toBe(1); expect(notAuthorized.stdout).toContain('stage=ENTRY cleanup_confirmed=false')
    expect(notAuthorized.stdout).not.toContain('Correo del Dueno')
  } finally {
    cleanupSyntheticDirectory(folder, 'kiosko-window-public-')
  }
}, 150000)
