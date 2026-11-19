// Local PostgreSQL only, synthetic identities/data. Never mounts a real backup.
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'

const args = process.argv.slice(2)
if (args.length !== 3 || args[0] !== '--run-local' || args[1] !== '--evidence') throw Error('LOCAL_EXPLICIT_INVOCATION_REQUIRED')
const evidence = resolve(args[2]), root = resolve(import.meta.dirname, '../..')
if (!evidence.endsWith('.json') || existsSync(evidence)) throw Error('FRESH_EVIDENCE_REQUIRED')
const runId = randomUUID(), name = 'kiosko-backup-auth-' + runId.slice(0, 8)
const label = 'kioskopos.backup.test', image = 'postgres:17-alpine', gate = 19610429
const cases = [], children = new Set(), moduleHashes = {}
let created = false, stopped = false, stage = 'IMAGE', version = null, failed = false
const quote = value => "'" + String(value).replaceAll("'", "''") + "'"
const docker = (values, input) => execFileSync('docker', values, { encoding: 'utf8', input, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
const cli = ['exec', '-i', name, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'backup_auth_test']
const sql = value => docker(cli, "SET statement_timeout='15s';\n" + value)
const identity = auth => `SELECT set_config('request.jwt.claim.sub',${quote(auth)},false);SELECT set_config('request.jwt.claim.role','authenticated',false);SET ROLE authenticated;`
const delay = ms => new Promise(done => setTimeout(done, ms))
function session(application) {
  const process = spawn('docker', cli, { stdio: ['pipe', 'pipe', 'pipe'] })
  children.add(process)
  let out = '', err = ''
  process.stdout.setEncoding('utf8'); process.stderr.setEncoding('utf8')
  process.stdout.on('data', value => { out += value })
  process.stderr.on('data', value => { err += value })
  const done = new Promise(resolve => {
    process.on('error', () => resolve({ code: -1, out, err: 'PROCESS_ERROR' }))
    process.on('close', code => { children.delete(process); resolve({ code, out, err }) })
  })
  process.stdin.write(`SET application_name=${quote(application)};SET statement_timeout='15s';\n`)
  return { process, done, write(value) { process.stdin.write(value + '\n') }, finish(value = '') { process.stdin.end(value + '\n') }, output: () => out }
}
async function waitFor(check) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) { if (check()) return; await delay(50) }
  throw Error('CONTROLLED_BARRIER_NOT_OBSERVED')
}
const targets = [
  { name: 'clientes', data: { nombre: 'Synthetic customer', saldo_deudor: 135.25 }, type: 'contact' },
  { name: 'proveedores', data: { nombre: 'Synthetic provider', saldo_pendiente: 135.25 }, type: 'contact' },
  { name: 'productos', data: { descripcion: 'Synthetic article', precio_venta: 200, precio_costo: 50, stock_actual: 5, es_pesable: false, proveedor_id: null }, type: 'product' },
  { name: 'lotes_producto', data: { numero_lote: 'SYNTHETIC', fecha_vencimiento: '2027-01-01', cantidad_inicial: 5, cantidad_actual: 3, fecha_ingreso: '2026-10-01T10:00:00Z', activo: true }, type: 'batch' },
]
function call(fixture, operation = fixture.operation) {
  const data = quote(JSON.stringify(fixture.data)) + '::jsonb'
  if (fixture.target.type === 'contact') return `SELECT restaurar_contacto_backup(${quote(operation)},${quote(fixture.kid)},${quote(fixture.target.name)},${quote(fixture.record)},${data});`
  const method = fixture.target.type === 'product' ? 'restaurar_producto_backup' : 'restaurar_lote_backup'
  return `SELECT ${method}(${quote(operation)},${quote(fixture.kid)},${quote(fixture.record)},${data});`
}
function fixture(target) {
  const value = { target, kid: randomUUID(), owner: randomUUID(), oldAuth: randomUUID(), newAuth: randomUUID(), record: randomUUID(), operation: randomUUID(), data: { ...target.data } }
  sql(`INSERT INTO auth.users VALUES(${quote(value.oldAuth)}),(${quote(value.newAuth)});
    INSERT INTO kioscos(id,nombre) VALUES(${quote(value.kid)},'Synthetic backup');
    INSERT INTO usuarios(id,auth_user_id,kiosco_id,nombre,rol) VALUES(${quote(value.owner)},${quote(value.oldAuth)},${quote(value.kid)},'Synthetic owner','DUEÑO');`)
  if (target.type === 'batch') {
    const product = fixtureProduct(value)
    sql(identity(value.oldAuth) + call(product))
    value.data.producto_id = product.record
  }
  return value
}
function fixtureProduct(value) { return { ...value, target: targets[2], record: randomUUID(), operation: randomUUID(), data: { ...targets[2].data } } }
function rebind(value) { return `UPDATE usuarios SET auth_user_id=${quote(value.newAuth)} WHERE id=${quote(value.owner)};` }
function rejected(query, state) {
  let error
  try { sql('\\set VERBOSITY sqlstate\n' + query) } catch (caught) { error = caught }
  assert(error, 'EXPECTED_REJECTION')
  assert(String(error.stderr).includes(state), 'EXPECTED_SQLSTATE_' + state)
}
try {
  docker(['image', 'inspect', image, '--format', '{{.Id}}'])
  writeFileSync(evidence, JSON.stringify({ status: 'RUNNING', runId, containerName: name }, null, 2), { flag: 'wx' })
  stage = 'CREATE'
  docker(['run', '--detach', '--pull=never', '--network', 'none', '--name', name, '--label', label + '=' + runId,
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--env', 'POSTGRES_DB=backup_auth_test', image])
  created = true
  assert.equal(docker(['inspect', name, '--format', '{{.HostConfig.NetworkMode}}']), 'none')
  await waitFor(() => { try { return sql('SELECT 1') === '1' } catch { return false } })
  version = sql('SHOW server_version')
  assert(version.startsWith('17.'))
  stage = 'SCHEMA'
  sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;`)
  const base = join(root, 'supabase/bootstrap')
  for (const path of [join(base, '001_domain.sql'), join(base, '002_identity_helpers.sql'),
    ...readdirSync(join(base, 'steps')).sort().map(name => join(base, 'steps', name)), join(base, '900_final_security.sql')]) sql(readFileSync(path, 'utf8'))
  const moduleFiles = ['001_contacts_restore.sql', '002_inventory_restore.sql', '003_restore_capability.sql']
  for (const file of moduleFiles) {
    const source = readFileSync(join(root, 'supabase/pilot-backup', file), 'utf8')
    moduleHashes[file] = createHash('sha256').update(source).digest('hex')
    sql(source); sql(source)
  }
  sql(`CREATE FUNCTION backup_test_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.id::text=current_setting('kiosko.backup.gate_operation',true) THEN PERFORM pg_advisory_xact_lock(${gate});END IF;RETURN NEW;END $$;
    CREATE TRIGGER backup_test_gate BEFORE INSERT ON operaciones_escritura FOR EACH ROW EXECUTE FUNCTION backup_test_gate();`)
  for (const target of targets) {
    stage = target.name + ':CONCURRENT_REBIND'
    const value = fixture(target), keeper = session('backup-keeper'), writer = session('backup-writer'), editor = session('backup-editor')
    keeper.write(`SELECT pg_advisory_lock(${gate});SELECT 'KEEPER_READY';`)
    await waitFor(() => keeper.output().includes('KEEPER_READY'))
    writer.finish(`BEGIN;${identity(value.oldAuth)}SELECT set_config('kiosko.backup.gate_operation',${quote(value.operation)},true);${call(value)}COMMIT;`)
    await waitFor(() => sql("SELECT exists(SELECT 1 FROM pg_stat_activity WHERE application_name='backup-writer' AND wait_event='advisory')") === 't')
    editor.finish('BEGIN;' + rebind(value) + 'COMMIT;')
    await waitFor(() => sql("SELECT exists(SELECT 1 FROM pg_stat_activity WHERE application_name='backup-editor' AND wait_event_type='Lock')") === 't')
    keeper.finish(`SELECT pg_advisory_unlock(${gate});`)
    for (const client of [keeper, writer, editor]) { const result = await client.done; assert.equal(result.code, 0, 'CONTROLLED_SESSION_FAILED') }
    assert.equal(sql(`SELECT solicitud->>'actor_auth_id' FROM operaciones_escritura WHERE id=${quote(value.operation)}`), value.oldAuth)
    assert.equal(sql(`SELECT auth_user_id FROM usuarios WHERE id=${quote(value.owner)}`), value.newAuth)
    const before = sql(`SELECT md5(row_to_json(x)::text) FROM (SELECT solicitud,resultado FROM operaciones_escritura WHERE id=${quote(value.operation)}) x`)
    rejected(identity(value.newAuth) + call(value), '22023')
    assert.equal(sql(`SELECT md5(row_to_json(x)::text) FROM (SELECT solicitud,resultado FROM operaciones_escritura WHERE id=${quote(value.operation)}) x`), before)
    cases.push({ name: stage, passed: true, rebindingWaitedForProfileLock: true })

    stage = target.name + ':REBOUND_BEFORE_FIRST_CALL'
    const first = fixture(target)
    sql(rebind(first)); rejected(identity(first.oldAuth) + call(first), '42501')
    assert.equal(sql(`SELECT count(*) FROM operaciones_escritura WHERE id=${quote(first.operation)}`), '0')
    cases.push({ name: stage, passed: true })

    stage = target.name + ':LEGACY_AUTH_UNKNOWN'
    const legacy = randomUUID()
    sql(`INSERT INTO operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud,resultado)
      SELECT ${quote(legacy)},kiosco_id,usuario_id,tipo,solicitud-'actor_auth_id',resultado FROM operaciones_escritura WHERE id=${quote(value.operation)};`)
    rejected(identity(value.newAuth) + call(value, legacy), '22023')
    assert.equal(sql(`SELECT solicitud ? 'actor_auth_id' FROM operaciones_escritura WHERE id=${quote(legacy)}`), 'f')
    cases.push({ name: stage, passed: true })
  }
  assert.equal(cases.length, 12)
  writeFileSync(evidence, JSON.stringify({ status: 'PASS_PENDING_STOP', runId, version, cases, moduleHashes }, null, 2))
} catch { failed = true }
finally {
  for (const child of children) { child.stdin.destroy(); child.kill() }
  if (created) {
    try {
      assert.equal(docker(['inspect', name, '--format', '{{index .Config.Labels "' + label + '"}}']), runId)
      docker(['stop', '--time', '5', name])
      stopped = docker(['inspect', name, '--format', '{{.State.Running}}']) === 'false'
    } catch { stopped = false }
  }
  if (!stopped) failed = true
  const intermediate = existsSync(evidence) ? JSON.parse(readFileSync(evidence, 'utf8')) : {}
  const report = { ...intermediate, status: failed ? 'NOT_CONFIRMED' : 'PASS', stage, runId, version, cases, moduleHashes,
    containerName: name, ownContainerStopped: stopped, syntheticDataRetained: created, networkMode: 'none',
    baseline: 'bootstrap43_and_pilot_backup_only',
    realAuth: false, realArcaCalls: 0, emissions: 0, originalPrivateReads: 0, realBackupMounted: false }
  if (existsSync(evidence)) writeFileSync(evidence, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ status: report.status, cases: cases.length, ownContainerStopped: stopped, networkMode: 'none' }))
  process.exitCode = failed ? 1 : 0
}
