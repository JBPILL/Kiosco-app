#!/usr/bin/env node
// Offline public metadata proposal only. No secret reader, DB client or HTTP.
import { createHash } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CUSTODY_PROJECT, validateCustodyProvisionPlan, validatePublicFiscalCuit } from './fiscal-custody-plan.mjs'

const fail = () => { throw Error('INACTIVE_ISSUER_PROPOSAL_REJECTED') }
const hash = value => createHash('sha256').update(value).digest('hex')
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
const checksum = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) return fail()
}
function instant(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) return fail()
  return Date.parse(value)
}
function publicJson(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 65536) return fail()
  try { return JSON.parse(text) } catch { return fail() }
}
export function planInactiveFiscalIssuer(input) {
  exact(input, ['projectRef', 'custodyPlanText', 'custodyPlanSha256', 'custodyEvidenceText', 'custodyEvidenceSha256', 'kioskId', 'ownerAuthId', 'cuitEmisor', 'puntoVenta', 'now', 'expiresAt'])
  if (input.projectRef !== CUSTODY_PROJECT || !uuid(input.kioskId) || !uuid(input.ownerAuthId)
    || !Number.isSafeInteger(input.puntoVenta) || input.puntoVenta < 1 || input.puntoVenta > 99998
    || !checksum(input.custodyPlanSha256) || !checksum(input.custodyEvidenceSha256)) return fail()
  const cuit = validatePublicFiscalCuit(input.cuitEmisor)
  const now = instant(input.now), expires = instant(input.expiresAt)
  const source = publicJson(input.custodyPlanText)
  exact(source, ['plan', 'planSha256'])
  if (source.planSha256 !== input.custodyPlanSha256) return fail()
  // Validate the installed plan as history, not as reusable permission to copy keys.
  const custody = validateCustodyProvisionPlan(source.plan, source.planSha256, instant(source.plan.createdAt))
  const evidence = publicJson(input.custodyEvidenceText)
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence) || hash(input.custodyEvidenceText) !== input.custodyEvidenceSha256) return fail()
  const observed = instant(evidence.metadataObservation?.observedAt)
  if (evidence.version !== 1 || evidence.projectRef !== CUSTODY_PROJECT || evidence.proposalSha256 !== source.planSha256
    || evidence.operatorMarker !== 'CUSTODY_PROVISION_METADATA_PASS count=6 flags_closed=true functional=false edge_check=REQUIRED'
    || evidence.closedProvisionMetadataPass !== true || evidence.hostedFunctionalCustodyProven !== false
    || evidence.hostedTaCacheProven !== false || evidence.arcaRequests !== 0 || evidence.newOriginalCompatibilityCheck !== false
    || evidence.metadataObservation.reviewedNamesPresent !== 6 || evidence.metadataObservation.priorCustomSecretsUnchanged !== true
    || evidence.metadataObservation.revisionDigestMatches !== true || evidence.metadataObservation.activeKeySelectorDigestMatches !== true
    || evidence.metadataObservation.fiscalFlagsClosed !== true || evidence.metadataObservation.secretValuesRevealed !== false
    || evidence.jwt?.checked !== true || evidence.edgeObservation?.status !== 503
    || evidence.edgeObservation.code !== 'HOMOLOGACION_NO_HABILITADA'
    || instant(custody.createdAt) > observed || observed > now
    || expires <= now || expires - now > 86400000) return fail()
  const proposal = {
    version: 1, projectRef: CUSTODY_PROJECT, mode: 'INITIAL_INACTIVE_ISSUER',
    kioskId: input.kioskId, ownerAuthId: input.ownerAuthId, cuitEmisor: cuit, puntoVenta: input.puntoVenta,
    credentialId: custody.credentialId, certificateSha256: custody.certificateSha256, revision: 1, enabled: false,
    custodyPlanSha256: source.planSha256, custodyEvidenceSha256: input.custodyEvidenceSha256,
    custodyMetadataObservedAt: evidence.metadataObservation.observedAt, liveTargetPreflightRequired: true,
    createdAt: input.now, expiresAt: input.expiresAt,
    sqlExecuted: false, representationVerified: false, voucherIssuanceAccepted: false, fiscalDataSelected: false,
  }
  const planHash = hash(JSON.stringify(proposal))
  const sql = `-- OFFLINE CANDIDATE: one inactive issuer, no activation or secret access.
-- Independently verify Staging host, backup and new human GO before execution.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL standard_conforming_strings=on;
SET LOCAL search_path=pg_catalog,public;
DO $issuer_guard$
DECLARE actor public.usuarios%ROWTYPE; comercio public.kioscos%ROWTYPE; rol text; inserted integer;
BEGIN
 IF current_user IS DISTINCT FROM 'postgres'
 OR current_setting('kioskopos.emitter_target_ref',true) IS DISTINCT FROM '${CUSTODY_PROJECT}'
 OR current_setting('kioskopos.approved_emitter_plan_sha256',true) IS DISTINCT FROM '${planHash}' THEN
 RAISE EXCEPTION 'ISSUER_GO_AND_TARGET_REQUIRED'; END IF;
 IF clock_timestamp()<'${proposal.createdAt}'::timestamptz OR clock_timestamp()>='${proposal.expiresAt}'::timestamptz THEN
 RAISE EXCEPTION 'ISSUER_PROPOSAL_EXPIRED'; END IF;
 BEGIN
  SELECT * INTO STRICT actor FROM public.usuarios WHERE auth_user_id='${proposal.ownerAuthId}'::uuid FOR SHARE;
 EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'ISSUER_OWNER_NOT_CONFIRMED'; END;
 IF actor.activo IS DISTINCT FROM true OR actor.rol IS DISTINCT FROM 'DUEÑO'
 OR actor.es_superadmin IS DISTINCT FROM false OR actor.kiosco_id IS DISTINCT FROM '${proposal.kioskId}'::uuid THEN
 RAISE EXCEPTION 'ISSUER_OWNER_NOT_CONFIRMED'; END IF;
 SELECT * INTO comercio FROM public.kioscos WHERE id='${proposal.kioskId}'::uuid FOR SHARE;
 IF NOT FOUND OR comercio.estado_suscripcion IS DISTINCT FROM 'ACTIVO' THEN RAISE EXCEPTION 'ISSUER_KIOSK_NOT_ACTIVE'; END IF;
 LOCK TABLE public.fiscal_emisores_homologacion IN SHARE ROW EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.fiscal_emisores_homologacion'::regclass
 AND relrowsecurity AND pg_get_userbyid(relowner)='postgres') THEN RAISE EXCEPTION 'ISSUER_TABLE_NOT_CLOSED'; END IF;
 FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(rol,'public.fiscal_emisores_homologacion','SELECT,INSERT,UPDATE,DELETE')
  OR has_any_column_privilege(rol,'public.fiscal_emisores_homologacion','SELECT,INSERT,UPDATE') THEN
  RAISE EXCEPTION 'ISSUER_TABLE_NOT_CLOSED'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.fiscal_emisores_homologacion WHERE kiosco_id='${proposal.kioskId}'::uuid
 OR credencial_id='${proposal.credentialId}'::uuid OR certificado_sha256='${proposal.certificateSha256}') THEN
 RAISE EXCEPTION 'ISSUER_BINDING_ALREADY_EXISTS'; END IF;
 INSERT INTO public.fiscal_emisores_homologacion(kiosco_id,cuit_emisor,punto_venta,credencial_id,certificado_sha256,revision,habilitado)
 VALUES('${proposal.kioskId}'::uuid,'${proposal.cuitEmisor}',${proposal.puntoVenta},'${proposal.credentialId}'::uuid,'${proposal.certificateSha256}',1,false);
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted<>1 OR NOT EXISTS(SELECT 1 FROM public.fiscal_emisores_homologacion WHERE kiosco_id='${proposal.kioskId}'::uuid
 AND cuit_emisor='${proposal.cuitEmisor}' AND punto_venta=${proposal.puntoVenta} AND credencial_id='${proposal.credentialId}'::uuid
 AND certificado_sha256='${proposal.certificateSha256}' AND revision=1 AND habilitado=false) THEN
 RAISE EXCEPTION 'ISSUER_INSERT_NOT_CONFIRMED'; END IF;
END $issuer_guard$;
COMMIT;
`
  return { manifest: { ...proposal, planSha256: planHash, sqlSha256: hash(sql) }, sql }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) fail()
    const config = publicJson(readFileSync(process.argv[2], 'utf8'))
    exact(config, ['projectRef', 'custodyPlanPath', 'custodyPlanSha256', 'custodyEvidencePath', 'custodyEvidenceSha256', 'kioskId', 'ownerAuthId', 'cuitEmisor', 'puntoVenta', 'expiresAt'])
    const { custodyPlanPath, custodyEvidencePath, ...settings } = config
    const result = planInactiveFiscalIssuer({ ...settings, now: new Date().toISOString(),
      custodyPlanText: readFileSync(custodyPlanPath, 'utf8'), custodyEvidenceText: readFileSync(custodyEvidencePath, 'utf8') })
    const destination = resolve(process.argv[3])
    mkdirSync(destination)
    writeFileSync(join(destination, 'emisor-inactivo.sql'), result.sql, { flag: 'wx' })
    writeFileSync(join(destination, 'revision-publica.json'), JSON.stringify(result.manifest, null, 2), { flag: 'wx' })
    console.log('INACTIVE_ISSUER_PROPOSAL_READY plan_sha256=' + result.manifest.planSha256 + ' sql_sha256=' + result.manifest.sqlSha256 + ' SQL_EXECUTED=false')
  } catch { console.error('INACTIVE_ISSUER_PROPOSAL_NOT_CONFIRMED. No network, private reads or SQL execution.'); process.exitCode = 1 }
}
