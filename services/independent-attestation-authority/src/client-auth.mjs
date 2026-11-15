// @ts-check
import crypto from 'node:crypto'
import { PR02_P0_SCOPE, safeParseStrictJson } from './contract.mjs'
import {
  classifyNetworkHost,
  normalizeNetworkHostname,
} from './real-integration.mjs'

export const CLIENT_AUTH_MODES = Object.freeze({
  SIMULATED_TEST_ONLY: 'SIMULATED_TEST_ONLY',
  INJECTED_VERIFIER: 'INJECTED_VERIFIER',
  OIDC_JWT: 'OIDC_JWT',
  MTLS: 'MTLS',
})

export const OIDC_ALLOWED_ALGORITHMS = Object.freeze([
  'EdDSA',
  'RS256',
  'ES256',
])

const DEFAULT_JWKS_CACHE_TTL_MS = 300000
const DEFAULT_JWKS_FETCH_TIMEOUT_MS = 3000
const DEFAULT_JWKS_MIN_REFRESH_INTERVAL_MS = 2000
const DEFAULT_CLOCK_SKEW_SECONDS = 30
const MAX_JWT_TOKEN_BYTES = 16384
const MAX_JWKS_BYTES = 262144

/**
 * Normaliza un verificador de autenticación de cliente (función o instancia con método `verify`).
 * @param {unknown} verifier
 * @returns {{
 *   verify: (headers: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> | unknown,
 *   verifierKind: string,
 *   trustScope: string,
 *   simulated: boolean,
 *   isProductionAuthVerifier: () => boolean
 * } | null}
 */
export function normalizeClientAuthVerifier(verifier) {
  if (!verifier) return null

  if (typeof verifier === 'function') {
    const fn = /** @type {Function & { verifierKind?: string, trustScope?: string, simulated?: boolean, isProductionAuthVerifier?: () => boolean, isHealthy?: () => Promise<boolean> | boolean, realOidcConfigured?: boolean, realMtlsConfigured?: boolean }} */ (
      verifier
    )
    return {
      verify: (headers, context) => fn(headers, context),
      verifierKind: fn.verifierKind || 'CUSTOM_FUNCTION_VERIFIER',
      trustScope: fn.trustScope || 'CONFIGURED',
      simulated: Boolean(fn.simulated),
      realOidcConfigured: Boolean(fn.realOidcConfigured),
      realMtlsConfigured: Boolean(fn.realMtlsConfigured),
      isProductionAuthVerifier:
        typeof fn.isProductionAuthVerifier === 'function'
          ? fn.isProductionAuthVerifier
          : () => !fn.simulated && fn.trustScope !== 'TEST_ONLY',
      isHealthy:
        typeof fn.isHealthy === 'function'
          ? () => fn.isHealthy()
          : async () => true,
    }
  }

  if (
    typeof verifier === 'object' &&
    typeof (/** @type {any} */ (verifier).verify) === 'function'
  ) {
    const obj = /** @type {any} */ (verifier)
    return {
      verify: (headers, context) => obj.verify(headers, context),
      verifierKind: obj.verifierKind || 'CUSTOM_OBJECT_VERIFIER',
      trustScope: obj.trustScope || 'CONFIGURED',
      simulated: Boolean(obj.simulated),
      realOidcConfigured: Boolean(obj.realOidcConfigured),
      realMtlsConfigured: Boolean(obj.realMtlsConfigured),
      trustedCaPem:
        typeof obj.trustedCaPem === 'string' ? obj.trustedCaPem : undefined,
      isProductionAuthVerifier:
        typeof obj.isProductionAuthVerifier === 'function'
          ? () => Boolean(obj.isProductionAuthVerifier())
          : () => !obj.simulated && obj.trustScope !== 'TEST_ONLY',
      isHealthy:
        typeof obj.isHealthy === 'function'
          ? () => obj.isHealthy()
          : async () => true,
    }
  }

  throw new Error(
    'CLIENT_AUTH_VERIFIER_INVALID: clientAuthVerifier debe ser una función o un objeto con método verify()'
  )
}

/**
 * Valida la respuesta del verificador de autenticación y vincula identidad + alcance del cliente.
 * Impide confundir la identidad autenticada del cliente con la autoridad GO.
 *
 * @param {unknown} rawResult
 * @param {{
 *   protectedMode: boolean,
 *   requestedScope?: string | null,
 *   trustedGoAuthorityId?: string | null,
 *   trustedGoKeyId?: string | null,
 *   attestationAuthorityId?: string | null
 * }} context
 */
export function assertNormalizedAuthenticatedClient(rawResult, context) {
  if (rawResult === false || rawResult === null || rawResult === undefined) {
    throw new Error(
      'CLIENT_AUTH_FAILED: Identidad del cliente ausente o rechazada por el verificador de autenticación'
    )
  }

  if (rawResult === true) {
    if (context.protectedMode) {
      throw new Error(
        'CLIENT_AUTH_IDENTITY_REQUIRED: En modo protegido el verificador debe retornar { authenticated: true, clientId, allowedScopes } y no un booleano plano'
      )
    }
    return Object.freeze({
      authenticated: true,
      clientId: 'test-client-unscoped',
      authMechanism: 'TEST_CALLBACK',
      allowedScopes: Object.freeze([PR02_P0_SCOPE]),
      isGoAuthority: false,
      simulated: true,
    })
  }

  if (typeof rawResult !== 'object' || Array.isArray(rawResult)) {
    throw new Error(
      'CLIENT_AUTH_FAILED: Formato de resultado de autenticación inválido'
    )
  }

  const res = /** @type {Record<string, any>} */ (rawResult)
  if (res.authenticated !== true) {
    throw new Error(
      res.reason
        ? `CLIENT_AUTH_FAILED: ${String(res.reason)}`
        : 'CLIENT_AUTH_FAILED: Identidad del cliente no autenticada'
    )
  }

  if (
    typeof res.clientId !== 'string' ||
    res.clientId.trim().length === 0 ||
    res.clientId !== res.clientId.trim()
  ) {
    throw new Error(
      'CLIENT_AUTH_IDENTITY_REQUIRED: Se requiere clientId canónico no vacío tras autenticación'
    )
  }

  if (
    res.isGoAuthority === true ||
    res.actsAsGoAuthority === true ||
    res.bypassGoGrant === true
  ) {
    throw new Error(
      'CLIENT_AUTH_AUTHORITY_CONFUSION_REJECTED: La identidad del cliente autenticado no puede suplantar ni reemplazar a la Autoridad GO'
    )
  }

  if (
    context.trustedGoAuthorityId &&
    res.clientId.toLowerCase() === context.trustedGoAuthorityId.toLowerCase()
  ) {
    throw new Error(
      'CLIENT_AUTH_AUTHORITY_CONFUSION_REJECTED: clientId del solicitante no puede coincidir con la identidad de GO Authority'
    )
  }

  if (
    context.trustedGoKeyId &&
    res.clientId.toLowerCase() === context.trustedGoKeyId.toLowerCase()
  ) {
    throw new Error(
      'CLIENT_AUTH_AUTHORITY_CONFUSION_REJECTED: clientId del solicitante no puede coincidir con el keyId de GO Authority'
    )
  }

  if (
    context.attestationAuthorityId &&
    res.clientId.toLowerCase() === context.attestationAuthorityId.toLowerCase()
  ) {
    throw new Error(
      'CLIENT_AUTH_AUTHORITY_CONFUSION_REJECTED: clientId del solicitante no puede coincidir con authorityId de atestación'
    )
  }

  const allowedScopes = Array.isArray(res.allowedScopes)
    ? res.allowedScopes.filter((s) => typeof s === 'string')
    : []

  if (context.protectedMode && allowedScopes.length === 0) {
    throw new Error(
      'CLIENT_AUTH_SCOPE_INSUFFICIENT: La identidad autenticada del cliente carece de allowedScopes explícitos'
    )
  }

  if (context.requestedScope) {
    if (
      allowedScopes.length > 0 &&
      !allowedScopes.includes(context.requestedScope)
    ) {
      throw new Error(
        `CLIENT_AUTH_SCOPE_INSUFFICIENT: Cliente '${res.clientId}' no autorizado para alcance '${context.requestedScope}'`
      )
    }
    if (context.protectedMode && !allowedScopes.includes(context.requestedScope)) {
      throw new Error(
        `CLIENT_AUTH_SCOPE_INSUFFICIENT: Cliente '${res.clientId}' sin permiso explícito para '${context.requestedScope}'`
      )
    }
  }

  return Object.freeze({
    authenticated: true,
    clientId: res.clientId,
    authMechanism:
      typeof res.authMechanism === 'string' && res.authMechanism.trim()
        ? res.authMechanism.trim()
        : 'VERIFIER',
    allowedScopes: Object.freeze([...allowedScopes]),
    isGoAuthority: false,
    simulated: Boolean(res.simulated),
  })
}

/**
 * Verificador SIMULADO exclusivamente para pruebas locales (NO realiza OIDC ni mTLS reales).
 * Prohibido estrictamente en STAGING y PRODUCTION por assertServiceEnvironmentIsolation.
 *
 * @param {{
 *   validTokens?: Record<string, { clientId: string, allowedScopes: string[], mechanism?: 'SIMULATED_OIDC' | 'SIMULATED_MTLS' }>,
 *   headerName?: string
 * }} [options]
 */
export function createSimulatedClientAuthVerifier(options = {}) {
  const headerName = String(
    options.headerName || 'authorization'
  ).toLowerCase()
  const validTokens = options.validTokens || {}

  return Object.freeze({
    verifierKind: 'SIMULATED_TEST_AUTH_VERIFIER',
    trustScope: 'TEST_ONLY',
    simulated: true,
    isProductionAuthVerifier: () => false,

    /**
     * @param {Record<string, unknown>} headers
     */
    async verify(headers) {
      if (!headers || typeof headers !== 'object') {
        throw new Error('CLIENT_AUTH_FAILED: Headers ausentes')
      }

      const rawAuth = headers[headerName]
      if (typeof rawAuth !== 'string' || rawAuth.trim().length === 0) {
        throw new Error(
          'CLIENT_AUTH_FAILED: Credencial simulada de cliente ausente'
        )
      }

      const token = rawAuth.startsWith('Bearer ')
        ? rawAuth.slice('Bearer '.length).trim()
        : rawAuth.trim()

      if (rawAuth.startsWith('Bearer ') && !Object.hasOwn(validTokens, token)) {
        throw new Error(
          'UNMODELED_BEARER_TOKEN_REJECTED: Token Bearer estático no reconocido ni modelado'
        )
      }

      const matched = Object.hasOwn(validTokens, token)
        ? validTokens[token]
        : null
      if (!matched) {
        throw new Error(
          'CLIENT_AUTH_FAILED: Identidad simulada no autorizada'
        )
      }

      return Object.freeze({
        authenticated: true,
        clientId: matched.clientId,
        authMechanism: matched.mechanism || 'SIMULATED_OIDC',
        allowedScopes: [...(matched.allowedScopes || [])],
        isGoAuthority: false,
        simulated: true,
      })
    },
  })
}

function decodeBase64UrlToBuffer(segment, label) {
  if (typeof segment !== 'string' || !/^[A-Za-z0-9\-_]+$/.test(segment)) {
    throw new Error(
      `OIDC_TOKEN_MALFORMED: Segmento ${label} base64url inválido`
    )
  }
  return Buffer.from(segment, 'base64url')
}

function normalizeNowSeconds(nowInput) {
  if (nowInput === undefined || nowInput === null) {
    return Math.floor(Date.now() / 1000)
  }
  const ms =
    typeof nowInput === 'number'
      ? nowInput
      : nowInput instanceof Date
        ? nowInput.getTime()
        : Date.parse(String(nowInput))
  if (!Number.isFinite(ms)) {
    throw new Error('OIDC_CLOCK_INVALID: Marca de tiempo inválida')
  }
  return Math.floor(ms / 1000)
}

export function assertSafeJwksUri(rawUri, allowInsecureLocalhostHttp, allowedJwksHosts) {
  let parsed
  try {
    parsed = new URL(String(rawUri))
  } catch {
    throw new Error(
      `OIDC_CONFIG_INVALID: jwksUri inválido '${rawUri}'`
    )
  }
  if (parsed.username || parsed.password) {
    throw new Error(
      'OIDC_CONFIG_INVALID: jwksUri no puede contener credenciales embebidas en URL'
    )
  }
  const proto = parsed.protocol.toLowerCase()
  const hostClass = classifyNetworkHost(parsed.hostname)
  const host = hostClass.normalizedHost

  if (Array.isArray(allowedJwksHosts) && allowedJwksHosts.length > 0) {
    const allowedSet = new Set(
      allowedJwksHosts.map((h) => normalizeNetworkHostname(h)).filter(Boolean)
    )
    if (!allowedSet.has(host)) {
      throw new Error(
        `OIDC_CONFIG_INVALID: Host JWKS '${host}' fuera de allowedJwksHosts`
      )
    }
  }

  if (
    proto !== 'https:' &&
    !(proto === 'http:' && allowInsecureLocalhostHttp && hostClass.isLocalExact)
  ) {
    if (hostClass.reason && !hostClass.isLocalExact) {
      throw new Error(
        `OIDC_CONFIG_INVALID: Host prohibido en jwksUri '${host}' (${hostClass.reason})`
      )
    }
    throw new Error(
      `OIDC_INSECURE_JWKS_URI_FORBIDDEN: jwksUri debe utilizar HTTPS (${parsed.protocol}//${parsed.hostname})`
    )
  }

  if (hostClass.reason) {
    const isAllowedLocalLoopback =
      hostClass.isLocalExact && allowInsecureLocalhostHttp === true
    if (!isAllowedLocalLoopback) {
      throw new Error(
        `OIDC_CONFIG_INVALID: Host prohibido en jwksUri '${host}' (${hostClass.reason})`
      )
    }
  }

  return parsed.toString()
}

function jwkMatchesAlg(jwk, alg) {
  if (!jwk || typeof jwk !== 'object' || Array.isArray(jwk)) return false
  if (jwk.kty === 'oct') return false
  if (jwk.use && jwk.use !== 'sig') return false
  if (jwk.alg && jwk.alg !== alg) return false
  if (alg === 'EdDSA') return jwk.kty === 'OKP' && jwk.crv === 'Ed25519'
  if (alg === 'RS256') return jwk.kty === 'RSA'
  if (alg === 'ES256') return jwk.kty === 'EC' && jwk.crv === 'P-256'
  return false
}

function verifyJwsSignatureWithJwk(alg, signingInputBuf, sigBuf, jwk) {
  if (!jwkMatchesAlg(jwk, alg)) {
    return false
  }
  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' })
  if (alg === 'EdDSA') {
    return crypto.verify(null, signingInputBuf, publicKey, sigBuf)
  }
  if (alg === 'RS256') {
    return crypto.verify('RSA-SHA256', signingInputBuf, publicKey, sigBuf)
  }
  if (alg === 'ES256') {
    return crypto.verify(
      'sha256',
      signingInputBuf,
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      sigBuf
    )
  }
  return false
}

function extractJwtScopes(claims) {
  const scopes = new Set()
  if (typeof claims.scope === 'string') {
    for (const part of claims.scope.split(/\s+/)) {
      const trimmed = part.trim()
      if (trimmed) scopes.add(trimmed)
    }
  }
  if (Array.isArray(claims.scp)) {
    for (const part of claims.scp) {
      if (typeof part === 'string' && part.trim()) scopes.add(part.trim())
    }
  }
  if (Array.isArray(claims.permissions)) {
    for (const part of claims.permissions) {
      if (typeof part === 'string' && part.trim()) scopes.add(part.trim())
    }
  }
  return Array.from(scopes)
}

/**
 * Verificador OIDC / JWT de producción sin claves privadas ni fallback a tokens estáticos.
 * Soporta firmas EdDSA, RS256 y ES256, validación estricta de `iss`/`aud`/`exp`/`nbf`,
 * cacheo + rotación segura de JWKS con timeout y fail-closed cuando JWKS no está disponible.
 *
 * @param {{
 *   issuer: string | string[],
 *   audience: string | string[],
 *   jwksUri?: string,
 *   jwks?: { keys: Record<string, any>[] },
 *   jwksFetcher?: () => Promise<{ keys: Record<string, any>[] }>,
 *   allowedAlgorithms?: readonly string[],
 *   allowedClientIds?: readonly string[],
 *   clockSkewSeconds?: number,
 *   jwksCacheTtlMs?: number,
 *   jwksFetchTimeoutMs?: number,
 *   minRefreshIntervalMs?: number,
 *   requireNbf?: boolean,
 *   allowInsecureLocalhostHttp?: boolean,
 *   allowNetworkFetch?: boolean,
 *   realOidcEnabled?: boolean,
 *   now?: (() => number | Date | string) | number | Date | string
 * }} options
 */
export function createOidcJwtClientAuthVerifier(options) {
  if (!options || typeof options !== 'object') {
    throw new Error('OIDC_CONFIG_INVALID: Se requiere configuración explícita para OIDC/JWT')
  }

  const rawIssuers = Array.isArray(options.issuer)
    ? options.issuer
    : [options.issuer]
  const trustedIssuers = new Set(
    rawIssuers
      .filter((s) => typeof s === 'string' && s.trim().length > 0)
      .map((s) => s.trim())
  )
  if (trustedIssuers.size === 0) {
    throw new Error('OIDC_CONFIG_INVALID: Se requiere al menos un issuer OIDC confiable')
  }

  const rawAudiences = Array.isArray(options.audience)
    ? options.audience
    : [options.audience]
  const allowedAudiences = new Set(
    rawAudiences
      .filter((s) => typeof s === 'string' && s.trim().length > 0)
      .map((s) => s.trim())
  )
  if (allowedAudiences.size === 0) {
    throw new Error('OIDC_CONFIG_INVALID: Se requiere al menos un audience OIDC válido')
  }

  const requestedAlgs = Array.isArray(options.allowedAlgorithms)
    ? options.allowedAlgorithms
    : OIDC_ALLOWED_ALGORITHMS
  if (requestedAlgs.length === 0) {
    throw new Error('OIDC_CONFIG_INVALID: allowedAlgorithms no puede ser vacío')
  }
  for (const alg of requestedAlgs) {
    if (!OIDC_ALLOWED_ALGORITHMS.includes(alg)) {
      throw new Error(
        `OIDC_ALGORITHM_REJECTED: Algoritmo JWT '${alg}' prohibido; permitidos: ${OIDC_ALLOWED_ALGORITHMS.join(', ')}`
      )
    }
  }
  const allowedAlgorithms = Object.freeze([...requestedAlgs])

  const allowInsecureLocalhostHttp = Boolean(options.allowInsecureLocalhostHttp)
  const dryRun = Boolean(options.dryRun)
  const allowedJwksHosts = Array.isArray(options.allowedJwksHosts)
    ? options.allowedJwksHosts
    : undefined
  const jwksUri = options.jwksUri
    ? assertSafeJwksUri(
        options.jwksUri,
        allowInsecureLocalhostHttp,
        allowedJwksHosts
      )
    : null
  const expectedJwksHost = jwksUri
    ? normalizeNetworkHostname(new URL(jwksUri).hostname)
    : null
  const jwksFetcher =
    typeof options.jwksFetcher === 'function' ? options.jwksFetcher : null
  const staticJwks = options.jwks || null
  const allowNetworkFetch = !dryRun && Boolean(options.allowNetworkFetch)

  if (!staticJwks && !jwksFetcher && !jwksUri) {
    throw new Error(
      'OIDC_CONFIG_INVALID: Debe configurarse jwksUri, jwksFetcher o jwks'
    )
  }

  const clockSkewSeconds =
    typeof options.clockSkewSeconds === 'number' &&
    Number.isFinite(options.clockSkewSeconds) &&
    options.clockSkewSeconds >= 0 &&
    options.clockSkewSeconds <= 300
      ? Math.floor(options.clockSkewSeconds)
      : DEFAULT_CLOCK_SKEW_SECONDS

  const jwksCacheTtlMs =
    typeof options.jwksCacheTtlMs === 'number' &&
    Number.isFinite(options.jwksCacheTtlMs) &&
    options.jwksCacheTtlMs > 0
      ? Math.floor(options.jwksCacheTtlMs)
      : DEFAULT_JWKS_CACHE_TTL_MS

  const jwksFetchTimeoutMs =
    typeof options.jwksFetchTimeoutMs === 'number' &&
    Number.isFinite(options.jwksFetchTimeoutMs) &&
    options.jwksFetchTimeoutMs > 0
      ? Math.floor(options.jwksFetchTimeoutMs)
      : DEFAULT_JWKS_FETCH_TIMEOUT_MS

  const minRefreshIntervalMs =
    typeof options.minRefreshIntervalMs === 'number' &&
    Number.isFinite(options.minRefreshIntervalMs) &&
    options.minRefreshIntervalMs >= 0
      ? Math.floor(options.minRefreshIntervalMs)
      : DEFAULT_JWKS_MIN_REFRESH_INTERVAL_MS

  const allowedClientIds = Array.isArray(options.allowedClientIds)
    ? new Set(
        options.allowedClientIds
          .filter((id) => typeof id === 'string' && id.trim().length > 0)
          .map((id) => id.trim())
      )
    : null

  const requireNbf = Boolean(options.requireNbf)
  const nowFn =
    typeof options.now === 'function'
      ? options.now
      : options.now !== undefined
        ? () => options.now
        : () => Date.now()

  /** @type {Record<string, any>[]} */
  let cachedKeys = Array.isArray(staticJwks?.keys) ? [...staticJwks.keys] : []
  let cacheLoadedAtMs = cachedKeys.length > 0 ? Date.now() : 0
  let lastFetchAttemptAtMs = 0
  let inFlightRefresh = null
  let lastJwksHealthy = cachedKeys.length > 0

  async function fetchRemoteJwksFromUri() {
    if (dryRun || !allowNetworkFetch) {
      throw new Error(
        dryRun
          ? 'OIDC_JWKS_UNAVAILABLE: Fetch HTTP a jwksUri bloqueado en modo DRY_RUN'
          : 'OIDC_JWKS_UNAVAILABLE: Fetch HTTP a jwksUri deshabilitado (ATTESTATION_REAL_INTEGRATION_ENABLED != true)'
      )
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), jwksFetchTimeoutMs)
    if (typeof timer.unref === 'function') timer.unref()
    try {
      const response = await fetch(jwksUri, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: controller.signal,
      })
      if (
        response.redirected === true ||
        (response.status >= 300 && response.status < 400)
      ) {
        throw new Error('OIDC_JWKS_REDIRECT_FORBIDDEN')
      }
      if (typeof response.url === 'string' && response.url.length > 0 && expectedJwksHost) {
        const finalHost = normalizeNetworkHostname(new URL(response.url).hostname)
        if (finalHost !== expectedJwksHost) {
          throw new Error('OIDC_JWKS_REDIRECT_FORBIDDEN')
        }
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const rawText = await response.text()
      if (Buffer.byteLength(rawText, 'utf8') > MAX_JWKS_BYTES) {
        throw new Error('OIDC_JWKS_TOO_LARGE')
      }
      const parsed = safeParseStrictJson(rawText)
      return parsed
    } finally {
      clearTimeout(timer)
    }
  }

  async function refreshJwksKeys(force = false) {
    if (!jwksFetcher && !jwksUri) {
      if (!Array.isArray(staticJwks?.keys) || staticJwks.keys.length === 0) {
        lastJwksHealthy = false
        throw new Error('OIDC_JWKS_UNAVAILABLE: JWKS estático vacío o no configurado')
      }
      cachedKeys = [...staticJwks.keys]
      lastJwksHealthy = cachedKeys.some(
        (k) => k && typeof k === 'object' && k.kty !== 'oct'
      )
      return cachedKeys
    }

    const nowWallMs = Date.now()
    if (
      force &&
      lastFetchAttemptAtMs > 0 &&
      nowWallMs - lastFetchAttemptAtMs < minRefreshIntervalMs
    ) {
      return cachedKeys
    }

    if (inFlightRefresh) {
      return await inFlightRefresh
    }

    lastFetchAttemptAtMs = nowWallMs
    inFlightRefresh = (async () => {
      let timer = null
      try {
        const loader = jwksFetcher ? Promise.resolve(jwksFetcher()) : fetchRemoteJwksFromUri()
        const jwksPayload = await Promise.race([
          loader,
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              reject(
                new Error(
                  `OIDC_JWKS_TIMEOUT: Timeout (${jwksFetchTimeoutMs}ms) obteniendo JWKS`
                )
              )
            }, jwksFetchTimeoutMs)
            if (typeof timer.unref === 'function') timer.unref()
          }),
        ])
        if (
          !jwksPayload ||
          typeof jwksPayload !== 'object' ||
          !Array.isArray(jwksPayload.keys)
        ) {
          throw new Error('OIDC_JWKS_INVALID: Payload JWKS sin arreglo keys[]')
        }
        const validKeys = jwksPayload.keys.filter(
          (k) => k && typeof k === 'object' && !Array.isArray(k) && k.kty !== 'oct'
        )
        if (validKeys.length === 0) {
          throw new Error('OIDC_JWKS_UNAVAILABLE: JWKS no contiene claves públicas válidas')
        }
        cachedKeys = validKeys
        cacheLoadedAtMs = Date.now()
        lastJwksHealthy = true
        return cachedKeys
      } catch (err) {
        lastJwksHealthy = false
        const msg = err?.message || String(err)
        if (msg.includes('OIDC_JWKS_')) throw err
        throw new Error(
          `OIDC_JWKS_UNAVAILABLE: Fallo cargando JWKS: ${msg}`
        )
      } finally {
        if (timer !== null) clearTimeout(timer)
        inFlightRefresh = null
      }
    })()

    return await inFlightRefresh
  }

  async function resolveKeysForHeader(header) {
    const nowWallMs = Date.now()
    const cacheExpired =
      cacheLoadedAtMs === 0 || nowWallMs - cacheLoadedAtMs > jwksCacheTtlMs
    if (cachedKeys.length === 0 || (cacheExpired && (jwksFetcher || jwksUri))) {
      await refreshJwksKeys(false)
    }

    const kid = typeof header.kid === 'string' && header.kid.trim() ? header.kid.trim() : null
    const findCandidates = (keys) => {
      if (kid) {
        return keys.filter((k) => k.kid === kid && jwkMatchesAlg(k, header.alg))
      }
      const eligible = keys.filter((k) => jwkMatchesAlg(k, header.alg))
      if (eligible.length > 1) {
        throw new Error(
          'OIDC_KEY_ID_REQUIRED: El JWT omitió header kid con múltiples claves JWKS activas'
        )
      }
      return eligible
    }

    let matches = findCandidates(cachedKeys)
    if (matches.length === 0 && kid && (jwksFetcher || jwksUri)) {
      await refreshJwksKeys(true)
      matches = findCandidates(cachedKeys)
    }

    if (matches.length === 0) {
      throw new Error(
        `OIDC_JWKS_KEY_NOT_FOUND: No se encontró clave pública compatible para kid='${kid || 'none'}' y alg='${header.alg}'`
      )
    }
    return matches
  }

  const realOidcConfigured = Boolean(
    !dryRun &&
      (options.realOidcEnabled ?? allowNetworkFetch) &&
      jwksUri &&
      jwksUri.startsWith('https://') &&
      !allowInsecureLocalhostHttp
  )

  return Object.freeze({
    verifierKind: 'OIDC_JWT_VERIFIER',
    trustScope: 'PRODUCTION',
    simulated: false,
    realOidcConfigured,
    realMtlsConfigured: false,
    isProductionAuthVerifier: () => true,

    async refreshJwks(force = false) {
      return await refreshJwksKeys(Boolean(force))
    },

    async isHealthy() {
      try {
        const nowWallMs = Date.now()
        const cacheExpired =
          cacheLoadedAtMs === 0 || nowWallMs - cacheLoadedAtMs > jwksCacheTtlMs
        if ((jwksFetcher || (jwksUri && allowNetworkFetch)) && (cacheExpired || !lastJwksHealthy)) {
          await refreshJwksKeys(false)
        } else if (jwksUri && !jwksFetcher && !staticJwks && !allowNetworkFetch) {
          return false
        }
        return (
          lastJwksHealthy &&
          cachedKeys.some((k) => k && typeof k === 'object' && k.kty !== 'oct')
        )
      } catch {
        return false
      }
    },

    /**
     * @param {Record<string, unknown>} headers
     * @param {{ now?: number | Date | string }} [context]
     */
    async verify(headers, context = {}) {
      if (!headers || typeof headers !== 'object') {
        throw new Error('CLIENT_AUTH_FAILED: Headers de autenticación ausentes')
      }
      const rawAuth = headers.authorization
      if (typeof rawAuth !== 'string' || rawAuth.trim().length === 0) {
        throw new Error('CLIENT_AUTH_FAILED: Header Authorization Bearer ausente')
      }
      if (!rawAuth.startsWith('Bearer ')) {
        throw new Error(
          'CLIENT_AUTH_FAILED: Esquema de autenticación inválido; se requiere Bearer JWT'
        )
      }
      const token = rawAuth.slice('Bearer '.length).trim()
      if (!token || Buffer.byteLength(token, 'utf8') > MAX_JWT_TOKEN_BYTES) {
        throw new Error('OIDC_TOKEN_MALFORMED: JWT ausente o excede tamaño máximo')
      }

      const parts = token.split('.')
      if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
        throw new Error(
          'UNMODELED_BEARER_TOKEN_REJECTED: Token Bearer estático/opaco rechazado; se requiere JWT OIDC firmado'
        )
      }

      const [headerSeg, payloadSeg, sigSeg] = parts
      let header
      let claims
      try {
        header = safeParseStrictJson(
          decodeBase64UrlToBuffer(headerSeg, 'header').toString('utf8')
        )
        claims = safeParseStrictJson(
          decodeBase64UrlToBuffer(payloadSeg, 'payload').toString('utf8')
        )
      } catch (parseErr) {
        throw new Error(
          `OIDC_TOKEN_MALFORMED: Header o payload JWT inválido: ${parseErr?.message || String(parseErr)}`
        )
      }

      if (!header || typeof header !== 'object' || Array.isArray(header)) {
        throw new Error('OIDC_TOKEN_MALFORMED: Header JWT inválido')
      }
      if (
        header.jwk !== undefined ||
        header.jku !== undefined ||
        header.x5u !== undefined ||
        header.x5c !== undefined
      ) {
        throw new Error(
          'OIDC_HEADER_KEY_INJECTION_FORBIDDEN: Prohibido embeber jwk/jku/x5u/x5c en header JWT'
        )
      }
      if (header.crit !== undefined) {
        throw new Error(
          'OIDC_CRITICAL_HEADER_UNSUPPORTED: Cabeceras críticas JWT (crit) no soportadas (fail-closed)'
        )
      }
      if (
        typeof header.alg !== 'string' ||
        header.alg.toLowerCase() === 'none' ||
        !allowedAlgorithms.includes(header.alg)
      ) {
        throw new Error(
          `OIDC_ALGORITHM_REJECTED: Algoritmo JWT '${String(header.alg)}' no permitido`
        )
      }
      if (header.typ !== undefined) {
        const normTyp = String(header.typ).trim().toLowerCase()
        if (normTyp !== 'jwt' && normTyp !== 'at+jwt' && normTyp !== 'application/jwt') {
          throw new Error(`OIDC_TOKEN_MALFORMED: Tipo JWT inválido '${header.typ}'`)
        }
      }

      if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
        throw new Error('OIDC_TOKEN_MALFORMED: Claims JWT inválidos')
      }

      // Validar firma antes de aceptar cualquier claim
      const sigBuf = decodeBase64UrlToBuffer(sigSeg, 'signature')
      const signingInputBuf = Buffer.from(`${headerSeg}.${payloadSeg}`, 'ascii')
      const candidateKeys = await resolveKeysForHeader(header)

      let signatureVerified = false
      for (const jwk of candidateKeys) {
        try {
          if (verifyJwsSignatureWithJwk(header.alg, signingInputBuf, sigBuf, jwk)) {
            signatureVerified = true
            break
          }
        } catch {
          // Intentar siguiente candidato si hubiera otro; falla cerrado si ninguno verifica
        }
      }
      if (!signatureVerified) {
        throw new Error(
          'OIDC_SIGNATURE_INVALID: Firma criptográfica JWT inválida o clave incorrecta'
        )
      }

      // Validación estricta de claims tras verificar firma
      const iss = typeof claims.iss === 'string' ? claims.iss.trim() : ''
      if (!iss || !trustedIssuers.has(iss)) {
        throw new Error(
          `OIDC_ISSUER_MISMATCH: Issuer '${iss || 'missing'}' no confiable`
        )
      }

      const rawAud = Array.isArray(claims.aud)
        ? claims.aud
        : typeof claims.aud === 'string'
          ? [claims.aud]
          : []
      const hasValidAudience = rawAud.some(
        (a) => typeof a === 'string' && allowedAudiences.has(a.trim())
      )
      if (!hasValidAudience) {
        throw new Error('OIDC_AUDIENCE_MISMATCH: Audience JWT no coincide con el servicio')
      }

      const effectiveNowInput =
        context?.now !== undefined ? context.now : nowFn()
      const nowSec = normalizeNowSeconds(effectiveNowInput)

      if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) {
        throw new Error('OIDC_EXP_CLAIM_REQUIRED: El token JWT debe declarar exp numérico')
      }
      if (nowSec >= claims.exp + clockSkewSeconds) {
        throw new Error('OIDC_TOKEN_EXPIRED: El token JWT ha expirado')
      }

      if (claims.nbf !== undefined) {
        if (typeof claims.nbf !== 'number' || !Number.isFinite(claims.nbf)) {
          throw new Error('OIDC_TOKEN_MALFORMED: Claim nbf inválido')
        }
        if (nowSec + clockSkewSeconds < claims.nbf) {
          throw new Error('OIDC_TOKEN_NOT_YET_VALID: Token JWT aún no vigente (nbf)')
        }
      } else if (requireNbf) {
        throw new Error('OIDC_TOKEN_MALFORMED: Claim nbf requerido')
      }

      if (claims.iat !== undefined) {
        if (typeof claims.iat !== 'number' || !Number.isFinite(claims.iat)) {
          throw new Error('OIDC_TOKEN_MALFORMED: Claim iat inválido')
        }
        if (claims.iat > nowSec + clockSkewSeconds + 300) {
          throw new Error('OIDC_TOKEN_INVALID: Claim iat demasiado futuro')
        }
      }

      const rawClientId =
        claims.client_id ?? claims.azp ?? claims.sub ?? ''
      const clientId =
        typeof rawClientId === 'string' ? rawClientId.trim() : ''
      if (!clientId) {
        throw new Error(
          'CLIENT_AUTH_IDENTITY_REQUIRED: JWT carece de client_id / azp / sub'
        )
      }
      if (allowedClientIds && !allowedClientIds.has(clientId)) {
        throw new Error(
          `CLIENT_AUTH_FAILED: Identidad OIDC '${clientId}' fuera de allowlist`
        )
      }

      const allowedScopes = extractJwtScopes(claims)
      if (allowedScopes.length === 0) {
        throw new Error(
          'CLIENT_AUTH_SCOPE_INSUFFICIENT: Token OIDC válido carece de alcances (scope/scp)'
        )
      }

      return Object.freeze({
        authenticated: true,
        clientId,
        authMechanism: 'OIDC_JWT',
        allowedScopes,
        isGoAuthority: false,
        simulated: false,
      })
    },
  })
}

function normalizeSha256Fingerprint(fp) {
  if (typeof fp !== 'string') return ''
  return fp.replace(/[:\s-]/g, '').toUpperCase()
}

/**
 * Verificador mTLS real apoyado en la negociación TLS del servidor HTTPS Node
 * (`request.socket.authorized` y `request.socket.getPeerCertificate(true)`).
 * Jamás acepta cabeceras HTTP suplantadas sin contexto TLS verificado.
 *
 * @param {{
 *   trustedCaPem: string,
 *   trustedClients: ReadonlyArray<{
 *     clientId: string,
 *     allowedScopes: readonly string[],
 *     sha256Fingerprint?: string,
 *     commonName?: string,
 *     subjectAltName?: string
 *   }>,
 *   now?: (() => number | Date | string) | number | Date | string
 * }} options
 */
export function createMtlsClientAuthVerifier(options) {
  if (!options || typeof options !== 'object') {
    throw new Error('CLIENT_AUTH_MTLS_CONFIG_INVALID: Configuración mTLS requerida')
  }
  const caPem =
    typeof options.trustedCaPem === 'string' ? options.trustedCaPem.trim() : ''
  if (!caPem || !caPem.includes('-----BEGIN CERTIFICATE-----')) {
    throw new Error(
      'CLIENT_AUTH_MTLS_CONFIG_INVALID: Se requiere trustedCaPem PEM explícita para mTLS'
    )
  }

  let caCertObj
  try {
    caCertObj = new crypto.X509Certificate(caPem)
  } catch (err) {
    throw new Error(
      `CLIENT_AUTH_MTLS_CONFIG_INVALID: Certificado CA confiable inválido: ${err?.message || String(err)}`
    )
  }

  const rawClients = Array.isArray(options.trustedClients)
    ? options.trustedClients
    : []
  if (rawClients.length === 0) {
    throw new Error(
      'CLIENT_AUTH_MTLS_CONFIG_INVALID: Se requiere allowlist trustedClients no vacía para mTLS'
    )
  }

  const trustedClients = rawClients.map((entry, idx) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`CLIENT_AUTH_MTLS_CONFIG_INVALID: trustedClients[${idx}] inválido`)
    }
    const clientId =
      typeof entry.clientId === 'string' ? entry.clientId.trim() : ''
    const allowedScopes = Array.isArray(entry.allowedScopes)
      ? entry.allowedScopes.filter((s) => typeof s === 'string' && s.trim())
      : []
    const fp = normalizeSha256Fingerprint(entry.sha256Fingerprint || '')
    const cnRaw =
      typeof entry.commonName === 'string'
        ? entry.commonName
        : typeof entry.subjectCN === 'string'
          ? entry.subjectCN
          : ''
    const cn = cnRaw.trim()
    const san =
      typeof entry.subjectAltName === 'string'
        ? entry.subjectAltName.trim()
        : ''
    const sanDnsNames = Array.isArray(entry.sanDnsNames)
      ? entry.sanDnsNames
          .filter((s) => typeof s === 'string' && s.trim())
          .map((s) => s.trim().toLowerCase())
      : []
    const sanUris = Array.isArray(entry.sanUris)
      ? entry.sanUris
          .filter((s) => typeof s === 'string' && s.trim())
          .map((s) => s.trim())
      : []
    if (
      san.includes('*') ||
      san.includes(',') ||
      cn.includes('*') ||
      sanDnsNames.some((d) => d.includes('*') || d.includes(',') || /\s/.test(d)) ||
      sanUris.some((u) => u.includes(',') || /\s/.test(u))
    ) {
      throw new Error(
        `CLIENT_AUTH_MTLS_CONFIG_INVALID: trustedClients[${idx}] contiene wildcards o delimitadores SAN no permitidos`
      )
    }
    if (
      !clientId ||
      allowedScopes.length === 0 ||
      (!fp && !cn && !san && sanDnsNames.length === 0 && sanUris.length === 0)
    ) {
      throw new Error(
        `CLIENT_AUTH_MTLS_CONFIG_INVALID: trustedClients[${idx}] requiere clientId, allowedScopes y sha256Fingerprint/commonName/subjectCN/SAN`
      )
    }
    if (fp && !/^[0-9A-F]{64}$/.test(fp)) {
      throw new Error(
        `CLIENT_AUTH_MTLS_CONFIG_INVALID: Huella SHA-256 inválida en trustedClients[${idx}]`
      )
    }
    return Object.freeze({
      clientId,
      allowedScopes: Object.freeze([...allowedScopes]),
      sha256Fingerprint: fp,
      commonName: cn,
      subjectAltName: san,
      sanDnsNames: Object.freeze(sanDnsNames),
      sanUris: Object.freeze(sanUris),
    })
  })

  const nowFn =
    typeof options.now === 'function'
      ? options.now
      : options.now !== undefined
        ? () => options.now
        : () => Date.now()

  function resolveNowMs(contextNow) {
    const raw = contextNow !== undefined ? contextNow : nowFn()
    const ms =
      typeof raw === 'number'
        ? raw
        : raw instanceof Date
          ? raw.getTime()
          : Date.parse(String(raw))
    if (!Number.isFinite(ms)) {
      throw new Error('CLIENT_AUTH_MTLS_ERROR: Timestamp inválido')
    }
    return ms
  }

  return Object.freeze({
    verifierKind: 'MTLS_CLIENT_VERIFIER',
    trustScope: 'PRODUCTION',
    simulated: false,
    realOidcConfigured: false,
    realMtlsConfigured: true,
    trustedCaPem: caPem,
    isProductionAuthVerifier: () => true,

    async isHealthy() {
      try {
        const nowMs = resolveNowMs(undefined)
        const caFrom = Date.parse(caCertObj.validFrom)
        const caTo = Date.parse(caCertObj.validTo)
        return (
          trustedClients.length > 0 &&
          Number.isFinite(caFrom) &&
          Number.isFinite(caTo) &&
          nowMs >= caFrom &&
          nowMs <= caTo
        )
      } catch {
        return false
      }
    },

    /**
     * @param {Record<string, unknown>} headers
     * @param {{ transportSecurity?: Record<string, any> | null, now?: number | Date | string }} [context]
     */
    async verify(headers, context = {}) {
      const ts = context?.transportSecurity || null
      if (!ts || ts.tlsEncrypted !== true || !ts.peerCertificate) {
        if (
          headers &&
          (headers['x-ssl-client-cert'] ||
            headers['x-client-cert'] ||
            headers['x-forwarded-client-cert'])
        ) {
          throw new Error(
            'CLIENT_AUTH_MTLS_REQUIRED: Cabecera mTLS sin sesión TLS verificada rechazada (spoofing prevenido)'
          )
        }
        throw new Error(
          'CLIENT_AUTH_MTLS_REQUIRED: Se requiere conexión HTTPS/mTLS con certificado cliente válido'
        )
      }

      if (ts.tlsAuthorized !== true) {
        throw new Error(
          `CLIENT_AUTH_MTLS_UNTRUSTED: Certificado cliente rechazado por TLS CA (${String(ts.tlsAuthorizationError || 'UNTRUSTED')})`
        )
      }

      const peer = ts.peerCertificate
      const nowMs = resolveNowMs(context?.now)
      const validFromMs = peer.valid_from ? Date.parse(peer.valid_from) : NaN
      const validToMs = peer.valid_to ? Date.parse(peer.valid_to) : NaN
      if (Number.isFinite(validFromMs) && nowMs < validFromMs) {
        throw new Error(
          'CLIENT_AUTH_MTLS_CERT_NOT_YET_VALID: Certificado cliente aún no vigente'
        )
      }
      if (Number.isFinite(validToMs) && nowMs > validToMs) {
        throw new Error(
          'CLIENT_AUTH_MTLS_CERT_EXPIRED: Certificado cliente mTLS expirado'
        )
      }

      const peerFp = normalizeSha256Fingerprint(peer.fingerprint256 || '')
      const peerCn =
        typeof peer.subject?.CN === 'string' ? peer.subject.CN.trim() : ''
      const peerSanRaw =
        typeof peer.subjectAltNameSanitized === 'string'
          ? peer.subjectAltNameSanitized.trim()
          : typeof peer.subjectaltNameSanitized === 'string'
            ? peer.subjectaltNameSanitized.trim()
            : typeof peer.subjectaltname === 'string'
              ? peer.subjectaltname.trim()
              : ''
      const peerSanEntries = new Set(
        peerSanRaw
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      )
      const peerSanNormalized = new Set(
        Array.from(peerSanEntries).map((item) =>
          item.startsWith('DNS:')
            ? `DNS:${item.slice(4).trim().toLowerCase()}`
            : item
        )
      )

      const matched = trustedClients.find((candidate) => {
        if (
          candidate.sha256Fingerprint &&
          candidate.sha256Fingerprint !== peerFp
        ) {
          return false
        }
        if (candidate.commonName && candidate.commonName !== peerCn) {
          return false
        }
        if (candidate.subjectAltName) {
          const expectedSan = candidate.subjectAltName.startsWith('DNS:')
            ? `DNS:${candidate.subjectAltName.slice(4).trim().toLowerCase()}`
            : candidate.subjectAltName
          if (
            !peerSanEntries.has(candidate.subjectAltName) &&
            !peerSanNormalized.has(expectedSan)
          ) {
            return false
          }
        }
        if (
          candidate.sanDnsNames.length > 0 &&
          !candidate.sanDnsNames.some((dns) =>
            peerSanNormalized.has(`DNS:${dns}`)
          )
        ) {
          return false
        }
        if (
          candidate.sanUris.length > 0 &&
          !candidate.sanUris.some((uri) => peerSanEntries.has(`URI:${uri}`))
        ) {
          return false
        }
        return true
      })

      if (!matched) {
        throw new Error(
          'CLIENT_AUTH_MTLS_CLIENT_NOT_ALLOWED: Certificado cliente válido por CA pero fuera de allowlist mTLS'
        )
      }

      return Object.freeze({
        authenticated: true,
        clientId: matched.clientId,
        authMechanism: 'MTLS_X509',
        allowedScopes: [...matched.allowedScopes],
        isGoAuthority: false,
        simulated: false,
      })
    },
  })
}
