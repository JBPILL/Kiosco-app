// @vitest-environment node
// Full LOCAL component lifecycle with synthetic DB/HTTP adapters. This does not
// prove hosted custody/Auth or the not-yet-implemented production DB adapter.
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { expect, it, vi } from 'vitest'
import { positivePlanFixture } from './fixtures/fiscalPositivePlan'
import { planFiscalPreparationToggle } from '../../scripts/plan-fiscal-preparation-toggle.mjs'
import { authenticatePrivateOwner } from '../../scripts/fiscal-private-owner-session.mjs'
import { executePositiveWindow, type PositiveWindowPorts } from '../../scripts/fiscal-positive-window-operator.mjs'
import { requestFromPreparedFiscalData } from '../../supabase/functions/_shared/fiscalPreparation'
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const base = 'https://acoyfwwmhaeruciyedri.supabase.co'
const backend = 'ARCA_HOMO_BACKEND_ENABLED', preparation = 'ARCA_HOMO_PREPARATION_ENABLED'
async function fixture(mode = 'happy') {
  const { config, snapshot } = positivePlanFixture(), plan = await planFiscalPreparationToggle(config)
  const frozen = await requestFromPreparedFiscalData(plan.data.prepared, 41)
  const root = mkdtempSync(join(tmpdir(), 'kiosko-window-operator-'))
  const events: string[] = [], inventory = new Map([[backend, digest('false')], ['ARCA_HOMO_TA_ACTIVE_KEY_ID', digest('synthetic')]])
  const state = { opened: false, openedAt: null as string | null, phase: 'SIN_PREPARACION', profileActive: true,
    openCalls: 0, closeCalls: 0, saveCalls: 0, bodyCalls: 0, authCalls: 0, now: Date.parse(config.startsAt) + 1000 }
  const client = Object.assign(new EventEmitter(), {
    held: false,
    query: vi.fn(async (sql: string): Promise<{ rows: Record<string, unknown>[] }> => {
      if (sql.includes('pg_try_advisory_lock')) { client.held = true; return { rows: [{ acquired: true }] } }
      if (sql.includes('pg_advisory_unlock')) { client.held = false; events.push('release'); return { rows: [{ released: true }] } }
      return { rows: [{ actor: 'postgres', pid: 42, started: '2026-10-28 15:00:00.123456+00', held: client.held }] }
    }),
  })
  const jwt = [Buffer.from(JSON.stringify({ alg: 'ES256' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: config.ownerAuthId,
    iss: base + '/auth/v1', aud: 'authenticated', role: 'authenticated', iat: state.now / 1000, exp: state.now / 1000 + 3600 })).toString('base64url'), 'synthetic_signature'].join('.')
  const context = { version: 1, venta_id: snapshot.sale.id, total: snapshot.sale.total, cuit_emisor: snapshot.issuer.cuit_emisor, punto_venta: snapshot.issuer.punto_venta,
    incluye_recepcion_envases: false, revision_parametros: 2, condiciones: snapshot.catalog.condiciones, alicuotas: snapshot.catalog.alicuotas }
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const path = String(url)
    if (path.endsWith('/token?grant_type=password')) { state.authCalls++; return Response.json({ access_token: jwt }) }
    if (path.endsWith('/auth/v1/user')) return Response.json({ id: config.ownerAuthId })
    if (path.includes('/rest/v1/usuarios?')) return Response.json([{ auth_user_id: config.ownerAuthId, kiosco_id: config.kioskId, rol: 'DUEÑO', activo: state.profileActive, es_superadmin: false }])
    if (path.endsWith('/logout?scope=local')) { events.push('logout'); return new Response(null, { status: 204 }) }
    if (!path.endsWith('/functions/v1/arca-homologacion')) throw Error('Unexpected HTTP')
    if (inventory.get(backend) !== digest('true')) { events.push('backend503'); return Response.json({ codigo: 'HOMOLOGACION_NO_HABILITADA' }, { status: 503 }) }
    const command = JSON.parse(String(init?.body)), action = command.accion
    events.push('action:' + String(action))
    let result: unknown
    if (action === 'DATOS_FISCALES_VENTA') result = context
    else if (action === 'RESOLVER_VENTA') result = { venta_id: snapshot.sale.id, estado: state.phase,
      operacion_id: state.phase === 'SIN_PREPARACION' ? null : config.operationId,
      preparacion_sha256: state.phase === 'SIN_PREPARACION' ? null : plan.data.prepared.sha256, emision_habilitada: false }
    else if (action === 'GUARDAR_DATOS_FISCALES') {
      state.saveCalls++; state.phase = 'DATOS_PREPARADOS'; result = null
      if (mode === 'save-ack-loss') throw Error('Synthetic lost save ACK')
    } else if (action === 'PREPARAR_COMPROBANTE') {
      state.bodyCalls++
      if (mode === 'body-uncertain') throw Error('Synthetic WSAA uncertain')
      state.phase = 'RESERVADA'; result = null
      if (mode === 'body-ack-loss') throw Error('Synthetic lost body ACK')
    } else if (action === 'REVISAR_COMPROBANTE' && state.phase === 'RESERVADA') result = { operacion_id: config.operationId, estado: 'RESERVADA', revision: 1, solicitud: frozen, aprobacion: null }
    else return Response.json({ codigo: 'OPERACION_NO_CONFIRMADA' }, { status: 409 })
    return Response.json({ version: 1, entorno: 'HOMOLOGACION', emision_habilitada: false, resultado: result })
  })
  const ports: PositiveWindowPorts = {
    client, now: () => state.now,
    db: {
      projectRef: config.projectRef, planSha256: String(plan.data.manifest.planSha256),
      assertClosedBaseline: vi.fn(async () => {
        events.push('closed-baseline')
        if (state.opened || state.openedAt !== null || mode === 'baseline-drift') throw Error('Baseline drift')
      }),
      executeOpen: vi.fn(async sql => {
        expect(sql).toBe(plan.activationSql); state.openCalls++; events.push('sql-open')
        state.opened = true; state.openedAt = '2026-10-28 15:10:01.123456+00'
        if (mode === 'open-session-loss') { client.held = false; client.emit('end'); throw Error('Original session lost') }
        if (mode === 'open-ack-loss') throw Error('Synthetic lost open ACK')
      }),
      readOpenedReceipt: vi.fn(async () => {
        events.push('receipt-read')
        if (!state.opened || !state.openedAt) throw Error('Not opened')
        return { planSha256: String(plan.data.manifest.planSha256), operationId: config.operationId, openedAt: state.openedAt }
      }),
      assertActiveBinding: vi.fn(async receipt => {
        if (!state.opened || receipt.openedAt !== state.openedAt) throw Error('Binding changed')
      }),
      executeClose: vi.fn(async (sql, receipt) => {
        expect(sql).toBe(plan.closureSql); expect(receipt).toBe(state.openedAt)
        expect([...inventory].filter(([name]) => name.endsWith('_ENABLED')).every(([, value]) => value === digest('false'))).toBe(true)
        state.closeCalls++; events.push('sql-close')
        if (mode === 'close-fails') throw Error('Synthetic close drift')
        state.opened = false
        if (mode === 'close-ack-loss') throw Error('Synthetic lost close ACK')
      }),
      verifyPrepared: vi.fn(async summary => {
        expect(state.phase).toBe('RESERVADA'); expect(summary.requestSha256).toBe(frozen.sha256)
        if (mode === 'revoke-after-prepare') state.profileActive = false
        if (mode === 'expire-after-prepare') state.now = Date.parse(config.endsAt) + 1000
      }),
      verifyClosed: vi.fn(async receipt => { if (state.opened || receipt.openedAt !== state.openedAt) throw Error('Closure not confirmed'); events.push('closed-verified') }),
    },
    management: {
      readInventory: vi.fn(async () => [...inventory].map(([name, value]) => ({ name, digest: value }))),
      assertCustodyMetadata: vi.fn(async (rows: { name: string; digest: string }[]) => { if (!rows.some(row => row.name === 'ARCA_HOMO_TA_ACTIVE_KEY_ID')) throw Error('Missing metadata') }),
      writeFlag: vi.fn(async (name, value) => {
        events.push('flag:' + name + '=' + value)
        if (mode === 'cleanup-fails' && name === preparation && !value) throw Error('Synthetic cleanup uncertain')
        inventory.set(name, digest(String(value)))
        if (mode === 'flag-close-ack-loss' && !value) throw Error('Synthetic flag close ACK lost')
      }),
    },
    authenticateOwner: async approvedRequests => authenticatePrivateOwner({ email: 'synthetic@example.test', password: 'synthetic_password', publicKey: 'sb_publishable_synthetic',
      expectedOwnerAuthId: config.ownerAuthId, expectedKioskId: config.kioskId }, { fetcher, now: () => state.now, approvedRequests }),
    dispose: vi.fn(async () => { client.emit('end'); events.push('dispose') }),
  }
  const input = { config, approvedHash: String(plan.data.manifest.planSha256), authorizedScope: 'PRIMERA_VENTANA_POSITIVA_SIN_EMISION', journalPath: join(root, 'journal.jsonl') }
  const cleanup = () => {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('kiosko-window-operator-')) throw Error('Unexpected cleanup path')
    rmSync(root, { recursive: true, force: true })
  }
  return { input, ports, events, state, inventory, fetcher, cleanup }
}

it('executes the integrated local lifecycle and preserves the receipt/history after closure', async () => {
  const f = await fixture()
  try {
    const result = await executePositiveWindow(f.input, f.ports)
    expect(result).toMatchObject({ passed: true, cleanupConfirmed: true, preparationPassed: true, emissionExecuted: false, cae: 0, requiresReconciliation: false })
    expect(f.state).toMatchObject({ openCalls: 1, closeCalls: 1, saveCalls: 1, bodyCalls: 1, opened: false })
    expect(f.events.indexOf('flag:ARCA_HOMO_PREPARATION_ENABLED=false')).toBeLessThan(f.events.indexOf('sql-close'))
    expect(f.events.indexOf('sql-close')).toBeLessThan(f.events.indexOf('logout'))
    expect(f.events.lastIndexOf('logout')).toBeLessThan(f.events.lastIndexOf('backend503'))
    expect(f.events.lastIndexOf('backend503')).toBeLessThan(f.events.indexOf('release'))
    expect(readFileSync(f.input.journalPath, 'utf8')).toContain('2026-10-28 15:10:01.123456+00')
    expect(f.events.some(event => /ENVIAR|APROBAR|CONCILIAR|APLICAR/.test(event))).toBe(false)
  } finally { f.cleanup() }
})
it.each(['open-ack-loss','save-ack-loss','body-ack-loss','close-ack-loss','flag-close-ack-loss','revoke-after-prepare','expire-after-prepare'])('closes safely after %s without repeating an opening, preparation or closing write', async mode => {
  const f = await fixture(mode)
  try {
    expect(await executePositiveWindow(f.input, f.ports)).toMatchObject({ passed: true, cleanupConfirmed: true, requiresReconciliation: false })
    expect(f.state).toMatchObject({ openCalls: 1, closeCalls: 1, saveCalls: 1, bodyCalls: 1, opened: false })
  } finally { f.cleanup() }
})
it.each(['body-uncertain','close-fails','cleanup-fails','open-session-loss','baseline-drift'])('reports %s instead of pretending the window passed or retrying', async mode => {
  const f = await fixture(mode)
  try {
    const result = await executePositiveWindow(f.input, f.ports)
    expect(result.passed).toBe(false); expect(result.requiresReconciliation).toBe(true)
    expect(f.state.openCalls).toBeLessThanOrEqual(1); expect(f.state.closeCalls).toBeLessThanOrEqual(1); expect(f.state.bodyCalls).toBeLessThanOrEqual(1)
    if (mode === 'body-uncertain') expect(result.cleanupConfirmed).toBe(true)
    if (mode === 'cleanup-fails' || mode === 'open-session-loss') { expect(f.state.closeCalls).toBe(0); expect(result.sqlClosed).toBe(false) }
    if (mode === 'baseline-drift') { expect(f.state.openCalls).toBe(0); expect(f.state.authCalls).toBe(0) }
  } finally { f.cleanup() }
})
it('does not infer remote authorization from a package hash alone', async () => {
  const f = await fixture()
  try {
    await expect(executePositiveWindow({ ...f.input, authorizedScope: '' }, f.ports)).rejects.toThrow('WINDOW_OPERATOR_GO_REJECTED')
    expect(f.ports.client.query).not.toHaveBeenCalled()
  } finally { f.cleanup() }
})
