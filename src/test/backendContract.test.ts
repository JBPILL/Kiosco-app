import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, type Dirent } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { expect, it } from 'vitest'

const root = process.cwd()
const contractDir = join(root, 'supabase', 'bootstrap', 'contract')
type DependencyContract = {
  dynamicDependencies: Record<string, { relations?: string[]; rpcs?: string[] }>
  outOfScope: { relations: Record<string, unknown>; rpcs: Record<string, unknown>; edgeFunctions: Record<string, unknown> }
  storageBuckets: string[]
  auth: string[]
  strictPilotFlag: string
  transactionalCheckoutFlag: string
}
const contract = JSON.parse(readFileSync(join(contractDir, 'out-of-scope.json'), 'utf8')) as DependencyContract
const sourceRoot = join(root, 'src')
const bootstrapRoot = join(root, 'supabase', 'bootstrap')

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry: Dirent): string[] => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'test' ? [] : walk(path)
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name) ? [path] : []
  })
}

function sqlFiles() {
  return walkSql(bootstrapRoot)
}
function walkSql(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry: Dirent): string[] => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walkSql(path)
    return entry.name.endsWith('.sql') ? [path] : []
  })
}

function collect(pattern: RegExp, text: string): string[] {
  return [...text.matchAll(pattern)].map(match => match[1])
}

const sources = walk(sourceRoot).map(path => ({
  path: relative(root, path).split(sep).join('/'),
  text: readFileSync(path, 'utf8'),
}))
const relations = new Set<string>()
const rpcs = new Set<string>()
const edges = new Set<string>()
const buckets = new Set<string>()
const auth = new Set<string>()
const unresolvedDynamic: string[] = []

for (const source of sources) {
  for (const name of collect(/\.(?:from)\s*\(\s*['"`]([\w.]+)['"`]\s*\)/g, source.text)) relations.add(name)
  for (const name of collect(/\.rpc\s*\(\s*['"`]([\w.]+)['"`]\s*(?:,|\))/g, source.text)) rpcs.add(name)
  for (const name of collect(/\.functions\.invoke\s*\(\s*['"`]([\w.-]+)['"`]\s*(?:,|\))/g, source.text)) edges.add(name)
  for (const name of collect(/\.storage\.from\s*\(\s*['"`]([\w.-]+)['"`]\s*\)/g, source.text)) buckets.add(name)
  for (const name of collect(/\.auth\.([A-Za-z_$][\w$]*)\s*\(/g, source.text)) auth.add(name)
  if (/\bsupabase\.from\s*\(\s*[A-Za-z_$][\w$]*\s*\)/.test(source.text)) {
    const declared = contract.dynamicDependencies[source.path]
    if (!declared?.relations?.length) unresolvedDynamic.push(`${source.path}: dynamic .from()`)
    else declared.relations.forEach(name => relations.add(name))
  }
  if (/\bsupabase\.rpc\s*\(\s*[A-Za-z_$][\w$]*\s*,/.test(source.text)) {
    const declared = contract.dynamicDependencies[source.path]
    if (!declared?.rpcs?.length) unresolvedDynamic.push(`${source.path}: dynamic .rpc()`)
    else declared.rpcs.forEach(name => rpcs.add(name))
  }
}

const sql = sqlFiles().map(path => readFileSync(path, 'utf8')).join('\n')
const providedRelations = new Set(collect(/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][\w]*)/gi, sql).map(s => s.toLowerCase()))
const providedRpcs = new Set(collect(/\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z_][\w]*)\s*\(/gi, sql).map(s => s.toLowerCase()))
const providedEdges = new Set(readdirSync(join(root, 'supabase', 'functions'), { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name !== '_shared').map(entry => entry.name))
const outRelations = new Set<string>(Object.keys(contract.outOfScope.relations))
const outRpcs = new Set<string>(Object.keys(contract.outOfScope.rpcs))
const outEdges = new Set<string>(Object.keys(contract.outOfScope.edgeFunctions))
const missingRelations = [...relations].filter(name => !providedRelations.has(name.toLowerCase()) && !outRelations.has(name))
const missingRpcs = [...rpcs].filter(name => !providedRpcs.has(name.toLowerCase()) && !outRpcs.has(name))
const missingEdges = [...edges].filter(name => !providedEdges.has(name) && !outEdges.has(name))
const missingBuckets = [...buckets].filter(name => !contract.storageBuckets.includes(name))
const missingAuth = [...auth].filter(name => !contract.auth.includes(name))

it('classifies every Supabase dependency in active src code', () => {
  expect(unresolvedDynamic).toEqual([])
  expect({ missingRelations, missingRpcs, missingEdges, missingBuckets, missingAuth }).toEqual({
    missingRelations: [], missingRpcs: [], missingEdges: [], missingBuckets: [], missingAuth: [],
  })
})

it('keeps the explicit out-of-scope list covered by the strict pilot boundary', () => {
  expect(contract.strictPilotFlag).toBe('VITE_KIOSKO_PILOT_STRICT_SCOPE=true')
  expect(contract.transactionalCheckoutFlag).toBe('VITE_CHECKOUT_MANUAL_TRANSACCIONAL=true')
  expect(Object.keys(contract.outOfScope.relations).length).toBeGreaterThan(0)
  expect(Object.keys(contract.outOfScope.rpcs).length).toBeGreaterThan(0)
})

it('classifies every write flow and keeps Auth provisioning server-side with compensation', () => {
  const access = JSON.parse(readFileSync(join(contractDir, 'write-access.json'), 'utf8')) as {
    strictBlockers: unknown[]
    policies: { flow: string; mode: string; browserDml?: boolean; blockers?: string[]; strictBlockers?: boolean; strictGuard?: string; strictEntrypoint?: string; strategy?: string; entrypoint?: string; directWriteInventory?: { path: string; occurrences: number; mode: string; strictEntrypoint?: string; strictGuard?: string; strictGuardPath?: string }[] }[]
  }
  const allowedModes = new Set(['SAFE_RPC', 'SAFE_EDGE', 'LEGACY_ONLY', 'OUT_OF_SCOPE'])
  expect(access.policies.every(policy => allowedModes.has(policy.mode))).toBe(true)
  expect(access.policies.some(policy => policy.mode === 'UNRESOLVED')).toBe(false)
  expect(access.strictBlockers).toEqual([])
  for (const policy of access.policies) {
    if (policy.mode === 'SAFE_RPC' || policy.mode === 'SAFE_EDGE') expect(policy.browserDml).toBe(false)
    if (policy.mode === 'OUT_OF_SCOPE') expect((policy.strictGuard ?? policy.entrypoint)?.length).toBeGreaterThan(0)
  }
  const provisioning = readFileSync(join(root, 'supabase', 'functions', 'provision-user', 'index.ts'), 'utf8')
  expect(provisioning).toContain('auth.admin.createUser')
  expect(provisioning).toContain('auth.admin.deleteUser')
  expect(provisioning).toContain('getUser(token)')
  expect(provisioning).not.toMatch(/user_metadata\s*:/)
  expect(provisioning).toContain("actor.rol !== 'DUEÑO' && !actor.es_superadmin")
  expect(provisioning).toContain("body.rol !== 'CAJERO' && body.rol !== 'VISOR'")
  expect(provisioning).toContain('es_superadmin: false')
  expect(provisioning).not.toMatch(/action:\s*['"](?:create_superadmin|create_owner|initial_platform_admin)['"]|rol:\s*['"]SUPERADMIN['"]/i)
  const stock = access.policies.find(policy => policy.flow === 'stock operations')
  expect(stock).toBeDefined()
  const inventory = stock?.directWriteInventory ?? []
  expect(inventory.every(entry => allowedModes.has(entry.mode))).toBe(true)
  for (const entry of inventory) {
    const source = readFileSync(join(root, entry.strictGuardPath ?? entry.path), 'utf8')
    if (entry.mode === 'LEGACY_ONLY') {
      expect(entry.strictEntrypoint || entry.strictGuard, entry.path).toBeTruthy()
      expect(source, entry.path).toContain('kioskoPilotStrictScopeActivo')
    }
    if (entry.mode === 'OUT_OF_SCOPE') {
      expect(entry.strictGuard, entry.path).toBeTruthy()
      expect(source, entry.path).toContain('kioskoPilotStrictScopeActivo')
    }
  }
  const adminRoute = readFileSync(join(root, 'src', 'App.tsx'), 'utf8')
  expect(adminRoute).toContain('function RutaSuperAdmin')
  expect(adminRoute).not.toContain('mensajeRecursosComercialesFueraDeAlcance(kioskoPilotStrictScopeActivo())')
    expect(adminRoute).toContain('!usuario || !usuario.es_superadmin')
  const backupRestore = readFileSync(join(root, 'src', 'components', 'config', 'RestaurarBackupModal.tsx'), 'utf8')
  expect(backupRestore).toContain('La restauración integral queda fuera del alcance del piloto estricto.')
  const discovered = sources.flatMap(source => {
    const count = [...source.text.matchAll(/\.from\(\s*['"`](?:productos|lotes_producto|movimientos_stock)['"`]\s*\)[\s\S]{0,500}?\.(?:insert|update|upsert)\s*\(/g)].length
    return count ? [{ path: source.path, occurrences: count }] : []
  }).sort((a, b) => a.path.localeCompare(b.path))
  expect(inventory.map(({ path, occurrences }) => ({ path, occurrences })).sort((a, b) => a.path.localeCompare(b.path))).toEqual(discovered)
})

it('provides a stable inventory summary for review', () => {
  expect([...relations].sort().length).toBeGreaterThan(0)
  expect([...rpcs].sort()).toContain('registrar_movimiento_stock_idempotente')
  expect([...edges].sort()).toContain('checkout-manual')
  expect([...buckets]).toEqual([])
})








it('keeps phased bootstrap order, import window, and SHA-256 checksums versioned', () => {
  const manifest = JSON.parse(readFileSync(join(bootstrapRoot, 'manifest.json'), 'utf8')) as { version: number; profile: string; expectedProjectRef: string | null; importWindowAfter: string; postImportFiles: string[]; files: { path: string; sha256: string }[] }
  const orderedPaths = [
    '001_domain.sql', '002_identity_helpers.sql',
    ...readdirSync(join(bootstrapRoot, 'steps')).filter(name => name.endsWith('.sql')).sort().map(name => `steps/${name}`),
    '900_final_security.sql',
  ]
  expect(manifest.version).toBe(2)
  expect(manifest.profile).toBe('ONE_SHOT_EMPTY_DB')
  expect(manifest.expectedProjectRef).toBeNull()
  expect(manifest.files.map(file => file.path)).toEqual(orderedPaths)
  expect(manifest.files).toHaveLength(43)
  expect(manifest.importWindowAfter).toBe('steps/041_catalog_support_write_hardening.sql')
  expect(orderedPaths.indexOf(manifest.importWindowAfter) + 1).toBe(41)
  expect(orderedPaths.slice(orderedPaths.indexOf(manifest.importWindowAfter) + 1)).toEqual(manifest.postImportFiles)
  expect(manifest.postImportFiles).toHaveLength(2)
  expect(manifest.postImportFiles).toEqual(['steps/042_post_import_triggers.sql', '900_final_security.sql'])
  for (const file of manifest.files) {
    const actual = createHash('sha256').update(readFileSync(join(bootstrapRoot, file.path))).digest('hex')
    expect(actual, `checksum mismatch: ${file.path}`).toBe(file.sha256)
  }
})
