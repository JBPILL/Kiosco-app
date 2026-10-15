#!/usr/bin/env node
/**
 * F6.2D offline contract utility plus local-only synthetic and approved-zero-row
 * destination rehearsals. Remote source-data import remains disabled.
 */
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeImportLocal, validateC2Artifacts } from './f6-2d-c2-importer.mjs';
import { evaluateDemoOnlyZeroRowCutover, validateExportContract, validateExportPackage } from './f6-2d-c3a-exporter.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bootstrap = path.join(root, 'supabase', 'bootstrap');
const contractPath = path.join(bootstrap, 'contract', 'data-migration.json');
const manifestPath = path.join(bootstrap, 'manifest.json');

function fail(message) {
  console.error(`BLOCKED: ${message}`);
  process.exitCode = 2;
}

async function loadJson(file) {
  return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
}

async function checkBootstrap() {
  const manifest = await loadJson(manifestPath);
  const contract = await loadJson(contractPath);
  const problems = [];
  for (const item of manifest.files) {
    const file = path.resolve(bootstrap, item.path);
    if (!file.startsWith(`${bootstrap}${path.sep}`)) {
      problems.push(`${item.path}: path escapes bootstrap`);
      continue;
    }
    let bytes;
    try {
      bytes = await readFile(file);
    } catch {
      problems.push(`${item.path}: missing`);
      continue;
    }
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== item.sha256) problems.push(`${item.path}: SHA-256 mismatch`);
  }
  const sqlFiles = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('.sql')) sqlFiles.push(path.relative(bootstrap, full));
    }
  }
  await walk(bootstrap);
  const listed = new Set(manifest.files.map((item) => item.path.replaceAll('\\', '/')));
  const contractSidecars = new Set(['preflight.sql', 'postflight.sql']);
  for (const sql of sqlFiles) {
    if (!listed.has(sql.replaceAll('\\', '/')) && !contractSidecars.has(path.basename(sql))) {
      problems.push(`${sql}: SQL missing from manifest`);
    }
  }
  const classifiedTables = new Set([
    ...contract.tables.map((table) => table.name),
    ...contract.excludedTables,
    ...contract.reinitialize,
  ]);
  const declaredTables = new Set();
  for (const sql of sqlFiles) {
    const source = await readFile(path.join(bootstrap, sql), 'utf8');
    for (const match of source.matchAll(/\bCREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+public\.([a-z_][a-z0-9_]*)/gi)) {
      declaredTables.add(match[1].toLowerCase());
    }
  }
  for (const table of declaredTables) {
    if (!classifiedTables.has(table)) problems.push(`${table}: bootstrap table has no migration disposition`);
  }
  for (const table of classifiedTables) {
    if (!declaredTables.has(table)) problems.push(`${table}: disposition does not match a bootstrap table`);
  }
  if (problems.length) {
    problems.forEach((problem) => console.error(`- ${problem}`));
    fail('bootstrap manifest is not reproducible');
    return;
  }
  console.log(`PASS: ${manifest.files.length} SQL files match manifest; ${declaredTables.size} bootstrap tables are classified.`);
}

async function showPlan() {
  const contract = await loadJson(contractPath);
  for (const table of [...contract.tables].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))) {
    console.log(`${String(table.order).padStart(2, '0')}  ${table.name}  ${table.class}`);
  }
  console.log(`\n${contract.status}`);
  console.log('No export, transformation, import, database access, or remote action is performed.');
  console.log('The legacy source map and entity-level reconciliation must be approved first.');
}

async function validateC2(mode) {
  const summary = await validateC2Artifacts();
  console.log(`PASS: ${mode}; ${summary.sqlFiles} manifest SQL files, ${summary.preImportFiles} pre-import files, ${summary.postImportFiles} post-import files; ${summary.fixtureRows} synthetic rows across ${summary.kiosks} kiosks.`);
  console.log('No legacy data or hosted Supabase project is accessed.');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function stableJson(value) { return `${JSON.stringify(stable(value), null, 2)}\n`; }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`${name} is required for local cutover validation.`);
  return process.argv[index + 1];
}

async function validateDemoOnlyZeroRowCutover() {
  const [mapping, migration] = await Promise.all([loadJson(path.join(bootstrap, 'contract', 'source-destination-mapping.json')), loadJson(contractPath)]);
  const reviewed = migration.cutoverPolicy?.reviewedMigrationSet;
  if (!reviewed) throw new Error('Demo-only zero-row policy has no reviewed migration-set record.');
  const paths = {
    approvedRowIds: option('--approved-row-ids'),
    candidateDraft: option('--candidates'),
    baseline: option('--baseline'),
    packageDirectory: option('--package'),
    foreignKeyInventory: option('--fk-inventory'),
    candidateEnrichment: option('--enrichment'),
    foreignKeySql: option('--fk-sql'),
    candidateEnrichmentSql: option('--enrichment-sql'),
  };
  const [classification, candidates, baseline, manifest, approvedBytes, candidateBytes, baselineBytes, manifestBytes, fkBytes, enrichmentBytes, fkSqlBytes, enrichmentSqlBytes] = await Promise.all([
    loadJson(paths.approvedRowIds), loadJson(paths.candidateDraft), loadJson(paths.baseline),
    loadJson(path.join(paths.packageDirectory, 'manifest.json')),
    readFile(paths.approvedRowIds), readFile(paths.candidateDraft), readFile(paths.baseline),
    readFile(path.join(paths.packageDirectory, 'manifest.json')), readFile(paths.foreignKeyInventory), readFile(paths.candidateEnrichment),
    readFile(paths.foreignKeySql), readFile(paths.candidateEnrichmentSql),
  ]);
  const actualArtifactHashes = {
    approvedRowIds: sha256(approvedBytes), candidateDraft: sha256(candidateBytes), baseline: sha256(baselineBytes),
    packageManifest: sha256(manifestBytes), foreignKeyInventory: sha256(fkBytes), candidateEnrichment: sha256(enrichmentBytes),
    foreignKeySql: sha256(fkSqlBytes), candidateEnrichmentSql: sha256(enrichmentSqlBytes),
  };
  const expectedHashKeys = Object.keys(actualArtifactHashes).sort();
  const approvedHashKeys = Object.keys(reviewed.approvedArtifactSha256 ?? {}).sort();
  const artifactHashesMatch = JSON.stringify(expectedHashKeys) === JSON.stringify(approvedHashKeys)
    && Object.entries(reviewed.approvedArtifactSha256).every(([key, expected]) => /^[a-f0-9]{64}$/.test(expected) && actualArtifactHashes[key] === expected);
  const packageNames = (await readdir(paths.packageDirectory)).sort();
  const listedPackageNames = [...(manifest.files ?? []).map((item) => item.file), 'manifest.json'].sort();
  const packageFiles = {};
  for (const item of manifest.files ?? []) {
    if (typeof item.file !== 'string' || item.file !== path.basename(item.file)) throw new Error('Package manifest contains an unsafe file name.');
    packageFiles[item.file] = await readFile(path.join(paths.packageDirectory, item.file), 'utf8');
  }
  const exportContract = validateExportContract(mapping, migration);
  let packageReconciled = false;
  try {
    packageReconciled = JSON.stringify(packageNames) === JSON.stringify(listedPackageNames)
      && validateExportPackage({ manifest, files: packageFiles }, exportContract, classification).totalMigrableRows === 0;
  } catch { packageReconciled = false; }
  const candidateTableNames = Object.keys(candidates.tables ?? {}).sort();
  const approvedTableNames = Object.keys(classification.tables ?? {}).sort();
  let candidateCoverageComplete = JSON.stringify(candidateTableNames) === JSON.stringify(approvedTableNames);
  let candidatePositions = 0;
  const distinctCandidateIds = new Set();
  let includeRows = 0;
  let excludeRows = 0;
  let unresolvedRows = 0;
  const recognizedProvenance = new Set(['EXACT_SIGNATURE', 'MANUAL_OWNER_CONFIRMED_DEMO', 'MANUAL_OWNER_CONFIRMED_DEMO_CASCADE']);
  let provenanceComplete = true;
  const kioskExcluded = new Set(Object.keys(classification.tables?.kioscos?.exclude ?? {}));
  let allCandidateKiosksExcluded = classification.tables?.kioscos?.includeIds?.length === 0
    && (classification.tables?.kioscos?.candidateIds?.length ?? -1) === (classification.tables?.kioscos?.candidateIds ?? []).filter((id) => kioskExcluded.has(id)).length;
  for (const table of candidateTableNames) {
    const sourceIds = candidates.tables[table]?.candidateIds ?? [];
    const approved = classification.tables[table];
    const approvedIds = approved?.candidateIds ?? [];
    const includeIds = approved?.includeIds ?? [];
    const excluded = approved?.exclude ?? {};
    const excludedIds = Object.keys(excluded);
    candidatePositions += sourceIds.length;
    sourceIds.forEach((id) => distinctCandidateIds.add(id));
    includeRows += includeIds.length;
    excludeRows += excludedIds.length;
    if (new Set(sourceIds).size !== sourceIds.length || JSON.stringify([...sourceIds].sort()) !== JSON.stringify([...approvedIds].sort())) candidateCoverageComplete = false;
    const disposed = new Set([...includeIds, ...excludedIds]);
    unresolvedRows += sourceIds.filter((id) => !disposed.has(id)).length;
    if (includeIds.some((id) => !sourceIds.includes(id)) || excludedIds.some((id) => !sourceIds.includes(id)) || disposed.size !== sourceIds.length) candidateCoverageComplete = false;
    for (const reason of Object.values(excluded)) if (!recognizedProvenance.has(reason?.reason)) provenanceComplete = false;
  }
  for (const id of kioskExcluded) if (!recognizedProvenance.has(classification.tables.kioscos.exclude[id]?.reason)) provenanceComplete = false;
  const openSessionRows = (manifest.baseline_11_metrics ?? []).filter((row) => row.metric === 'sesiones_caja_abiertas_blocker');
  const openSessionTenantsExcluded = openSessionRows.length === reviewed.blockers.openSessions
    && openSessionRows.reduce((total, row) => total + Number(row.row_count), 0) === reviewed.blockers.openSessions
    && openSessionRows.every((row) => row.kiosco_id && kioskExcluded.has(row.kiosco_id));
  const fkText = fkBytes.toString('utf8');
  const enrichmentText = enrichmentBytes.toString('utf8');
  const fkSql = fkSqlBytes.toString('utf8');
  const enrichmentSql = enrichmentSqlBytes.toString('utf8');
  const hasReadOnlyProtocol = (sql) => /^(?:\uFEFF)?BEGIN\s+ISOLATION\s+LEVEL\s+REPEATABLE\s+READ\s+READ\s+ONLY\s*;/im.test(sql)
    && /\bSHOW\s+transaction_read_only/i.test(sql)
    && /\bROLLBACK\s*;/i.test(sql)
    && !/\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO)\b/i.test(sql)
    && !/\bSELECT\s+\*/i.test(sql);
  const enrichmentGuardValid = /SHOW\s+transaction_read_only\s+\\gset/i.test(enrichmentSql)
    && /\\if\s+:transaction_read_only/i.test(enrichmentSql)
    && /\\else[\s\S]*?(?:BLOCKED|ROLLBACK)/i.test(enrichmentSql);
  const fkEvidenceValid = hasReadOnlyProtocol(fkSql) && /^BEGIN\s/m.test(fkText) && /transaction_read_only[\s\S]*\bon\b/.test(fkText)
    && /\(52 rows\)/.test(fkText) && /ROLLBACK\s*$/.test(fkText)
    && /ventas_sesion_caja_id_fkey\s*\|\s*ventas\s*\|\s*sesion_caja_id\s*\|\s*sesiones_caja\s*\|\s*id/.test(fkText)
    && /movimientos_caja_sesion_caja_id_fkey\s*\|\s*movimientos_caja\s*\|\s*sesion_caja_id\s*\|\s*sesiones_caja\s*\|\s*id/.test(fkText);
  const enrichmentEvidenceValid = hasReadOnlyProtocol(enrichmentSql) && enrichmentGuardValid && /^BEGIN\s/m.test(enrichmentText)
    && /\(942 rows\)/.test(enrichmentText) && /ROLLBACK\s*$/.test(enrichmentText);
  const block11Checksum = sha256(stableJson(classification.block11Rows));
  const block03Checksum = sha256(stableJson(classification.block03Counts));
  const baselineMatches = classification.baselineStatus === 'PRE_CUTOVER_REVIEWED'
    && JSON.stringify(stable(classification.block03Counts)) === JSON.stringify(stable(baseline.block03Counts))
    && JSON.stringify(stable(classification.block03Counts)) === JSON.stringify(stable(manifest.baseline_03_counts))
    && JSON.stringify(stable(manifest.source_row_counts)) === JSON.stringify(stable(baseline.block03Counts))
    && JSON.stringify(stable(classification.block11Rows)) === JSON.stringify(stable(baseline.block11Rows))
    && JSON.stringify(stable(classification.block11Rows)) === JSON.stringify(stable(manifest.baseline_11_metrics))
    && classification.block11Sha256 === block11Checksum && manifest.block11_baseline_sha256 === block11Checksum
    && manifest.block03_baseline_counts_sha256 === block03Checksum && block03Checksum === reviewed.block03Sha256;
  const fingerprintMatches = classification.sourceSchemaFingerprint === candidates.sourceSchemaFingerprint
    && classification.sourceSchemaFingerprint === manifest.source_schema_fingerprint
    && classification.sourceSchemaFingerprint === reviewed.sourceSchemaFingerprint;
  const checksumsMatch = artifactHashesMatch && manifest.content_sha256 === reviewed.packageContentSha256
    && classification.block11Sha256 === reviewed.block11Sha256 && baselineMatches;
  const blockers = {
    openSessions: Number(manifest.pending_open_cash_sessions),
    linkedSales: Number(manifest.pending_sales_linked_to_open_cash),
    linkedCashMovements: Number(manifest.pending_cash_movements_linked_to_open_sessions),
  };
  const conditions = {
    allCandidateKiosksExcluded: allCandidateKiosksExcluded && Number(manifest.source_row_counts.kioscos) === reviewed.sourceKiosks,
    zeroIncludedRows: includeRows === 0 && reviewed.include === 0,
    zeroUnresolvedRows: unresolvedRows === 0 && reviewed.unresolved === 0,
    classificationApproved: classification.classificationStatus === 'APPROVED' && classification.contractVersion === reviewed.exportContractVersion
      && candidates.classificationStatus === 'PENDING_MANUAL_REVIEW' && candidates.classificationSchemaVersion === reviewed.classificationSchemaVersion,
    candidateCoverageComplete: candidateCoverageComplete && candidatePositions === reviewed.candidatePositions
      && distinctCandidateIds.size === reviewed.distinctCandidateIds && Object.keys(candidates.tables).length === reviewed.candidateGroups,
    kioskProvenanceApproved: provenanceComplete && excludeRows === reviewed.exclude && Object.entries(reviewed.exclusionReasonCounts).every(([reason, count]) => Object.values(classification.tables).reduce((total, table) => total + Object.values(table.exclude ?? {}).filter((entry) => entry.reason === reason).length, 0) === count),
    packageReconciled: packageReconciled && manifest.PRE_CUTOVER === true && manifest.contract_version === reviewed.exportContractVersion,
    zeroMigrableRows: Number(manifest.total_migrable_rows) === 0 && reviewed.totalMigrableRows === 0,
    allBlockersBelongToExcludedKiosks: openSessionTenantsExcluded && reviewed.relationshipEvidence.blockersBelongToExcludedKiosks === true,
    noMigrableBlockerDependents: includeRows === 0 && Number(manifest.total_migrable_rows) === 0 && reviewed.relationshipEvidence.noMigrableDependentRows === true,
    zeroOrphans: fkEvidenceValid && reviewed.relationshipEvidence.foreignKeyCount === 52 && reviewed.relationshipEvidence.orphanCount === 0,
    zeroCrossKiosk: enrichmentEvidenceValid && reviewed.relationshipEvidence.crossKioskCount === 0,
    sourceSchemaMatches: fingerprintMatches,
    checksumsMatch,
  };
  const result = evaluateDemoOnlyZeroRowCutover({ conditions, blockers, expectedBlockers: reviewed.blockers });
  console.log(JSON.stringify({ ...result, conditions, evidence: { candidatePositions, includeRows, excludeRows, unresolvedRows, openSessionTenantsExcluded, packageFiles: packageNames.length, packageContentSha256: manifest.content_sha256 } }, null, 2));
  if (result.cutoverClass !== 'DEMO_ONLY_ZERO_ROW_CUTOVER_NOT_APPLICABLE') process.exitCode = 2;
  return result;
}

const command = process.argv[2];
try {
  if (command === 'check-bootstrap') await checkBootstrap();
  else if (command === 'plan') await showPlan();
  else if (command === 'DRY_RUN' || command === 'VALIDATE_ONLY') await validateC2(command);
  else if (command === 'VALIDATE_DEMO_ONLY_ZERO_ROW_CUTOVER') await validateDemoOnlyZeroRowCutover();
  else if (command === 'IMPORT_ZERO_ROW_PACKAGE_LOCAL') {
    const cutover = await validateDemoOnlyZeroRowCutover();
    if (cutover.cutoverClass !== 'DEMO_ONLY_ZERO_ROW_CUTOVER_NOT_APPLICABLE') throw new Error('Zero-row local import is blocked unless the reviewed demo-only cutover validator passes.');
    const packageDirectory = option('--package');
    const result = await executeImportLocal(process.env.F6_LOCAL_DATABASE_URL, { target: 'local', zeroRowPackageDirectory: packageDirectory });
    console.log('PASS: approved zero-row package rehearsal on local Supabase only.');
    console.log(JSON.stringify(result, null, 2));
  }
  else if (command === 'IMPORT_LOCAL') {
    if (!process.argv.includes('--target') || process.argv[process.argv.indexOf('--target') + 1] !== 'local') {
      throw new Error('IMPORT_LOCAL requires explicit --target local.');
    }
    const result = await executeImportLocal(process.env.F6_LOCAL_DATABASE_URL, { target: 'local' });
    console.log('PASS: synthetic local import and reconciliation.');
    console.log(JSON.stringify(result, null, 2));
  }
  else {
    console.log('Usage: node scripts/f6-2d-migration.mjs <plan|check-bootstrap|DRY_RUN|VALIDATE_ONLY|IMPORT_LOCAL --target local|VALIDATE_DEMO_ONLY_ZERO_ROW_CUTOVER --approved-row-ids <file> --candidates <file> --baseline <file> --package <directory> --fk-inventory <file> --enrichment <file> --fk-sql <file> --enrichment-sql <file>|IMPORT_ZERO_ROW_PACKAGE_LOCAL --target local --package <directory> --approved-row-ids <file> --candidates <file> --baseline <file> --fk-inventory <file> --enrichment <file> --fk-sql <file> --enrichment-sql <file>>');
    console.log('IMPORT_LOCAL reads F6_LOCAL_DATABASE_URL and accepts loopback 127.0.0.1:54322 only.');
  }
} catch (error) {
  fail(error instanceof Error ? error.message : 'unexpected error');
}
