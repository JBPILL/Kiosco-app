import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const EXPECTED_FULL_CHAIN_COUNT = 56

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function stripOuterTransaction(sqlText) {
  return sqlText.replace(/^\s*(BEGIN|COMMIT);\s*$/gmi, '')
}

function assertPrecedence(paths) {
  const indexOf = target => {
    const idx = paths.indexOf(target)
    if (idx < 0) throw new Error(`Missing required SQL in canonical chain: ${target}`)
    return idx
  }
  const rules = [
    ['supabase/bootstrap/900_final_security.sql', 'supabase/bootstrap/commercial/001_commercial_subscription.sql'],
    ['supabase/bootstrap/commercial/003_commerce_provisioning.sql', 'supabase/bootstrap/pilot-operations/001_capabilities.sql'],
    ['supabase/bootstrap/pilot-operations/001_capabilities.sql', 'supabase/bootstrap/envases/001_shared_ledger.sql'],
    ['supabase/bootstrap/envases/001_shared_ledger.sql', 'supabase/bootstrap/envases/002_checkout_receipts.sql'],
    ['supabase/bootstrap/envases/002_checkout_receipts.sql', 'supabase_fase_devolucion_registro_privado.sql'],
    ['supabase_fase_devolucion_registro_privado.sql', 'supabase_fase_devolucion_calculo_historico.sql'],
    ['supabase_fase_devolucion_calculo_historico.sql', 'supabase_fase_devolucion_preparacion_privada.sql'],
    ['supabase_fase_devolucion_preparacion_privada.sql', 'supabase/bootstrap/returns/001_atomic_cash_return.sql'],
    ['supabase/bootstrap/returns/001_atomic_cash_return.sql', 'supabase/bootstrap/returns/002_owner_envases_return.sql'],
    ['supabase/bootstrap/returns/002_owner_envases_return.sql', 'supabase/bootstrap/envases/003_pending_totals.sql'],
    ['supabase/bootstrap/envases/003_pending_totals.sql', 'supabase/bootstrap/returns/003_whole_unit_quantities.sql'],
  ]
  for (const [before, after] of rules) {
    if (indexOf(before) >= indexOf(after)) {
      throw new Error(`Invalid SQL ordering: ${before} must precede ${after}`)
    }
  }
}

export function loadAndVerifyFullSqlChain(repoRoot) {
  const bootstrapDir = path.join(repoRoot, 'supabase/bootstrap')
  const manifest = JSON.parse(readFileSync(path.join(bootstrapDir, 'manifest.json'), 'utf8'))
  const chain = manifest.fullSqlChain
  if (!Array.isArray(chain) || chain.length !== EXPECTED_FULL_CHAIN_COUNT) {
    throw new Error(`Canonical fullSqlChain must declare exactly ${EXPECTED_FULL_CHAIN_COUNT} SQL files.`)
  }
  const seenPaths = new Set()
  const verified = chain.map((entry, idx) => {
    if (entry.order !== idx + 1) throw new Error(`Out-of-sequence order at index ${idx}: ${entry.order}`)
    if (seenPaths.has(entry.path)) throw new Error(`Duplicate SQL path in fullSqlChain: ${entry.path}`)
    seenPaths.add(entry.path)
    const fullPath = path.join(repoRoot, entry.path)
    if (!existsSync(fullPath)) throw new Error(`Missing SQL file in fullSqlChain: ${entry.path}`)
    const bytes = readFileSync(fullPath)
    const actual = sha256Hex(bytes)
    if (actual !== entry.sha256) {
      throw new Error(`Checksum mismatch in fullSqlChain (${entry.path}): expected ${entry.sha256}, got ${actual}`)
    }
    return { ...entry, bytes }
  })

  assertPrecedence(verified.map(item => item.path))

  const expectedOptionalMap = [
    ...manifest.files,
    ...manifest.optionalModules.commercial.files,
    ...manifest.optionalModules.pilotOperations.files,
    ...manifest.optionalModules.envases.files,
    ...manifest.optionalModules.returnsPrerequisites.files,
    ...manifest.optionalModules.returns.files,
    ...manifest.optionalModules.finalIncrementals.files,
  ]
  for (const modFile of expectedOptionalMap) {
    const resolved = path.resolve(bootstrapDir, modFile.path)
    const rel = path.relative(repoRoot, resolved).split(path.sep).join('/')
    const match = verified.find(item => item.path === rel)
    if (!match || match.sha256 !== modFile.sha256) {
      throw new Error(`Module entry mismatch for ${modFile.path}`)
    }
  }

  return {
    manifest,
    fullChain: verified,
    postCommercialChain: verified.slice(46),
  }
}
