#!/usr/bin/env node
/** Offline proposal only: public WSFE evidence -> one disabled catalog revision. */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const target = 'acoyfwwmhaeruciyedri'
const origin = 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx'
const hash = value => createHash('sha256').update(value).digest('hex')
const fail = code => { throw new Error(code) }
const description = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 120
  && ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
const literal = text => `'${text.replaceAll("'", "''")}'`
const exact = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('CATALOG_SHAPE')
}
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|\+00:00)$/.test(value)
    || !Number.isFinite(Date.parse(value))) fail('CATALOG_TIME')
  const epoch = Date.parse(value)
  if (new Date(epoch).toISOString().slice(0, 19) !== value.slice(0, 19)) fail('CATALOG_TIME')
  return epoch
}
function day(value) {
  if (typeof value !== 'string' || !/^\d{8}$/.test(value)) fail('CATALOG_DATE')
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  const epoch = Date.parse(`${iso}T00:00:00Z`)
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0, 10) !== iso) fail('CATALOG_DATE')
  return value
}
const businessDay = epoch => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(epoch)
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('')
}
function evidence(text, checksum, operation, now) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 1048576 || !/^[0-9a-f]{64}$/.test(checksum)
    || hash(text) !== checksum) fail('CATALOG_CHECKSUM')
  let data
  try { data = JSON.parse(text) } catch { return fail('CATALOG_JSON') }
  exact(data, ['version', 'entorno', 'operacion', 'origen', 'consultado_en', 'respuesta_sha256', 'parametros', 'importado_en_staging', 'emision_habilitada'])
  if (data.version !== 1 || data.entorno !== 'HOMOLOGACION' || data.origen !== origin || data.operacion !== operation
    || data.importado_en_staging !== false || data.emision_habilitada !== false || !/^[0-9a-f]{64}$/.test(data.respuesta_sha256)
    || !Array.isArray(data.parametros) || data.parametros.length < 1 || data.parametros.length > 100) fail('CATALOG_SOURCE')
  const consulted = instant(data.consultado_en)
  if (consulted > now || now - consulted >= 86400000) fail('CATALOG_STALE')
  for (const row of data.parametros) {
    exact(row, ['Id', 'Description', 'VoucherClasses', 'ValidFrom', 'ValidUntil'])
    if (!Number.isSafeInteger(row.Id) || row.Id < 1 || row.Id > 99 || typeof row.Description !== 'string'
      || !description(row.Description)) fail('CATALOG_ROW')
  }
  return { data, consulted, checksum }
}

function reviewedBaseline(text, checksum) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 1048576 || !/^[0-9a-f]{64}$/.test(checksum)
    || hash(text) !== checksum) fail('CATALOG_BASELINE_CHECKSUM')
  let rows
  try { rows = JSON.parse(text) } catch { return fail('CATALOG_BASELINE_JSON') }
  if (!Array.isArray(rows) || rows.length > 100) fail('CATALOG_BASELINE_SHAPE')
  for (const row of rows) {
    exact(row, ['revision', 'condiciones', 'alicuotas', 'fuente_sha256', 'consultado_en', 'vence_en', 'habilitado'])
    if (!Number.isSafeInteger(row.revision) || row.revision < 1 || row.revision > 2147483647 || typeof row.habilitado !== 'boolean'
      || !/^[0-9a-f]{64}$/.test(row.fuente_sha256) || instant(row.vence_en) <= instant(row.consultado_en)) fail('CATALOG_BASELINE_ROW')
    for (const [name, minimum] of [['condiciones', 1], ['alicuotas', 0]]) {
      if (!Array.isArray(row[name]) || row[name].length < minimum || row[name].length > 100) fail('CATALOG_BASELINE_ROW')
      for (const item of row[name]) {
        exact(item, name === 'condiciones' ? ['id', 'descripcion', 'comprobantes'] : ['id', 'descripcion'])
        if (!Number.isSafeInteger(item.id) || item.id < 1 || item.id > 99 || !description(item.descripcion)) fail('CATALOG_BASELINE_ROW')
        if (name === 'condiciones' && (!Array.isArray(item.comprobantes) || item.comprobantes.length < 1 || item.comprobantes.length > 100
          || item.comprobantes.some(value => !Number.isSafeInteger(value) || value < 1 || value > 999)
          || new Set(item.comprobantes).size !== item.comprobantes.length)) fail('CATALOG_BASELINE_ROW')
      }
      if (new Set(row[name].map(item => item.id)).size !== row[name].length) fail('CATALOG_BASELINE_ROW')
    }
  }
  if (new Set(rows.map(row => row.revision)).size !== rows.length) fail('CATALOG_BASELINE_DUPLICATE')
  return rows
}

/** Caller supplies reviewed file hashes, clock, revision and expiry explicitly. No network or writes. */
export function planFiscalParameters(input) {
  const renewal = !!input && (Object.hasOwn(input, 'baselineText') || Object.hasOwn(input, 'baselineSha256'))
  exact(input, ['projectRef', 'ivaText', 'conditionText', 'ivaSha256', 'conditionSha256', 'now', 'expiresAt', 'revision',
    ...(renewal ? ['baselineText', 'baselineSha256'] : [])])
  if (input.projectRef !== target) fail('CATALOG_STAGING_ONLY')
  if (!Number.isSafeInteger(input.revision) || input.revision < 1 || input.revision > 2147483647) fail('CATALOG_REVISION')
  const baseline = renewal ? reviewedBaseline(input.baselineText, input.baselineSha256) : []
  if (input.revision !== Math.max(0, ...baseline.map(row => row.revision)) + 1) fail('CATALOG_NEXT_REVISION')
  const now = instant(input.now), expires = instant(input.expiresAt)
  const iva = evidence(input.ivaText, input.ivaSha256, 'FEParamGetTiposIva', now)
  const conditions = evidence(input.conditionText, input.conditionSha256, 'FEParamGetCondicionIvaReceptor', now)
  const consulted = Math.min(iva.consulted, conditions.consulted), effective = businessDay(now)
  if (baseline.some(row => consulted <= instant(row.consultado_en))) fail('CATALOG_BASELINE_NEWER')
  if (expires <= now || expires > consulted + 86400000 || businessDay(expires - 1) !== effective) fail('CATALOG_EXPIRY')
  const rates = iva.data.parametros.map(row => {
    if (row.VoucherClasses !== '' || row.ValidFrom === 'NULL') fail('CATALOG_RATE_DATES')
    const from = day(row.ValidFrom), until = row.ValidUntil === 'NULL' ? null : day(row.ValidUntil)
    if (until && until < from) fail('CATALOG_RATE_DATES')
    return { row, active: from <= effective && (!until || until >= effective) }
  })
  if (new Set(rates.map(item => item.row.Id)).size !== rates.length) fail('CATALOG_DUPLICATE')
  const alicuotas = rates.filter(item => item.active).map(({ row }) => ({ id: row.Id, descripcion: row.Description })).sort((a, b) => a.id - b.id)
  if (!alicuotas.length) fail('CATALOG_NO_ACTIVE_RATES')
  const map = { A: 1, B: 6, C: 11 }, known = new Set(['A', 'ALEY', 'B', 'C', '49'])
  const grouped = conditions.data.parametros.reduce((prior, row) => {
    if (row.ValidFrom !== '' || row.ValidUntil !== '' || typeof row.VoucherClasses !== 'string') fail('CATALOG_CONDITION')
    const classes = row.VoucherClasses.split('/').map(value => value.trim())
    if (!classes.length || classes.some(value => !known.has(value)) || new Set(classes).size !== classes.length) fail('CATALOG_UNKNOWN_CLASS')
    const old = prior.get(row.Id)
    if (old && (old.descripcion !== row.Description || classes.some(value => old.classes.includes(value)))) fail('CATALOG_DUPLICATE')
    return new Map([...prior, [row.Id, { id: row.Id, descripcion: row.Description, classes: [...(old?.classes ?? []), ...classes] }]])
  }, new Map())
  const normalized = [...grouped.values()].sort((a, b) => a.id - b.id)
  const condiciones = normalized.map(row => ({ id: row.id, descripcion: row.descripcion,
    comprobantes: row.classes.filter(value => Object.hasOwn(map, value)).map(value => map[value]).sort((a, b) => a - b) })).filter(row => row.comprobantes.length)
  if (!condiciones.length) fail('CATALOG_NO_PILOT_CONDITIONS')
  const provenance = { iva: { file_sha256: iva.checksum, response_sha256: iva.data.respuesta_sha256, consulted_at: iva.data.consultado_en },
    conditions: { file_sha256: conditions.checksum, response_sha256: conditions.data.respuesta_sha256, consulted_at: conditions.data.consultado_en } }
  const sourceHash = hash(JSON.stringify(provenance))
  if (baseline.some(row => row.fuente_sha256 === sourceHash)) fail('CATALOG_SOURCE_ALREADY_RECORDED')
  const proposal = { version: 1, projectRef: target, revision: input.revision, condiciones, alicuotas, fuente_sha256: sourceHash,
    consultado_en: new Date(consulted).toISOString(), vence_en: new Date(expires).toISOString(), habilitado: false }
  const planHash = hash(JSON.stringify(renewal ? { proposal, baseline_sha256: input.baselineSha256 } : proposal))
  const manifest = { ...proposal, plan_sha256: planHash, prepared_at: new Date(now).toISOString(), effective_day: effective, provenance,
    excluded_classes: [...new Set(normalized.flatMap(row => row.classes.filter(value => !Object.hasOwn(map, value))))].sort(),
    excluded_rate_ids: rates.filter(item => !item.active).map(item => item.row.Id).sort((a, b) => a - b),
    sql_executed: false, issuer_provisioned: false, emission_enabled: false,
    ...(renewal ? { baseline_sha256: input.baselineSha256, baseline_revisions: baseline.map(row => row.revision).sort((a, b) => a - b) } : {}) }
  const baselineGuard = renewal ? `IF (SELECT count(*) FROM public.fiscal_parametros_homologacion)<>${baseline.length}
 OR EXISTS(SELECT 1 FROM jsonb_populate_recordset(NULL::public.fiscal_parametros_homologacion,${literal(input.baselineText)}::jsonb) expected
 LEFT JOIN public.fiscal_parametros_homologacion actual USING(revision)
 WHERE actual.revision IS NULL OR to_jsonb(actual) IS DISTINCT FROM to_jsonb(expected))
 THEN RAISE EXCEPTION 'CATALOG_BASELINE_CHANGED'; END IF;`
    : "IF EXISTS(SELECT 1 FROM public.fiscal_parametros_homologacion) THEN RAISE EXCEPTION 'CATALOG_BASELINE_CHANGED'; END IF;"
  const sql = `-- OFFLINE DRAFT: disabled catalog only. No issuer, permissions, keys, flags or emission.
-- Target Staging ${target}; explicit new GO and independent target verification required.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL standard_conforming_strings=on;
LOCK TABLE public.fiscal_parametros_homologacion IN SHARE ROW EXCLUSIVE MODE;
DO $catalog_guard$
BEGIN
 IF current_setting('kioskopos.catalog_target_ref',true) IS DISTINCT FROM '${target}'
 OR current_setting('kioskopos.approved_catalog_plan_sha256',true) IS DISTINCT FROM '${planHash}' THEN
 RAISE EXCEPTION 'CATALOG_GO_AND_TARGET_REQUIRED'; END IF;
 IF clock_timestamp()<${literal(proposal.consultado_en)}::timestamptz OR clock_timestamp()>=${literal(proposal.vence_en)}::timestamptz THEN
 RAISE EXCEPTION 'CATALOG_PROPOSAL_EXPIRED'; END IF;
 ${baselineGuard}
END $catalog_guard$;
INSERT INTO public.fiscal_parametros_homologacion(revision,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,habilitado)
VALUES(${proposal.revision},${literal(JSON.stringify(condiciones))}::jsonb,${literal(JSON.stringify(alicuotas))}::jsonb,'${sourceHash}',${literal(proposal.consultado_en)}::timestamptz,${literal(proposal.vence_en)}::timestamptz,false);
COMMIT;
`
  return { manifest, sql }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) fail('CATALOG_USAGE_CONFIG_AND_NEW_DIRECTORY')
    const config = JSON.parse(readFileSync(path.resolve(process.argv[2]), 'utf8'))
    const renewal = config && (Object.hasOwn(config, 'baselinePath') || Object.hasOwn(config, 'baselineSha256'))
    exact(config, ['projectRef', 'ivaPath', 'conditionPath', 'ivaSha256', 'conditionSha256', 'expiresAt', 'revision',
      ...(renewal ? ['baselinePath', 'baselineSha256'] : [])])
    const { ivaPath, conditionPath, baselinePath, ...settings } = config
    const result = planFiscalParameters({ ...settings, ivaText: readFileSync(ivaPath, 'utf8'), conditionText: readFileSync(conditionPath, 'utf8'),
      ...(renewal ? { baselineText: readFileSync(baselinePath, 'utf8') } : {}), now: new Date().toISOString() })
    const destination = path.resolve(process.argv[3])
    mkdirSync(destination)
    writeFileSync(path.join(destination, 'catalogo-inactivo.sql'), result.sql, { flag: 'wx' })
    writeFileSync(path.join(destination, 'revision-publica.json'), JSON.stringify(result.manifest, null, 2), { flag: 'wx' })
    process.stdout.write(`CATALOG_DISABLED_PROPOSAL_READY plan_sha256=${result.manifest.plan_sha256} SQL_EXECUTED=false\n`)
  } catch {
    process.stderr.write('CATALOG_PROPOSAL_NOT_CONFIRMED. No connection or SQL execution performed.\n')
    process.exitCode = 1
  }
}
