// @ts-check
import { PostgresDistributedAntiReplayStore } from './postgres-anti-replay-adapter.mjs'
import { DynamoDbDistributedAntiReplayStore } from './dynamodb-anti-replay-adapter.mjs'
import {
  AwsKmsSigningProvider,
  GcpKmsSigningProvider,
} from './signing-providers.mjs'

const FORBIDDEN_METADATA_HOSTS = new Set([
  'metadata',
  'metadata.google.internal',
  'metadata.aws.internal',
  'instance-data',
  'instance-data.ec2.internal',
  'fd00:ec2::254',
])

/**
 * Normaliza un hostname de URL eliminando corchetes IPv6, punto DNS final y minúsculas.
 * @param {string} rawHostname
 * @returns {string}
 */
export function normalizeNetworkHostname(rawHostname) {
  let host = String(rawHostname || '').trim().toLowerCase()
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1)
  }
  while (host.endsWith('.')) {
    host = host.slice(0, -1)
  }
  return host
}

function parseIpv4Octets(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip)
  if (!m) return null
  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null
  }
  return octets
}

function classifyIpv4Range(octets) {
  const [a, b] = octets
  if (a === 0) return 'UNSPECIFIED_IPV4'
  if (a === 127) return 'LOOPBACK_IPV4'
  if (a === 169 && b === 254) return 'LINK_LOCAL_METADATA_IPV4'
  if (a === 10) return 'PRIVATE_RFC1918_IPV4'
  if (a === 172 && b >= 16 && b <= 31) return 'PRIVATE_RFC1918_IPV4'
  if (a === 192 && b === 168) return 'PRIVATE_RFC1918_IPV4'
  if (a === 100 && b >= 64 && b <= 127) return 'CGNAT_IPV4'
  if (a >= 224) return 'RESERVED_OR_MULTICAST_IPV4'
  return null
}

function parseIpv6Hextets(rawIp) {
  if (!rawIp || rawIp.includes('%')) return null
  let ip = rawIp
  const lastColon = ip.lastIndexOf(':')
  if (lastColon !== -1 && ip.slice(lastColon + 1).includes('.')) {
    const tailOctets = parseIpv4Octets(ip.slice(lastColon + 1))
    if (!tailOctets) return null
    const h6 = ((tailOctets[0] << 8) | tailOctets[1]).toString(16)
    const h7 = ((tailOctets[2] << 8) | tailOctets[3]).toString(16)
    ip = `${ip.slice(0, lastColon)}:${h6}:${h7}`
  }

  const doubleColonParts = ip.split('::')
  if (doubleColonParts.length > 2) return null

  const parseGroups = (segment) => {
    if (!segment) return []
    const items = segment.split(':')
    if (items.some((p) => !/^[0-9a-f]{1,4}$/.test(p))) return null
    return items.map((p) => Number.parseInt(p, 16))
  }

  const head = parseGroups(doubleColonParts[0])
  if (!head) return null
  if (doubleColonParts.length === 1) {
    return head.length === 8 ? head : null
  }
  const tail = parseGroups(doubleColonParts[1])
  if (!tail) return null
  const missing = 8 - (head.length + tail.length)
  if (missing < 1) return null
  return [...head, ...new Array(missing).fill(0), ...tail]
}

function classifyIpv6Hextets(hextets) {
  const allZeroExceptLast = hextets.slice(0, 7).every((h) => h === 0)
  if (allZeroExceptLast && hextets[7] === 0) return 'UNSPECIFIED_IPV6'
  if (allZeroExceptLast && hextets[7] === 1) return 'LOOPBACK_IPV6'

  const isMappedOrCompatV4 =
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    (hextets[5] === 0xffff || hextets[5] === 0)
  const isNat64V4 =
    hextets[0] === 0x0064 &&
    hextets[1] === 0xff9b &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0

  if (isMappedOrCompatV4 || isNat64V4) {
    const octets = [
      (hextets[6] >> 8) & 0xff,
      hextets[6] & 0xff,
      (hextets[7] >> 8) & 0xff,
      hextets[7] & 0xff,
    ]
    const v4Class = classifyIpv4Range(octets)
    if (v4Class) return `IPV6_EMBEDDED_${v4Class}`
  }

  if ((hextets[0] & 0xffc0) === 0xfe80) return 'LINK_LOCAL_IPV6'
  if ((hextets[0] & 0xfe00) === 0xfc00) return 'UNIQUE_LOCAL_IPV6'
  if ((hextets[0] & 0xff00) === 0xff00) return 'MULTICAST_IPV6'
  return null
}

/**
 * Clasifica un hostname para prevención SSRF / aislamiento de infraestructura.
 * Detecta IPv4 privadas/loopback/link-local/CGNAT, IPv6 ULA/link-local/loopback,
 * IPv6 con IPv4 mapeado (`::ffff:169.254.169.254`, `::ffff:127.0.0.1`), Zone-ID (`%`)
 * y nombres de metadata cloud.
 *
 * @param {string} rawHostname
 * @returns {Readonly<{
 *   normalizedHost: string,
 *   isIpLiteral: boolean,
 *   isLoopback: boolean,
 *   isLocalExact: boolean,
 *   isMetadataOrLinkLocal: boolean,
 *   reason: string | null,
 * }>}
 */
export function classifyNetworkHost(rawHostname) {
  const normalizedHost = normalizeNetworkHostname(rawHostname)
  if (!normalizedHost) {
    return Object.freeze({
      normalizedHost: '',
      isIpLiteral: false,
      isLoopback: false,
      isLocalExact: false,
      isMetadataOrLinkLocal: false,
      reason: 'EMPTY_HOST',
    })
  }
  if (normalizedHost.includes('%')) {
    return Object.freeze({
      normalizedHost,
      isIpLiteral: true,
      isLoopback: false,
      isLocalExact: false,
      isMetadataOrLinkLocal: true,
      reason: 'IPV6_ZONE_ID_FORBIDDEN',
    })
  }
  if (FORBIDDEN_METADATA_HOSTS.has(normalizedHost)) {
    return Object.freeze({
      normalizedHost,
      isIpLiteral: false,
      isLoopback: false,
      isLocalExact: false,
      isMetadataOrLinkLocal: true,
      reason: 'CLOUD_METADATA_HOST',
    })
  }
  if (normalizedHost === 'localhost' || normalizedHost.endsWith('.localhost')) {
    return Object.freeze({
      normalizedHost,
      isIpLiteral: false,
      isLoopback: true,
      isLocalExact: normalizedHost === 'localhost',
      isMetadataOrLinkLocal: false,
      reason: 'LOOPBACK_HOSTNAME',
    })
  }

  const ipv4 = parseIpv4Octets(normalizedHost)
  if (ipv4) {
    const reason = classifyIpv4Range(ipv4)
    const isLoopback = reason === 'LOOPBACK_IPV4'
    return Object.freeze({
      normalizedHost,
      isIpLiteral: true,
      isLoopback,
      isLocalExact: normalizedHost === '127.0.0.1',
      isMetadataOrLinkLocal: reason === 'LINK_LOCAL_METADATA_IPV4',
      reason,
    })
  }

  if (normalizedHost.includes(':')) {
    const hextets = parseIpv6Hextets(normalizedHost)
    if (!hextets) {
      return Object.freeze({
        normalizedHost,
        isIpLiteral: true,
        isLoopback: false,
        isLocalExact: false,
        isMetadataOrLinkLocal: false,
        reason: 'MALFORMED_IPV6_LITERAL',
      })
    }
    const reason = classifyIpv6Hextets(hextets)
    const isLoopback =
      reason === 'LOOPBACK_IPV6' || reason === 'IPV6_EMBEDDED_LOOPBACK_IPV4'
    return Object.freeze({
      normalizedHost,
      isIpLiteral: true,
      isLoopback,
      isLocalExact: normalizedHost === '::1',
      isMetadataOrLinkLocal:
        reason === 'LINK_LOCAL_IPV6' ||
        reason === 'IPV6_EMBEDDED_LINK_LOCAL_METADATA_IPV4' ||
        reason === 'UNIQUE_LOCAL_IPV6',
      reason,
    })
  }

  return Object.freeze({
    normalizedHost,
    isIpLiteral: false,
    isLoopback: false,
    isLocalExact: false,
    isMetadataOrLinkLocal: false,
    reason: null,
  })
}

/**
 * Indica si la integración con infraestructura real fue habilitada explícitamente.
 * Permanece en `false` por defecto (fail-closed, 0 llamadas de red).
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function isRealIntegrationEnabled(env = process.env) {
  return (
    String(env?.ATTESTATION_REAL_INTEGRATION_ENABLED || '')
      .trim()
      .toLowerCase() === 'true'
  )
}

/**
 * Indica si se habilitó explícitamente el modo dry-run de integración real.
 * En dry-run se validan sintaxis, postura de seguridad y matrices de acciones sin conexión ni firma.
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function isRealIntegrationDryRun(env = process.env) {
  return (
    String(env?.ATTESTATION_REAL_INTEGRATION_DRY_RUN || '')
      .trim()
      .toLowerCase() === 'true'
  )
}

/**
 * Exige habilitación explícita antes de instanciar clientes de red reales.
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [context]
 */
export function assertRealIntegrationEnabled(
  env = process.env,
  context = 'real_integration'
) {
  if (!isRealIntegrationEnabled(env)) {
    throw new Error(
      `REAL_INTEGRATION_DISABLED: La integración real está deshabilitada por defecto (defina ATTESTATION_REAL_INTEGRATION_ENABLED=true explícitamente para '${context}')`
    )
  }
  if (isRealIntegrationDryRun(env)) {
    throw new Error(
      `REAL_INTEGRATION_DRY_RUN_ACTIVE: Prohibido instanciar clientes reales en '${context}' cuando ATTESTATION_REAL_INTEGRATION_DRY_RUN=true`
    )
  }
}

/**
 * Valida que la URL de PostgreSQL pertenezca a una instancia dedicada de la autoridad
 * (prohibido compartir la base operativa/fiscal de Supabase POS) y que aplique TLS en hosts remotos.
 * @param {string} connectionString
 * @param {{ allowInsecureLocalhost?: boolean }} [options]
 */
export function assertDedicatedPostgresUrl(connectionString, options = {}) {
  if (typeof connectionString !== 'string' || !connectionString.trim()) {
    throw new Error(
      'POSTGRES_CONNECTION_STRING_MISSING: Se requiere ATTESTATION_POSTGRES_URL explícita'
    )
  }

  let parsed
  try {
    parsed = new URL(connectionString.trim())
  } catch {
    throw new Error(
      'POSTGRES_CONNECTION_STRING_INVALID: URL PostgreSQL inválida'
    )
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(
      `POSTGRES_CONNECTION_STRING_INVALID: Protocolo no soportado '${parsed.protocol}'; se requiere postgres:// o postgresql://`
    )
  }

  const rawHostname = String(parsed.hostname || '').trim().toLowerCase()
  const hostClass = classifyNetworkHost(rawHostname)
  const hostname = hostClass.normalizedHost
  if (!hostname) {
    throw new Error(
      'POSTGRES_CONNECTION_STRING_INVALID: Host PostgreSQL vacío'
    )
  }

  if (
    hostClass.isMetadataOrLinkLocal ||
    hostClass.reason === 'UNSPECIFIED_IPV4' ||
    hostClass.reason === 'UNSPECIFIED_IPV6' ||
    hostClass.reason === 'IPV6_EMBEDDED_UNSPECIFIED_IPV4' ||
    hostClass.reason === 'RESERVED_OR_MULTICAST_IPV4' ||
    hostClass.reason === 'MULTICAST_IPV6' ||
    hostClass.reason === 'MALFORMED_IPV6_LITERAL'
  ) {
    throw new Error(
      `POSTGRES_FORBIDDEN_HOST: Host PostgreSQL '${hostname}' no permitido (${hostClass.reason})`
    )
  }

  if (
    hostname === 'afip.gov.ar' ||
    hostname.endsWith('.afip.gov.ar') ||
    hostname === 'arca.gob.ar' ||
    hostname.endsWith('.arca.gob.ar')
  ) {
    throw new Error(
      `POSTGRES_FORBIDDEN_HOST: Prohibido apuntar PostgreSQL a dominios fiscales ARCA/AFIP ('${hostname}')`
    )
  }

  if (
    hostname === 'supabase.co' ||
    hostname.endsWith('.supabase.co') ||
    hostname === 'supabase.in' ||
    hostname.endsWith('.supabase.in') ||
    hostname.includes('pooler.supabase.com')
  ) {
    throw new Error(
      'POSTGRES_DEDICATED_DATABASE_REQUIRED: Prohibido compartir la base de datos operativa/fiscal de Supabase POS para anti-replay de la autoridad'
    )
  }

  const database = parsed.pathname ? parsed.pathname.replace(/^\//, '').trim() : ''
  if (!database) {
    throw new Error(
      'POSTGRES_CONNECTION_STRING_INVALID: La URL PostgreSQL debe especificar nombre de base de datos dedicado'
    )
  }

  const normalizedDb = database.toLowerCase()
  if (
    ['postgres', 'kiosco', 'kioscopos', 'kiosco_pos', 'pos', 'supabase'].includes(
      normalizedDb
    )
  ) {
    throw new Error(
      `POSTGRES_DEDICATED_DATABASE_REQUIRED: Nombre de base de datos '${database}' reservado o compartido; utilice una base dedicada (ej. attestation_anti_replay)`
    )
  }

  const isLocal = hostClass.isLoopback
  const sslMode = String(parsed.searchParams.get('sslmode') || '')
    .trim()
    .toLowerCase()

  if (!isLocal) {
    if (sslMode === 'disable' || sslMode === 'allow' || sslMode === 'prefer') {
      throw new Error(
        `POSTGRES_TLS_REQUIRED: sslmode='${sslMode}' insuficiente para PostgreSQL remoto; utilice verify-full, verify-ca o require`
      )
    }
    if (!sslMode) {
      throw new Error(
        'POSTGRES_TLS_REQUIRED: PostgreSQL remoto requiere sslmode explícito (preferiblemente verify-full)'
      )
    }
  } else if (sslMode === 'disable' && options.allowInsecureLocalhost === false) {
    throw new Error(
      'POSTGRES_TLS_REQUIRED: sslmode=disable prohibido cuando allowInsecureLocalhost=false'
    )
  }

  return Object.freeze({
    hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database,
    sslMode: sslMode || (isLocal ? 'localhost-default' : 'require'),
    isLocal,
  })
}

/**
 * Valida URL de endpoints externos (KMS/DynamoDB/OIDC) exigiendo HTTPS en hosts remotos
 * y prohibiendo hosts de metadata cloud, IPs privadas/link-local/ULA/CGNAT, IPv4 embebido en IPv6,
 * o credenciales en URL.
 *
 * NOTA DNS REBINDING: Esta validación inspecciona el literal de la URL; en entornos con acceso DNS
 * dinámico se recomienda restringir adicionalmente con `allowedHosts` + política de egreso / lookup pinning.
 *
 * @param {string} rawUrl
 * @param {string} varName
 * @param {{
 *   allowInsecureLocalhost?: boolean,
 *   allowLoopbackEndpoint?: boolean,
 *   allowedHosts?: readonly string[],
 * }} [options]
 */
export function assertSafeEndpointUrl(rawUrl, varName, options = {}) {
  let parsed
  try {
    parsed = new URL(String(rawUrl).trim())
  } catch {
    throw new Error(
      `REAL_INTEGRATION_CONFIG_INVALID: Endpoint inválido en ${varName}`
    )
  }
  if (parsed.username || parsed.password) {
    throw new Error(
      `REAL_INTEGRATION_CONFIG_INVALID: ${varName} no puede embeber credenciales en la URL`
    )
  }
  const proto = parsed.protocol.toLowerCase()
  const hostClass = classifyNetworkHost(parsed.hostname)
  const hostname = hostClass.normalizedHost
  const isLocal = hostClass.isLocalExact

  if (Array.isArray(options.allowedHosts) && options.allowedHosts.length > 0) {
    const allowedSet = new Set(
      options.allowedHosts.map((h) => normalizeNetworkHostname(h)).filter(Boolean)
    )
    if (!allowedSet.has(hostname)) {
      throw new Error(
        `REAL_INTEGRATION_FORBIDDEN_HOST: ${varName} host '${hostname}' fuera de lista blanca permitida`
      )
    }
  }

  if (hostClass.reason) {
    const isAllowedLocalLoopback =
      hostClass.isLocalExact &&
      (options.allowInsecureLocalhost === true || options.allowLoopbackEndpoint === true)
    if (!isAllowedLocalLoopback) {
      throw new Error(
        `REAL_INTEGRATION_FORBIDDEN_HOST: ${varName} apunta a host prohibido '${hostname}' (${hostClass.reason})`
      )
    }
  }

  if (proto === 'https:') {
    return Object.freeze({
      url: parsed.toString(),
      hostname,
      protocol: proto,
      isLocal,
    })
  }
  if (proto === 'http:' && isLocal && options.allowInsecureLocalhost === true) {
    return Object.freeze({
      url: parsed.toString(),
      hostname,
      protocol: proto,
      isLocal,
    })
  }
  throw new Error(
    `REAL_INTEGRATION_TLS_REQUIRED: ${varName} debe usar HTTPS (${proto}//${hostname})`
  )
}

/**
 * Resuelve de forma consistente las variables KMS entre runtime del servidor (`server.mjs`),
 * integración real (`real-integration.mjs`) y preflight, rechazando colisiones contradictorias.
 * @param {Record<string, string | undefined>} [env]
 */
export function resolveKmsEnvConfig(env = process.env) {
  const clean = (v) => (typeof v === 'string' ? v.trim() : '')
  const rawSigningProvider = clean(env?.ATTESTATION_SIGNING_PROVIDER).toUpperCase()
  const rawSigningMode = clean(env?.ATTESTATION_SIGNING_MODE).toUpperCase()
  const rawKmsProvider = clean(env?.ATTESTATION_KMS_PROVIDER).toUpperCase()

  const modeAsCloud =
    rawSigningMode === 'AWS_KMS' || rawSigningMode === 'GCP_KMS'
      ? rawSigningMode
      : ''
  if (rawKmsProvider && modeAsCloud && rawKmsProvider !== modeAsCloud) {
    throw new Error(
      `KMS_CONFIGURATION_CONFLICT: ATTESTATION_KMS_PROVIDER='${rawKmsProvider}' entra en conflicto con ATTESTATION_SIGNING_MODE='${rawSigningMode}'`
    )
  }

  const cloudProvider =
    rawKmsProvider ||
    modeAsCloud ||
    (rawSigningMode === 'EXTERNAL_KMS' || rawSigningMode === 'GENERIC_KMS'
      ? rawSigningMode
      : '')

  const rawKeyVersionName = clean(env?.ATTESTATION_KMS_KEY_VERSION_NAME)
  const rawKeyVersion = clean(env?.ATTESTATION_KMS_KEY_VERSION)
  const rawAwsArn = clean(env?.ATTESTATION_AWS_KMS_KEY_ARN)
  const rawKmsKeyId = clean(env?.ATTESTATION_KMS_KEY_ID)
  const rawPublicKeyId = clean(env?.ATTESTATION_PUBLIC_KEY_ID)
  const rawKeyId = clean(env?.ATTESTATION_KEY_ID)

  if (rawKeyVersionName && rawKeyVersion && rawKeyVersionName !== rawKeyVersion) {
    throw new Error(
      'KMS_CONFIGURATION_CONFLICT: ATTESTATION_KMS_KEY_VERSION_NAME y ATTESTATION_KMS_KEY_VERSION tienen valores distintos'
    )
  }
  if (rawKeyVersionName && rawAwsArn && rawKeyVersionName !== rawAwsArn) {
    throw new Error(
      'KMS_CONFIGURATION_CONFLICT: ATTESTATION_KMS_KEY_VERSION_NAME y ATTESTATION_AWS_KMS_KEY_ARN tienen valores distintos'
    )
  }
  if (rawKeyVersion && rawAwsArn && rawKeyVersion !== rawAwsArn) {
    throw new Error(
      'KMS_CONFIGURATION_CONFLICT: ATTESTATION_KMS_KEY_VERSION y ATTESTATION_AWS_KMS_KEY_ARN tienen valores distintos'
    )
  }

  const keyVersionFallbackFromKmsKeyId =
    rawKmsKeyId && !rawKmsKeyId.startsWith('ed25519-spki-') ? rawKmsKeyId : ''
  const keyVersionName =
    rawKeyVersionName ||
    rawAwsArn ||
    rawKeyVersion ||
    keyVersionFallbackFromKmsKeyId

  const kmsKeyIdAsFingerprint =
    rawKmsKeyId && rawKmsKeyId !== keyVersionName ? rawKmsKeyId : ''
  if (rawPublicKeyId && kmsKeyIdAsFingerprint && rawPublicKeyId !== kmsKeyIdAsFingerprint) {
    throw new Error(
      'KMS_CONFIGURATION_CONFLICT: ATTESTATION_PUBLIC_KEY_ID y ATTESTATION_KMS_KEY_ID tienen valores distintos'
    )
  }
  if (rawPublicKeyId && rawKeyId && rawPublicKeyId !== rawKeyId) {
    throw new Error(
      'KMS_CONFIGURATION_CONFLICT: ATTESTATION_PUBLIC_KEY_ID y ATTESTATION_KEY_ID tienen valores distintos'
    )
  }

  const keyId = rawPublicKeyId || kmsKeyIdAsFingerprint || rawKeyId

  const spkiPrimary = clean(env?.ATTESTATION_PUBLIC_KEY_SPKI).replace(/\\n/g, '\n')
  const spkiAlt = clean(env?.ATTESTATION_KMS_PUBLIC_KEY_SPKI).replace(/\\n/g, '\n')
  if (
    spkiPrimary &&
    spkiAlt &&
    spkiPrimary.replace(/[\r\n\s]/g, '') !== spkiAlt.replace(/[\r\n\s]/g, '')
  ) {
    throw new Error(
      'KMS_CONFIGURATION_CONFLICT: ATTESTATION_PUBLIC_KEY_SPKI y ATTESTATION_KMS_PUBLIC_KEY_SPKI tienen claves distintas'
    )
  }
  const publicKeySpki = spkiPrimary || spkiAlt

  return Object.freeze({
    signingProviderMode: rawSigningProvider || modeAsCloud || rawSigningMode || '',
    cloudProvider,
    authorityId: clean(env?.ATTESTATION_AUTHORITY_ID),
    keyId,
    keyVersionName,
    publicKeySpki,
    region: clean(env?.ATTESTATION_AWS_REGION || env?.AWS_REGION),
    kmsEndpoint: clean(env?.ATTESTATION_KMS_ENDPOINT),
    awsSigningAlgorithm: clean(env?.ATTESTATION_AWS_KMS_SIGNING_ALGORITHM) || 'ED25519_SHA_512',
  })
}

function parsePositiveIntEnv(env, key) {
  const raw = env?.[key]
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return undefined
  }
  const n = Number(String(raw).trim())
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new Error(
      `REAL_INTEGRATION_CONFIG_INVALID: ${key} inválido ('${raw}')`
    )
  }
  return n
}

/**
 * Carga diferida de paquetes externos opcionales sin acoplamiento en tiempo de compilación/importación.
 * @param {string} packageName
 * @returns {Promise<Record<string, any>>}
 */
async function importOptionalPackage(packageName) {
  try {
    return await import(/* @vite-ignore */ packageName)
  } catch {
    throw new Error(
      `REAL_INTEGRATION_DEPENDENCY_MISSING: El paquete '${packageName}' no está instalado en este runtime`
    )
  }
}

/**
 * Crea `PostgresDistributedAntiReplayStore` conectado a un `pg.Pool` real
 * ÚNICAMENTE cuando `ATTESTATION_REAL_INTEGRATION_ENABLED=true`.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {{ pgModule?: { Pool: new (cfg: Record<string, unknown>) => any } }} [deps]
 */
export async function createControlledPostgresStoreFromEnv(
  env = process.env,
  deps = {}
) {
  assertRealIntegrationEnabled(env, 'postgres')

  const connectionString = String(env?.ATTESTATION_POSTGRES_URL || '').trim()
  const allowInsecureLocalhost =
    String(env?.ATTESTATION_POSTGRES_ALLOW_INSECURE_LOCALHOST || '')
      .trim()
      .toLowerCase() === 'true'
  const urlMeta = assertDedicatedPostgresUrl(connectionString, {
    allowInsecureLocalhost,
  })

  const pgMod = deps.pgModule || (await importOptionalPackage('pg'))

  const PoolCtor = pgMod.Pool || pgMod.default?.Pool
  if (typeof PoolCtor !== 'function') {
    throw new Error(
      "REAL_INTEGRATION_DEPENDENCY_MISSING: Constructor 'pg.Pool' no disponible"
    )
  }

  const sslCaPem =
    typeof env?.ATTESTATION_POSTGRES_SSL_CA_PEM === 'string' &&
    env.ATTESTATION_POSTGRES_SSL_CA_PEM.trim().length > 0
      ? env.ATTESTATION_POSTGRES_SSL_CA_PEM.replace(/\\n/g, '\n')
      : undefined

  let sslOption = undefined
  if (!urlMeta.isLocal || urlMeta.sslMode === 'verify-full' || urlMeta.sslMode === 'verify-ca' || urlMeta.sslMode === 'require') {
    sslOption = {
      rejectUnauthorized:
        urlMeta.sslMode === 'verify-full' ||
        urlMeta.sslMode === 'verify-ca' ||
        !urlMeta.isLocal,
      ...(sslCaPem ? { ca: sslCaPem } : {}),
    }
  } else if (urlMeta.sslMode === 'disable') {
    sslOption = false
  }

  const queryTimeoutMs = parsePositiveIntEnv(
    env,
    'ATTESTATION_POSTGRES_QUERY_TIMEOUT_MS'
  )
  const statementTimeoutMs = parsePositiveIntEnv(
    env,
    'ATTESTATION_POSTGRES_STATEMENT_TIMEOUT_MS'
  )
  const leaseTtlMs = parsePositiveIntEnv(
    env,
    'ATTESTATION_POSTGRES_LEASE_TTL_MS'
  )
  const poolMax = parsePositiveIntEnv(env, 'ATTESTATION_POSTGRES_POOL_MAX') || 10
  if (poolMax > 200) {
    throw new Error(
      `REAL_INTEGRATION_CONFIG_INVALID: ATTESTATION_POSTGRES_POOL_MAX (${poolMax}) excede máximo seguro (200)`
    )
  }

  const pool = new PoolCtor({
    connectionString,
    max: poolMax,
    connectionTimeoutMillis: queryTimeoutMs || 5000,
    idleTimeoutMillis: 10000,
    ...(sslOption !== undefined ? { ssl: sslOption } : {}),
  })

  let lastPoolError = null
  if (typeof pool.on === 'function') {
    pool.on('error', (poolErr) => {
      lastPoolError = Object.freeze({
        code: String(poolErr?.code || 'POOL_IDLE_ERROR'),
        timestamp: new Date().toISOString(),
      })
    })
  }

  const store = new PostgresDistributedAntiReplayStore({
    pool,
    tableName:
      env?.ATTESTATION_POSTGRES_TABLE || 'attestation_distributed_anti_replay',
    defaultLeaseTtlMs: leaseTtlMs || 30000,
    ...(queryTimeoutMs ? { queryTimeoutMs } : {}),
    ...(statementTimeoutMs ? { statementTimeoutMs } : {}),
    ...(env?.ATTESTATION_POSTGRES_ISOLATION_LEVEL
      ? { isolationLevel: env.ATTESTATION_POSTGRES_ISOLATION_LEVEL }
      : {}),
  })

  return Object.freeze({
    store,
    pool,
    getLastPoolError: () => lastPoolError,
    close: async () => {
      if (typeof pool.end === 'function') {
        await pool.end()
      }
    },
  })
}

/**
 * Crea `DynamoDbDistributedAntiReplayStore` respaldado por `@aws-sdk/client-dynamodb`
 * ÚNICAMENTE cuando `ATTESTATION_REAL_INTEGRATION_ENABLED=true`.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {{ client?: any, awsDynamoSdk?: any, awsDynamoLibSdk?: any }} [deps]
 */
export async function createControlledDynamoDbStoreFromEnv(
  env = process.env,
  deps = {}
) {
  assertRealIntegrationEnabled(env, 'dynamodb')

  const tableName = String(env?.ATTESTATION_DYNAMODB_TABLE || '').trim()
  if (!tableName) {
    throw new Error(
      'DYNAMODB_CONFIG_MISSING: Se requiere ATTESTATION_DYNAMODB_TABLE'
    )
  }

  const region = String(
    env?.ATTESTATION_AWS_REGION || env?.AWS_REGION || ''
  ).trim()
  if (!region && !deps.client) {
    throw new Error(
      'DYNAMODB_REGION_MISSING: Se requiere ATTESTATION_AWS_REGION o AWS_REGION'
    )
  }

  const ttlSeconds = parsePositiveIntEnv(
    env,
    'ATTESTATION_DYNAMODB_RETENTION_TTL_SECONDS'
  )
  const operationTimeoutMs = parsePositiveIntEnv(
    env,
    'ATTESTATION_DYNAMODB_TIMEOUT_MS'
  )

  let endpointMeta = null
  if (env?.ATTESTATION_DYNAMODB_ENDPOINT) {
    endpointMeta = assertSafeEndpointUrl(
      env.ATTESTATION_DYNAMODB_ENDPOINT,
      'ATTESTATION_DYNAMODB_ENDPOINT',
      {
        allowInsecureLocalhost:
          String(env?.ATTESTATION_DYNAMODB_ALLOW_INSECURE_LOCALHOST || '')
            .trim()
            .toLowerCase() === 'true',
      }
    )
  }

  let clientAdapter = deps.client || null
  let lowLevelClient = null
  if (!clientAdapter) {
    const dynamoMod =
      deps.awsDynamoSdk ||
      (await importOptionalPackage('@aws-sdk/client-dynamodb'))
    const libDynamoMod =
      deps.awsDynamoLibSdk ||
      (await importOptionalPackage('@aws-sdk/lib-dynamodb'))

    const { DynamoDBClient, DescribeTableCommand } = dynamoMod
    const {
      DynamoDBDocumentClient,
      TransactWriteCommand,
      UpdateCommand,
      GetCommand,
    } = libDynamoMod

    lowLevelClient = new DynamoDBClient({
      region,
      ...(endpointMeta ? { endpoint: endpointMeta.url } : {}),
    })
    const docClient = DynamoDBDocumentClient.from(lowLevelClient)

    clientAdapter = {
      transactWriteItems: async (input) =>
        await docClient.send(new TransactWriteCommand(input)),
      updateItem: async (input) =>
        await docClient.send(new UpdateCommand(input)),
      getItem: async (input) => await docClient.send(new GetCommand(input)),
      describeTable: async (input) =>
        await lowLevelClient.send(new DescribeTableCommand(input)),
    }
  }

  const store = new DynamoDbDistributedAntiReplayStore({
    client: clientAdapter,
    tableName,
    ...(operationTimeoutMs ? { operationTimeoutMs } : {}),
    ...(ttlSeconds ? { retentionTtlSeconds: ttlSeconds } : {}),
  })

  return Object.freeze({
    store,
    close: async () => {
      if (lowLevelClient && typeof lowLevelClient.destroy === 'function') {
        lowLevelClient.destroy()
      }
    },
  })
}

/**
 * Crea un proveedor KMS real (`AwsKmsSigningProvider` o `GcpKmsSigningProvider`)
 * ÚNICAMENTE cuando `ATTESTATION_REAL_INTEGRATION_ENABLED=true`.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {{ awsKmsSdk?: any, gcpKmsSdk?: any, kmsClient?: any }} [deps]
 */
export async function createControlledKmsProviderFromEnv(
  env = process.env,
  deps = {}
) {
  assertRealIntegrationEnabled(env, 'kms')

  const kmsCfg = resolveKmsEnvConfig(env)
  const signingMode = String(env?.ATTESTATION_SIGNING_MODE || kmsCfg.cloudProvider || '')
    .trim()
    .toUpperCase()
  const authorityId = kmsCfg.authorityId
  const keyId = kmsCfg.keyId
  const keyVersionName = kmsCfg.keyVersionName
  const publicKeySpki = kmsCfg.publicKeySpki
  const kmsTimeoutMs = parsePositiveIntEnv(env, 'ATTESTATION_KMS_TIMEOUT_MS')
  const endpointMeta = kmsCfg.kmsEndpoint
    ? assertSafeEndpointUrl(kmsCfg.kmsEndpoint, 'ATTESTATION_KMS_ENDPOINT', {
        allowInsecureLocalhost:
          String(env?.ATTESTATION_KMS_ALLOW_INSECURE_LOCALHOST || '')
            .trim()
            .toLowerCase() === 'true',
      })
    : null

  if (signingMode === 'AWS_KMS') {
    const region = kmsCfg.region
    let awsKmsClient = deps.kmsClient || null
    let rawSdkClient = null
    if (!awsKmsClient) {
      const awsKmsMod =
        deps.awsKmsSdk || (await importOptionalPackage('@aws-sdk/client-kms'))
      const { KMSClient, SignCommand, GetPublicKeyCommand } = awsKmsMod
      rawSdkClient = new KMSClient({
        ...(region ? { region } : {}),
        ...(endpointMeta ? { endpoint: endpointMeta.url } : {}),
      })
      awsKmsClient = {
        sign: async ({ KeyId, Message, MessageType, SigningAlgorithm }) =>
          await rawSdkClient.send(
            new SignCommand({ KeyId, Message, MessageType, SigningAlgorithm })
          ),
        getPublicKey: async ({ KeyId }) =>
          await rawSdkClient.send(new GetPublicKeyCommand({ KeyId })),
      }
    }

    const provider = new AwsKmsSigningProvider({
      authorityId: authorityId || undefined,
      keyId,
      kmsKeyArn: keyVersionName,
      keyVersionName,
      publicKeySpki,
      region: region || undefined,
      awsSigningAlgorithm: kmsCfg.awsSigningAlgorithm,
      kmsEndpoint: endpointMeta?.url || undefined,
      awsKmsClient,
      testDoubleOnly: false,
      ...(kmsTimeoutMs ? { kmsTimeoutMs } : {}),
    })

    return Object.freeze({
      provider,
      close: async () => {
        if (rawSdkClient && typeof rawSdkClient.destroy === 'function') {
          rawSdkClient.destroy()
        }
      },
    })
  }

  if (signingMode === 'GCP_KMS') {
    let gcpKmsClient = deps.kmsClient || null
    if (!gcpKmsClient) {
      const gcpKmsMod =
        deps.gcpKmsSdk || (await importOptionalPackage('@google-cloud/kms'))
      const { KeyManagementServiceClient } = gcpKmsMod
      const rawClient = new KeyManagementServiceClient({
        ...(endpointMeta ? { apiEndpoint: endpointMeta.hostname } : {}),
      })
      gcpKmsClient = {
        asymmetricSign: async ({ name, data }) =>
          await rawClient.asymmetricSign({ name, data }),
        getPublicKey: async ({ name }) => await rawClient.getPublicKey({ name }),
        close: async () => {
          if (typeof rawClient.close === 'function') {
            await rawClient.close()
          }
        },
      }
    }

    const provider = new GcpKmsSigningProvider({
      authorityId: authorityId || undefined,
      keyId,
      keyVersionName,
      publicKeySpki,
      kmsEndpoint: endpointMeta?.url || undefined,
      gcpKmsClient,
      testDoubleOnly: false,
      ...(kmsTimeoutMs ? { kmsTimeoutMs } : {}),
    })

    return Object.freeze({
      provider,
      close: async () => {
        if (typeof gcpKmsClient?.close === 'function') {
          await gcpKmsClient.close()
        }
      },
    })
  }

  throw new Error(
    `REAL_INTEGRATION_UNSUPPORTED_KMS_MODE: ATTESTATION_SIGNING_MODE='${signingMode}' no soportado por createControlledKmsProviderFromEnv`
  )
}
