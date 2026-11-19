/**
 * EXT-REAL-07 — Suite de Integración Controlada y Hardening Pre-Infraestructura Real
 *
 * Valida localmente:
 * - Verificador OIDC / JWT real (EdDSA, RS256, ES256, rotación JWKS, errores/exp/alg=none/oct/JWKS 503)
 * - Verificador mTLS real extremo-a-extremo sobre HTTPS/TLS mutuo Node (CA, allowlist, cert expirado/no confiable, rechazo de headers suplantados)
 * - Adaptador PostgreSQL endurecido (PGlite real, >=100 concurrencia multi-nodo, bugfix de commit de estado EXPIRED en lease expirado, timeouts, aislamiento)
 * - Adaptador DynamoDB endurecido (throttling/contention/TTL/timeout/health)
 * - Proveedores KMS (AWS/GCP timeout, algorithm/keyId/SPKI mismatch, readiness/health y falla antes de reservar)
 * - Guardrails explícitos `ATTESTATION_REAL_INTEGRATION_ENABLED=true` (por defecto deshabilitado = SKIPPED + 0 llamadas de red)
 */

import { describe, it, expect, afterEach } from 'vitest'
import crypto from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import { PGlite } from '@electric-sql/pglite'

import {
  computeAttestationRequestDigest,
  PR02_P0_COLECTOR_IDENTIDAD,
} from '../../scripts/fiscal/plan-pr02-parameters.mjs'

import {
  TestSigningProvider,
  AwsKmsSigningProvider,
  GcpKmsSigningProvider,
  ServiceAntiReplayGuard,
  IndependentAttestationAuthorityService,
  IndependentAttestationHttpServer,
  createConfiguredAuthorityFromEnv,
  createOidcJwtClientAuthVerifier,
  createMtlsClientAuthVerifier,
  TestOnlyGoAuthorityIssuer,
  verifyServiceAttestationResponse,
  PostgresDistributedAntiReplayStore,
  POSTGRESQL_PRODUCTION_READY,
  POSTGRESQL_REAL_INTEGRATION_TESTED,
  buildDynamoDbReserveTransactItems,
  DynamoDbDistributedAntiReplayStore,
  AWS_DYNAMODB_REAL_TESTED,
  DYNAMODB_PRODUCTION_READY,
  isRealIntegrationEnabled,
  assertDedicatedPostgresUrl,
  createControlledPostgresStoreFromEnv,
  createControlledDynamoDbStoreFromEnv,
  createControlledKmsProviderFromEnv,
  type DynamoDbClientAdapter,
  type OidcJwkKey,
  type PostgresPoolExecutor,
  type PostgresQueryExecutor,
} from '../../services/independent-attestation-authority/src/index.mjs'

const VALID_PROJECT_REF = 'acoyfwwmhaeruciyedri'
const VALID_COMMIT_SHA = '014ec379a46fc14703b2542ad8bbdd0c97ef8de0'
const VALID_COLLECTOR_ID = PR02_P0_COLECTOR_IDENTIDAD
const VALID_SCOPE = 'PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'

const pgliteInstances: PGlite[] = []
const serversToClose: Array<{ close: () => Promise<void> }> = []
const rawHttpServersToClose: http.Server[] = []

afterEach(async () => {
  while (serversToClose.length > 0) {
    const srv = serversToClose.pop()!
    try {
      await srv.close()
    } catch {
      // ignore cleanup
    }
  }
  while (rawHttpServersToClose.length > 0) {
    const srv = rawHttpServersToClose.pop()!
    await new Promise<void>((resolve) => srv.close(() => resolve()))
  }
  while (pgliteInstances.length > 0) {
    const db = pgliteInstances.pop()!
    try {
      await db.close()
    } catch {
      // ignore cleanup
    }
  }
})

// ---------------------------------------------------------------------------
// Helpers deterministas de PKI X.509 (DER/ASN.1 puro sin dependencias CLI externas)
// ---------------------------------------------------------------------------

function derLen(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len])
  const bytes: number[] = []
  let tmp = len
  while (tmp > 0) {
    bytes.unshift(tmp & 0xff)
    tmp >>= 8
  }
  return Buffer.from([0x80 | bytes.length, ...bytes])
}

function derTag(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLen(content.length), content])
}

function derSeq(...items: Buffer[]): Buffer {
  return derTag(0x30, Buffer.concat(items))
}

function derSet(...items: Buffer[]): Buffer {
  return derTag(0x31, Buffer.concat(items))
}

function derOid(oidStr: string): Buffer {
  const parts = oidStr.split('.').map(Number)
  const out: number[] = [parts[0] * 40 + parts[1]]
  for (let i = 2; i < parts.length; i++) {
    let val = parts[i]
    const sub: number[] = [val & 0x7f]
    val >>= 7
    while (val > 0) {
      sub.unshift((val & 0x7f) | 0x80)
      val >>= 7
    }
    out.push(...sub)
  }
  return derTag(0x06, Buffer.from(out))
}

function derInt(num: number): Buffer {
  if (num === 0) return derTag(0x02, Buffer.from([0x00]))
  const bytes: number[] = []
  let tmp = num
  while (tmp > 0) {
    bytes.unshift(tmp & 0xff)
    tmp >>= 8
  }
  if (bytes[0] & 0x80) bytes.unshift(0x00)
  return derTag(0x02, Buffer.from(bytes))
}

function derUtf8(text: string): Buffer {
  return derTag(0x0c, Buffer.from(text, 'utf8'))
}

function derGeneralizedTime(date: Date): Buffer {
  const pad = (n: number) => String(n).padStart(2, '0')
  const str =
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  return derTag(0x18, Buffer.from(str, 'ascii'))
}

function derBitString(bytes: Buffer): Buffer {
  return derTag(0x03, Buffer.concat([Buffer.from([0x00]), bytes]))
}

function derName(cn: string, org = 'KioskoPOS Test'): Buffer {
  return derSeq(
    derSet(derSeq(derOid('2.5.4.10'), derUtf8(org))),
    derSet(derSeq(derOid('2.5.4.3'), derUtf8(cn)))
  )
}

function derExtension(oid: string, critical: boolean, value: Buffer): Buffer {
  const parts = [derOid(oid)]
  if (critical) {
    parts.push(derTag(0x01, Buffer.from([0xff])))
  }
  parts.push(derTag(0x04, value))
  return derSeq(...parts)
}

function formatPemCert(der: Buffer): string {
  const b64 = der.toString('base64')
  const lines = b64.match(/.{1,64}/g) ?? []
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`
}

function buildTestX509Certificate(params: {
  subjectCn: string
  issuerCn: string
  subjectPublicKey: crypto.KeyObject
  issuerPrivateKey: crypto.KeyObject
  serialNumber: number
  notBefore: Date
  notAfter: Date
  isCa?: boolean
  sanDnsNames?: readonly string[]
  sanIps?: readonly string[]
}): string {
  const spkiDer = params.subjectPublicKey.export({
    type: 'spki',
    format: 'der',
  }) as Buffer

  // AlgorithmIdentifier for ECDSA-with-SHA256 (1.2.840.10045.4.3.2)
  const sigAlgId = derSeq(derOid('1.2.840.10045.4.3.2'))

  const extensions: Buffer[] = []
  if (params.isCa) {
    extensions.push(derExtension('2.5.29.19', true, derSeq(derTag(0x01, Buffer.from([0xff])))))
    extensions.push(derExtension('2.5.29.15', true, derBitString(Buffer.from([0x06])))) // keyCertSign | cRLSign
  } else {
    extensions.push(derExtension('2.5.29.19', true, derSeq()))
  }

  if ((params.sanDnsNames && params.sanDnsNames.length > 0) || (params.sanIps && params.sanIps.length > 0)) {
    const sanItems: Buffer[] = []
    for (const dns of params.sanDnsNames ?? []) {
      sanItems.push(derTag(0x82, Buffer.from(dns, 'ascii')))
    }
    for (const ip of params.sanIps ?? []) {
      const octets = ip.split('.').map(Number)
      sanItems.push(derTag(0x87, Buffer.from(octets)))
    }
    extensions.push(derExtension('2.5.29.17', false, derSeq(...sanItems)))
  }

  const tbs = derSeq(
    derTag(0xa0, derInt(2)), // v3
    derInt(params.serialNumber),
    sigAlgId,
    derName(params.issuerCn),
    derSeq(derGeneralizedTime(params.notBefore), derGeneralizedTime(params.notAfter)),
    derName(params.subjectCn),
    spkiDer,
    derTag(0xa3, derSeq(...extensions))
  )

  const signature = crypto.sign('sha256', tbs, params.issuerPrivateKey)
  const certDer = derSeq(tbs, sigAlgId, derBitString(signature))
  return formatPemCert(certDer)
}

function generateEphemeralPkiBundle() {
  const now = Date.now()
  const validFrom = new Date(now - 3_600_000)
  const validTo = new Date(now + 86_400_000)

  const caKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const caCertPem = buildTestX509Certificate({
    subjectCn: 'kioskopos-test-root-ca',
    issuerCn: 'kioskopos-test-root-ca',
    subjectPublicKey: caKeys.publicKey,
    issuerPrivateKey: caKeys.privateKey,
    serialNumber: 1,
    notBefore: validFrom,
    notAfter: validTo,
    isCa: true,
  })

  const rogueCaKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const rogueCaCertPem = buildTestX509Certificate({
    subjectCn: 'rogue-untrusted-ca',
    issuerCn: 'rogue-untrusted-ca',
    subjectPublicKey: rogueCaKeys.publicKey,
    issuerPrivateKey: rogueCaKeys.privateKey,
    serialNumber: 2,
    notBefore: validFrom,
    notAfter: validTo,
    isCa: true,
  })

  const serverKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const serverCertPem = buildTestX509Certificate({
    subjectCn: 'localhost',
    issuerCn: 'kioskopos-test-root-ca',
    subjectPublicKey: serverKeys.publicKey,
    issuerPrivateKey: caKeys.privateKey,
    serialNumber: 10,
    notBefore: validFrom,
    notAfter: validTo,
    sanDnsNames: ['localhost'],
    sanIps: ['127.0.0.1'],
  })
  const serverKeyPem = serverKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

  const clientAllowedKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const clientAllowedCertPem = buildTestX509Certificate({
    subjectCn: 'pr02-collector-mtls-client',
    issuerCn: 'kioskopos-test-root-ca',
    subjectPublicKey: clientAllowedKeys.publicKey,
    issuerPrivateKey: caKeys.privateKey,
    serialNumber: 20,
    notBefore: validFrom,
    notAfter: validTo,
    sanDnsNames: ['collector.pr02.internal'],
  })
  const clientAllowedKeyPem = clientAllowedKeys.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  }) as string

  const clientOtherValidKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const clientOtherValidCertPem = buildTestX509Certificate({
    subjectCn: 'unknown-service-same-ca',
    issuerCn: 'kioskopos-test-root-ca',
    subjectPublicKey: clientOtherValidKeys.publicKey,
    issuerPrivateKey: caKeys.privateKey,
    serialNumber: 21,
    notBefore: validFrom,
    notAfter: validTo,
  })
  const clientOtherValidKeyPem = clientOtherValidKeys.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  }) as string

  const clientRogueKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const clientRogueCertPem = buildTestX509Certificate({
    subjectCn: 'pr02-collector-mtls-client',
    issuerCn: 'rogue-untrusted-ca',
    subjectPublicKey: clientRogueKeys.publicKey,
    issuerPrivateKey: rogueCaKeys.privateKey,
    serialNumber: 22,
    notBefore: validFrom,
    notAfter: validTo,
  })
  const clientRogueKeyPem = clientRogueKeys.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  }) as string

  const clientExpiredKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const clientExpiredCertPem = buildTestX509Certificate({
    subjectCn: 'pr02-collector-mtls-client',
    issuerCn: 'kioskopos-test-root-ca',
    subjectPublicKey: clientExpiredKeys.publicKey,
    issuerPrivateKey: caKeys.privateKey,
    serialNumber: 23,
    notBefore: new Date(now - 7_200_000),
    notAfter: new Date(now - 3_600_000),
  })
  const clientExpiredKeyPem = clientExpiredKeys.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  }) as string

  const allowedFp = new crypto.X509Certificate(clientAllowedCertPem).fingerprint256.replace(/:/g, '')

  return {
    caCertPem,
    rogueCaCertPem,
    serverCertPem,
    serverKeyPem,
    clientAllowedCertPem,
    clientAllowedKeyPem,
    clientAllowedFingerprint: allowedFp,
    clientOtherValidCertPem,
    clientOtherValidKeyPem,
    clientRogueCertPem,
    clientRogueKeyPem,
    clientExpiredCertPem,
    clientExpiredKeyPem,
  }
}

// ---------------------------------------------------------------------------
// Helpers JWT / OIDC + Request Builders
// ---------------------------------------------------------------------------

function signTestJwt(params: {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  alg: 'EdDSA' | 'RS256' | 'ES256' | 'HS256' | 'none'
  privateKey?: crypto.KeyObject
  hmacSecret?: string
}): string {
  const h = Buffer.from(JSON.stringify(params.header), 'utf8').toString('base64url')
  const p = Buffer.from(JSON.stringify(params.payload), 'utf8').toString('base64url')
  const signingInput = Buffer.from(`${h}.${p}`, 'ascii')

  if (params.alg === 'none') {
    return `${h}.${p}.`
  }
  if (params.alg === 'HS256') {
    const sig = crypto
      .createHmac('sha256', params.hmacSecret || 'hmac-secret')
      .update(signingInput)
      .digest()
      .toString('base64url')
    return `${h}.${p}.${sig}`
  }
  if (params.alg === 'EdDSA') {
    const sig = crypto.sign(null, signingInput, params.privateKey!).toString('base64url')
    return `${h}.${p}.${sig}`
  }
  if (params.alg === 'RS256') {
    const sig = crypto.sign('sha256', signingInput, params.privateKey!).toString('base64url')
    return `${h}.${p}.${sig}`
  }
  const sig = crypto
    .sign('sha256', signingInput, {
      key: params.privateKey!,
      dsaEncoding: 'ieee-p1363',
    })
    .toString('base64url')
  return `${h}.${p}.${sig}`
}

function exportJwkWithKid(
  publicKey: crypto.KeyObject,
  kid: string,
  alg: 'EdDSA' | 'RS256' | 'ES256'
): OidcJwkKey {
  const exported = publicKey.export({ format: 'jwk' }) as Record<string, unknown>
  return {
    kty: String(exported.kty),
    ...(exported.crv ? { crv: String(exported.crv) } : {}),
    ...(exported.x ? { x: String(exported.x) } : {}),
    ...(exported.y ? { y: String(exported.y) } : {}),
    ...(exported.n ? { n: String(exported.n) } : {}),
    ...(exported.e ? { e: String(exported.e) } : {}),
    kid,
    use: 'sig',
    alg,
  }
}

function buildSignedRequestFixture(
  goIssuer: TestOnlyGoAuthorityIssuer,
  nowMs = Date.now(),
  overrides: Record<string, unknown> = {}
) {
  const id = crypto.randomUUID()
  const issuedAt = new Date(nowMs - 5_000).toISOString()
  const expiresAt = new Date(nowMs + 600_000).toISOString()
  const base = {
    schemaVersion: '1.0' as const,
    requestId: `ext07-req-${id}`,
    processId: `ext07-proc-${id}`,
    executionScope: VALID_SCOPE,
    commitSha: VALID_COMMIT_SHA,
    environment: 'HOMOLOGACION' as const,
    projectRef: VALID_PROJECT_REF,
    authorizationId: `ext07-auth-${id}`,
    goAuthorizationDocumentSha256: 'a'.repeat(64),
    manifestSha256: 'b'.repeat(64),
    rawSoapArtifacts: [
      { name: 'FEParamGetTiposIva_response.xml', sha256: 'c'.repeat(64) },
      { name: 'FEParamGetCondicionIvaReceptor_response.xml', sha256: 'd'.repeat(64) },
    ],
    normalizedArtifacts: [
      { name: 'FEParamGetTiposIva_normalized.json', sha256: 'e'.repeat(64) },
      { name: 'FEParamGetCondicionIvaReceptor_normalized.json', sha256: 'f'.repeat(64) },
    ],
    consultadoEn: '2026-11-13T16:00:00.000Z',
    requestedAt: issuedAt,
    collectorIdentity: VALID_COLLECTOR_ID,
    ...overrides,
  }
  const digest = computeAttestationRequestDigest(base)
  const fullReq = {
    ...base,
    requestSha256:
      overrides.requestSha256 !== undefined ? String(overrides.requestSha256) : digest,
  }
  const grant = goIssuer.issueGrant({
    authorizationId: fullReq.authorizationId,
    requestId: fullReq.requestId,
    processId: fullReq.processId,
    executionScope: fullReq.executionScope,
    environment: fullReq.environment,
    projectRef: fullReq.projectRef,
    commitSha: fullReq.commitSha,
    requestSha256: fullReq.requestSha256,
    issuedAt,
    notBefore: issuedAt,
    expiresAt,
  })
  return {
    ...fullReq,
    goAuthorizationGrant: grant,
  }
}

async function createIsolatedServiceBundle(options: {
  clientAuthVerifier: ReturnType<typeof createOidcJwtClientAuthVerifier> | ReturnType<typeof createMtlsClientAuthVerifier>
  store?: PostgresDistributedAntiReplayStore | DynamoDbDistributedAntiReplayStore
  kmsSigner?: AwsKmsSigningProvider | GcpKmsSigningProvider
  now?: () => number
  tlsOptions?: {
    key: string
    cert: string
    ca?: string
    requestCert?: boolean
    rejectUnauthorized?: boolean
  }
  requireHttps?: boolean
  trustProxyHttps?: boolean
}) {
  const baseSigner = new TestSigningProvider({ authorityId: 'ext07-att-authority-v1' })
  const goIssuer = new TestOnlyGoAuthorityIssuer({ authorityId: 'ext07-go-authority-v1' })

  const kmsSignCalls: string[] = []
  const kmsProvider =
    options.kmsSigner ??
    new GcpKmsSigningProvider({
      authorityId: baseSigner.authorityId,
      keyId: baseSigner.keyId ?? undefined,
      publicKeySpki: baseSigner.publicKeySpki ?? undefined,
      keyVersionName: 'projects/ext07/locations/global/keyRings/att/cryptoKeys/k1/cryptoKeyVersions/1',
      testDoubleOnly: false,
      gcpKmsClient: {
        async asymmetricSign({ name, data }) {
          kmsSignCalls.push(name)
          const sigHex = baseSigner.sign(data)
          return [{ signature: Buffer.from(sigHex, 'hex'), name }]
        },
      },
    })

  let sharedStore = options.store
  if (!sharedStore) {
    const db = new PGlite()
    pgliteInstances.push(db)
    const executor: PostgresQueryExecutor = {
      async query(sql: string, params?: readonly unknown[]) {
        const res = await db.query<Record<string, unknown>>(
          sql,
          params ? [...params] : undefined
        )
        return {
          rows: res.rows,
          rowCount: res.rows.length > 0 ? res.rows.length : (res.affectedRows ?? 0),
        }
      },
    }
    sharedStore = new PostgresDistributedAntiReplayStore({
      queryClient: executor,
      now: options.now,
    })
    await sharedStore.ensureSchema()
  }

  const guard = new ServiceAntiReplayGuard({
    storageType: 'distributed',
    nodeId: 'ext07-node-1',
    leaseTtlMs: 30_000,
    distributedStore: sharedStore,
    now: options.now,
  })

  const service = new IndependentAttestationAuthorityService({
    signingProvider: kmsProvider,
    antiReplayGuard: guard,
    serviceEnvironment: 'PRODUCTION',
    protectedMode: true,
    requireSignedGoGrant: true,
    authorityId: baseSigner.authorityId,
    trustedGoAuthorityId: goIssuer.authorityId,
    trustedGoKeyId: goIssuer.keyId,
    trustedGoPublicKeySpki: goIssuer.publicKeySpki,
    expectedProjectRef: VALID_PROJECT_REF,
    expectedCommitSha: VALID_COMMIT_SHA,
    attestationResponseVersion: '1.1',
    clientAuthVerifier: options.clientAuthVerifier,
    now: options.now,
    env: { NODE_ENV: 'production', ATTESTATION_ENVIRONMENT: 'PRODUCTION' },
  })

  const server = new IndependentAttestationHttpServer({
    service,
    requireHttps: options.requireHttps ?? false,
    trustProxyHttps: options.trustProxyHttps ?? true,
    tlsOptions: options.tlsOptions,
  })
  serversToClose.push(server)

  return {
    baseSigner,
    goIssuer,
    kmsProvider,
    kmsSignCalls,
    store: sharedStore,
    guard,
    service,
    server,
  }
}

function sendHttpsJsonRequest(params: {
  url: string
  path: string
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  caPem: string
  clientCertPem?: string
  clientKeyPem?: string
}): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(params.url)
    const req = https.request(
      {
        hostname: 'localhost',
        port: Number(parsed.port),
        path: params.path,
        method: params.method ?? 'POST',
        headers: params.headers,
        ca: params.caPem,
        cert: params.clientCertPem,
        key: params.clientKeyPem,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
      }
    )
    req.on('error', reject)
    if (params.body) {
      req.write(params.body)
    }
    req.end()
  })
}

// ---------------------------------------------------------------------------
// SUITE LOCAL-ONLY EXT-REAL-07
// ---------------------------------------------------------------------------

describe('EXT-REAL-07 — Real Infrastructure Readiness (Local + Adversarial + Controlled Harness)', () => {
  it('EXT07-OIDC-01: Verifica JWT OIDC reales (EdDSA, RS256, ES256) con rotación JWKS y flags honestas', async () => {
    const fixedNowMs = 1_800_000_000_000
    const nowSec = Math.floor(fixedNowMs / 1000)

    const edKeys = crypto.generateKeyPairSync('ed25519')
    const rsaKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
    const ecKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const rotatedEdKeys = crypto.generateKeyPairSync('ed25519')

    let activeKeys: OidcJwkKey[] = [
      exportJwkWithKid(edKeys.publicKey, 'ed-k1', 'EdDSA'),
      exportJwkWithKid(rsaKeys.publicKey, 'rsa-k1', 'RS256'),
      exportJwkWithKid(ecKeys.publicKey, 'ec-k1', 'ES256'),
    ]
    let jwksFetches = 0

    const verifier = createOidcJwtClientAuthVerifier({
      issuer: 'https://issuer.pr02.local',
      audience: 'attestation-authority-api',
      allowedAlgorithms: ['EdDSA', 'RS256', 'ES256'],
      allowedClientIds: ['svc-collector-pr02'],
      minRefreshIntervalMs: 0,
      now: () => fixedNowMs,
      jwksFetcher: async () => {
        jwksFetches += 1
        return { keys: activeKeys }
      },
    })

    expect(verifier.realOidcConfigured).toBe(false)

    const bundle = await createIsolatedServiceBundle({
      clientAuthVerifier: verifier,
      now: () => fixedNowMs,
    })
    const { url } = await bundle.server.start(0)

    const health = await (await fetch(`${url}/health`)).json()
    expect(health.oidcRealConfigured).toBe(false)
    expect(health.mtlsRealConfigured).toBe(false)
    expect(health.kmsRealConfigured).toBe(false)
    expect(health.authorityRealWorldAvailable).toBe(false)

    const readiness = await (await fetch(`${url}/readiness`)).json()
    expect(readiness.ready).toBe(true)
    expect(readiness.authHealthy).toBe(true)
    expect(readiness.providerHealthy).toBe(true)

    const baseClaims = (jti: string) => ({
      iss: 'https://issuer.pr02.local',
      aud: 'attestation-authority-api',
      sub: 'svc-collector-pr02',
      client_id: 'svc-collector-pr02',
      scope: VALID_SCOPE,
      jti,
      iat: nowSec - 10,
      nbf: nowSec - 10,
      exp: nowSec + 300,
    })

    for (const entry of [
      { kid: 'ed-k1', alg: 'EdDSA' as const, key: edKeys.privateKey },
      { kid: 'rsa-k1', alg: 'RS256' as const, key: rsaKeys.privateKey },
      { kid: 'ec-k1', alg: 'ES256' as const, key: ecKeys.privateKey },
    ]) {
      const jwt = signTestJwt({
        alg: entry.alg,
        header: { typ: 'JWT', alg: entry.alg, kid: entry.kid },
        payload: baseClaims(`jti-${entry.alg}`),
        privateKey: entry.key,
      })
      const req = buildSignedRequestFixture(bundle.goIssuer, fixedNowMs)
      const res = await fetch(`${url}/attestations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-Proto': 'https',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(req),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      const check = verifyServiceAttestationResponse(body, {
        trustedAttestationPublicKey: bundle.baseSigner.publicKeySpki!,
        pinnedKeyId: bundle.baseSigner.keyId,
      })
      expect(check.valid).toBe(true)
    }

    // Rotación JWKS: retira ed-k1 y agrega ed-k2
    activeKeys = [exportJwkWithKid(rotatedEdKeys.publicKey, 'ed-k2', 'EdDSA')]

    const rotatedJwt = signTestJwt({
      alg: 'EdDSA',
      header: { typ: 'JWT', alg: 'EdDSA', kid: 'ed-k2' },
      payload: baseClaims('jti-rotated-k2'),
      privateKey: rotatedEdKeys.privateKey,
    })
    const reqRot = buildSignedRequestFixture(bundle.goIssuer, fixedNowMs)
    const rotRes = await fetch(`${url}/attestations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-Proto': 'https',
        Authorization: `Bearer ${rotatedJwt}`,
      },
      body: JSON.stringify(reqRot),
    })
    expect(rotRes.status).toBe(200)
    expect(jwksFetches).toBeGreaterThanOrEqual(2)

    // Clave vieja ya retirada debe fallar fail-closed
    const staleJwt = signTestJwt({
      alg: 'EdDSA',
      header: { typ: 'JWT', alg: 'EdDSA', kid: 'ed-k1' },
      payload: baseClaims('jti-stale-k1'),
      privateKey: edKeys.privateKey,
    })
    const reqStale = buildSignedRequestFixture(bundle.goIssuer, fixedNowMs)
    const staleRes = await fetch(`${url}/attestations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-Proto': 'https',
        Authorization: `Bearer ${staleJwt}`,
      },
      body: JSON.stringify(reqStale),
    })
    expect(staleRes.status).toBe(401)
  }, 15000)

  it('EXT07-OIDC-02: Rechaza alg=none, oct, firma forjada, exp/nbf/iss/aud/scope/client_id inválidos y soporta HTTP JWKS local y outage 503', async () => {
    const fixedNowMs = 1_800_000_000_000
    const nowSec = Math.floor(fixedNowMs / 1000)
    const edKeys = crypto.generateKeyPairSync('ed25519')
    const wrongEdKeys = crypto.generateKeyPairSync('ed25519')
    const jwkK1 = exportJwkWithKid(edKeys.publicKey, 'oidc-loop-k1', 'EdDSA')

    let failJwksServer = false
    const jwksHttp = http.createServer((req, res) => {
      if (req.url === '/jwks.json') {
        if (failJwksServer) {
          res.writeHead(500)
          res.end('jwks unavailable')
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ keys: [jwkK1] }))
        return
      }
      res.writeHead(404)
      res.end()
    })
    rawHttpServersToClose.push(jwksHttp)
    await new Promise<void>((resolve) => jwksHttp.listen(0, '127.0.0.1', resolve))
    const jwksPort = (jwksHttp.address() as { port: number }).port
    const jwksUrl = `http://127.0.0.1:${jwksPort}/jwks.json`

    // http:// remoto debe rechazarse siempre; loopback exige allowInsecureLocalhostHttp
    expect(() =>
      createOidcJwtClientAuthVerifier({
        issuer: 'https://issuer.pr02.local',
        audience: 'attestation-authority-api',
        jwksUri: 'http://remote-oidc.example.com/jwks.json',
      })
    ).toThrow(/OIDC_INSECURE_JWKS_URI_FORBIDDEN/)

    expect(() =>
      createOidcJwtClientAuthVerifier({
        issuer: 'https://issuer.pr02.local',
        audience: 'attestation-authority-api',
        jwksUri: jwksUrl,
        allowInsecureLocalhostHttp: false,
      })
    ).toThrow(/OIDC_INSECURE_JWKS_URI_FORBIDDEN/)

    const verifier = createOidcJwtClientAuthVerifier({
      issuer: 'https://issuer.pr02.local',
      audience: 'attestation-authority-api',
      jwksUri: jwksUrl,
      allowedAlgorithms: ['EdDSA'],
      allowedClientIds: ['svc-collector-pr02'],
      allowInsecureLocalhostHttp: true,
      allowNetworkFetch: true,
      clockSkewSeconds: 5,
      jwksCacheTtlMs: 1,
      minRefreshIntervalMs: 0,
      now: () => fixedNowMs,
    })

    const bundle = await createIsolatedServiceBundle({
      clientAuthVerifier: verifier,
      now: () => fixedNowMs,
    })
    const { url } = await bundle.server.start(0)

    const mkReqHeaders = (token: string) => ({
      'Content-Type': 'application/json',
      'X-Forwarded-Proto': 'https',
      Authorization: `Bearer ${token}`,
    })

    const basePayload = {
      iss: 'https://issuer.pr02.local',
      aud: 'attestation-authority-api',
      sub: 'svc-collector-pr02',
      client_id: 'svc-collector-pr02',
      scope: VALID_SCOPE,
      jti: 'jti-neg',
      iat: nowSec - 10,
      nbf: nowSec - 10,
      exp: nowSec + 300,
    }

    const adversarialCases: Array<{
      label: string
      token: string
      expectedStatus: number
    }> = [
      {
        label: 'alg=none',
        token: signTestJwt({
          alg: 'none',
          header: { alg: 'none', kid: 'oidc-loop-k1' },
          payload: basePayload,
        }),
        expectedStatus: 401,
      },
      {
        label: 'alg=HS256',
        token: signTestJwt({
          alg: 'HS256',
          header: { alg: 'HS256', kid: 'oidc-loop-k1' },
          payload: basePayload,
          hmacSecret: 'bad-secret',
        }),
        expectedStatus: 401,
      },
      {
        label: 'forged signature',
        token: signTestJwt({
          alg: 'EdDSA',
          header: { alg: 'EdDSA', kid: 'oidc-loop-k1' },
          payload: basePayload,
          privateKey: wrongEdKeys.privateKey,
        }),
        expectedStatus: 401,
      },
      {
        label: 'expired',
        token: signTestJwt({
          alg: 'EdDSA',
          header: { alg: 'EdDSA', kid: 'oidc-loop-k1' },
          payload: { ...basePayload, exp: nowSec - 60 },
          privateKey: edKeys.privateKey,
        }),
        expectedStatus: 401,
      },
      {
        label: 'premature nbf',
        token: signTestJwt({
          alg: 'EdDSA',
          header: { alg: 'EdDSA', kid: 'oidc-loop-k1' },
          payload: { ...basePayload, nbf: nowSec + 120 },
          privateKey: edKeys.privateKey,
        }),
        expectedStatus: 401,
      },
      {
        label: 'wrong issuer',
        token: signTestJwt({
          alg: 'EdDSA',
          header: { alg: 'EdDSA', kid: 'oidc-loop-k1' },
          payload: { ...basePayload, iss: 'https://evil-issuer.example' },
          privateKey: edKeys.privateKey,
        }),
        expectedStatus: 401,
      },
      {
        label: 'wrong audience',
        token: signTestJwt({
          alg: 'EdDSA',
          header: { alg: 'EdDSA', kid: 'oidc-loop-k1' },
          payload: { ...basePayload, aud: 'other-service' },
          privateKey: edKeys.privateKey,
        }),
        expectedStatus: 401,
      },
      {
        label: 'client_id not allowlisted',
        token: signTestJwt({
          alg: 'EdDSA',
          header: { alg: 'EdDSA', kid: 'oidc-loop-k1' },
          payload: { ...basePayload, client_id: 'unauthorized-svc', sub: 'unauthorized-svc' },
          privateKey: edKeys.privateKey,
        }),
        expectedStatus: 401,
      },
      {
        label: 'insufficient scope',
        token: signTestJwt({
          alg: 'EdDSA',
          header: { alg: 'EdDSA', kid: 'oidc-loop-k1' },
          payload: { ...basePayload, scope: 'read:only' },
          privateKey: edKeys.privateKey,
        }),
        expectedStatus: 403,
      },
    ]

    for (const c of adversarialCases) {
      const req = buildSignedRequestFixture(bundle.goIssuer, fixedNowMs)
      const res = await fetch(`${url}/attestations`, {
        method: 'POST',
        headers: mkReqHeaders(c.token),
        body: JSON.stringify(req),
      })
      expect(res.status, `case ${c.label}`).toBe(c.expectedStatus)
    }
    expect(bundle.kmsSignCalls.length).toBe(0)

    // Simular caída JWKS: /health sigue 200, /readiness pasa a 503, POST /attestations -> 503
    failJwksServer = true
    const readinessDown = await fetch(`${url}/readiness`)
    expect(readinessDown.status).toBe(503)
    const rJson = await readinessDown.json()
    expect(rJson.ready).toBe(false)
    expect(rJson.authHealthy).toBe(false)
    expect(rJson.reason).toBe('CLIENT_AUTH_VERIFIER_UNHEALTHY')

    const healthUp = await fetch(`${url}/health`)
    expect(healthUp.status).toBe(200)

    const validJwt = signTestJwt({
      alg: 'EdDSA',
      header: { alg: 'EdDSA', kid: 'oidc-loop-k1' },
      payload: basePayload,
      privateKey: edKeys.privateKey,
    })
    const postDuringOutage = await fetch(`${url}/attestations`, {
      method: 'POST',
      headers: mkReqHeaders(validJwt),
      body: JSON.stringify(buildSignedRequestFixture(bundle.goIssuer, fixedNowMs)),
    })
    expect(postDuringOutage.status).toBe(503)
    const outageBody = await postDuringOutage.json()
    expect(outageBody.error.code).toBe('OIDC_JWKS_UNAVAILABLE')
    expect(bundle.kmsSignCalls.length).toBe(0)

    // jwks con clave oct simétrica debe rechazarse al validar JWK aunque llegue de JWKS
    const octVerifier = createOidcJwtClientAuthVerifier({
      issuer: 'https://issuer.pr02.local',
      audience: 'attestation-authority-api',
      jwks: {
        keys: [{ kty: 'oct', kid: 'oct-k1' }],
      },
      now: () => fixedNowMs,
    })
    await expect(
      octVerifier.verify(
        {
          authorization: `Bearer ${signTestJwt({
            alg: 'EdDSA',
            header: { alg: 'EdDSA', kid: 'oct-k1' },
            payload: basePayload,
            privateKey: edKeys.privateKey,
          })}`,
        },
        { serviceEnvironment: 'PRODUCTION', protectedMode: true, now: fixedNowMs }
      )
    ).rejects.toThrow(/OIDC_JWKS_KEY_NOT_FOUND|OIDC_SIGNATURE_INVALID/)
  }, 15000)

  it('EXT07-MTLS-01: Autentica cliente por TLS mutuo real sobre HTTPS Node y rechaza CA no confiable, cert expirado y suplantación por headers', async () => {
    const pki = generateEphemeralPkiBundle()
    const baseSigner = new TestSigningProvider({ authorityId: 'ext07-mtls-att-v1' })
    const goIssuer = new TestOnlyGoAuthorityIssuer({ authorityId: 'ext07-mtls-go-v1' })

    const db = new PGlite()
    pgliteInstances.push(db)
    const pgStore = new PostgresDistributedAntiReplayStore({
      queryClient: {
        async query(sql: string, params?: readonly unknown[]) {
          const res = await db.query<Record<string, unknown>>(
            sql,
            params ? [...params] : undefined
          )
          return {
            rows: res.rows,
            rowCount: res.rows.length > 0 ? res.rows.length : (res.affectedRows ?? 0),
          }
        },
      },
    })
    await pgStore.ensureSchema()

    const { server, service } = createConfiguredAuthorityFromEnv(
      {
        ATTESTATION_ENVIRONMENT: 'PRODUCTION',
        ATTESTATION_PROTECTED_MODE: 'true',
        ATTESTATION_REQUIRE_SIGNED_GO_GRANT: 'true',
        ATTESTATION_SIGNING_PROVIDER: 'PRODUCTION_KMS_SIGNER',
        ATTESTATION_AUTHORITY_ID: baseSigner.authorityId,
        ATTESTATION_KMS_PROVIDER: 'AWS_KMS',
        ATTESTATION_KEY_ID: baseSigner.keyId ?? '',
        ATTESTATION_KMS_KEY_ID: baseSigner.keyId ?? '',
        ATTESTATION_KMS_KEY_VERSION:
          'arn:aws:kms:sa-east-1:111122223333:key/12345678-1234-1234-1234-123456789012',
        ATTESTATION_PUBLIC_KEY_SPKI: baseSigner.publicKeySpki ?? '',
        ATTESTATION_GO_AUTHORITY_ID: goIssuer.authorityId,
        ATTESTATION_GO_KEY_ID: goIssuer.keyId,
        ATTESTATION_GO_PUBLIC_KEY_SPKI: goIssuer.publicKeySpki,
        ATTESTATION_ALLOWED_PROJECT_REF: VALID_PROJECT_REF,
        ATTESTATION_ALLOWED_COMMIT_SHA: VALID_COMMIT_SHA,
        ATTESTATION_RESPONSE_VERSION: '1.1',
        ATTESTATION_ANTI_REPLAY_MODE: 'distributed',
        ATTESTATION_CLIENT_AUTH_MODE: 'MTLS',
        ATTESTATION_REQUIRE_HTTPS: 'true',
        ATTESTATION_MTLS_TRUSTED_CA_PEM: pki.caCertPem,
        ATTESTATION_MTLS_TRUSTED_CLIENTS_JSON: JSON.stringify([
          {
            clientId: 'pr02-mtls-collector',
            allowedScopes: [VALID_SCOPE],
            sha256Fingerprint: pki.clientAllowedFingerprint,
            commonName: 'pr02-collector-mtls-client',
            subjectAltName: 'DNS:collector.pr02.internal',
          },
        ]),
      },
      {
        distributedStore: pgStore,
        awsKmsClient: {
          async sign({ KeyId, Message }) {
            const hex = baseSigner.sign(Message)
            return {
              Signature: Buffer.from(hex, 'hex'),
              SigningAlgorithm: 'ED25519_SHA_512',
              KeyId,
            }
          },
        },
        tlsOptions: {
          key: pki.serverKeyPem,
          cert: pki.serverCertPem,
          // Permite inspeccionar en capa de aplicación para retornar 401/403 JSON verificable
          rejectUnauthorized: false,
        },
      }
    )
    serversToClose.push(server)

    const { url } = await server.start(0)
    expect(url.startsWith('https://')).toBe(true)

    const health = service.handleHealth()
    expect(health.mtlsRealConfigured).toBe(true)
    expect(health.oidcRealConfigured).toBe(false)
    expect(health.kmsRealConfigured).toBe(false)

    // 1. Certificado confiable y en allowlist -> 200 OK
    const validReq = buildSignedRequestFixture(goIssuer)
    const okRes = await sendHttpsJsonRequest({
      url,
      path: '/attestations',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validReq),
      caPem: pki.caCertPem,
      clientCertPem: pki.clientAllowedCertPem,
      clientKeyPem: pki.clientAllowedKeyPem,
    })
    expect(okRes.statusCode).toBe(200)
    const okBody = JSON.parse(okRes.body)
    expect(
      verifyServiceAttestationResponse(okBody, {
        trustedAttestationPublicKey: baseSigner.publicKeySpki!,
        pinnedKeyId: baseSigner.keyId,
      }).valid
    ).toBe(true)

    // 2. Sin certificado cliente -> 401 CLIENT_AUTH_MTLS_CERT_REQUIRED
    const noCertRes = await sendHttpsJsonRequest({
      url,
      path: '/attestations',
      headers: {
        'Content-Type': 'application/json',
        // Intento de suplantación por headers
        'x-mtls-verified': 'true',
        'x-client-cert-cn': 'pr02-collector-mtls-client',
      },
      body: JSON.stringify(buildSignedRequestFixture(goIssuer)),
      caPem: pki.caCertPem,
    })
    expect(noCertRes.statusCode).toBe(401)
    expect(JSON.parse(noCertRes.body).error.code).toBe('CLIENT_AUTH_MTLS_REQUIRED')

    // 3. Certificado emitido por CA falsa con mismo CN -> 401 CLIENT_AUTH_MTLS_UNTRUSTED
    const rogueRes = await sendHttpsJsonRequest({
      url,
      path: '/attestations',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSignedRequestFixture(goIssuer)),
      caPem: pki.caCertPem,
      clientCertPem: pki.clientRogueCertPem,
      clientKeyPem: pki.clientRogueKeyPem,
    })
    expect(rogueRes.statusCode).toBe(401)
    expect(JSON.parse(rogueRes.body).error.code).toBe('CLIENT_AUTH_MTLS_UNTRUSTED')

    // 4. Certificado expirado aunque firmado por CA confiable -> 401
    const expiredRes = await sendHttpsJsonRequest({
      url,
      path: '/attestations',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSignedRequestFixture(goIssuer)),
      caPem: pki.caCertPem,
      clientCertPem: pki.clientExpiredCertPem,
      clientKeyPem: pki.clientExpiredKeyPem,
    })
    expect(expiredRes.statusCode).toBe(401)

    // 5. Certificado firmado por CA confiable pero NO incluido en allowlist -> 403
    const notAllowedRes = await sendHttpsJsonRequest({
      url,
      path: '/attestations',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSignedRequestFixture(goIssuer)),
      caPem: pki.caCertPem,
      clientCertPem: pki.clientOtherValidCertPem,
      clientKeyPem: pki.clientOtherValidKeyPem,
    })
    expect(notAllowedRes.statusCode).toBe(403)
    expect(JSON.parse(notAllowedRes.body).error.code).toBe(
      'CLIENT_AUTH_MTLS_CLIENT_NOT_ALLOWED'
    )

    // 6. Llamada directa a service.handleRequest sin contexto TLS real, aunque simule headers
    await expect(
      service.handleRequest(buildSignedRequestFixture(goIssuer), {
        'x-ssl-client-cert': 'spoofed-cert',
        'x-mtls-verified': 'true',
        'x-client-cert-sha256': pki.clientAllowedFingerprint,
      })
    ).rejects.toThrow(/CLIENT_AUTH_MTLS_REQUIRED/)
  }, 15000)

  it('EXT07-PG-01: Persiste durablamente state=EXPIRED al vencer el lease en markSigningAttemptStarted/commitReservation y soporta >=100 requests concurrentes en PGlite', async () => {
    let clockMs = 1_800_000_000_000
    const db = new PGlite()
    pgliteInstances.push(db)

    // PGlite pool-like wrapper para ejercitar transacciones explícitas BEGIN / COMMIT / RELEASE
    const poolWrapper: PostgresPoolExecutor = {
      async connect() {
        return {
          async query(sql: string, params?: readonly unknown[]) {
            const res = await db.query<Record<string, unknown>>(
              sql,
              params ? [...params] : undefined
            )
            return {
              rows: res.rows,
              rowCount: res.rows.length > 0 ? res.rows.length : (res.affectedRows ?? 0),
            }
          },
          release() {},
        }
      },
    }

    const pgStore = new PostgresDistributedAntiReplayStore({
      pool: poolWrapper,
      defaultLeaseTtlMs: 200,
      now: () => clockMs,
    })
    await pgStore.ensureSchema()

    // 1. Bugfix crítico: si el lease expira antes de markSigningAttemptStarted,
    // la transición RESERVED -> EXPIRED DEBE quedar confirmada en BD (no revertida por ROLLBACK)
    const exp1 = await pgStore.reserveOnce({
      requestId: 'pg-exp-mark-1',
      requestSha256: '1'.repeat(64),
      authorizationId: 'pg-auth-exp-mark-1',
      attestationId: 'pg-att-exp-mark-1',
      ownerNodeId: 'pg-node-a',
      leaseTtlMs: 100,
    })
    expect(exp1.state).toBe('RESERVED')
    clockMs += 150

    await expect(
      pgStore.markSigningAttemptStarted({
        requestId: 'pg-exp-mark-1',
        attestationId: 'pg-att-exp-mark-1',
        ownerNodeId: 'pg-node-a',
        reservationToken: exp1.reservationToken,
      })
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED/)

    const recAfterMark = await pgStore.getReservation('pg-exp-mark-1')
    expect(recAfterMark?.state).toBe('EXPIRED')
    expect(recAfterMark?.expiredAt).toBeTruthy()

    // 2. Lo mismo si expira entre markSigningAttemptStarted y commitReservation
    const exp2 = await pgStore.reserveOnce({
      requestId: 'pg-exp-commit-2',
      requestSha256: '2'.repeat(64),
      authorizationId: 'pg-auth-exp-commit-2',
      attestationId: 'pg-att-exp-commit-2',
      ownerNodeId: 'pg-node-a',
      leaseTtlMs: 100,
    })
    await pgStore.markSigningAttemptStarted({
      requestId: 'pg-exp-commit-2',
      attestationId: 'pg-att-exp-commit-2',
      ownerNodeId: 'pg-node-a',
      reservationToken: exp2.reservationToken,
    })
    clockMs += 150
    await expect(
      pgStore.commitReservation({
        requestId: 'pg-exp-commit-2',
        attestationId: 'pg-att-exp-commit-2',
        ownerNodeId: 'pg-node-a',
        reservationToken: exp2.reservationToken,
        responseDigest: '3'.repeat(64),
      })
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_RESERVATION_EXPIRED/)

    const recAfterCommit = await pgStore.getReservation('pg-exp-commit-2')
    expect(recAfterCommit?.state).toBe('EXPIRED')

    // 3. Concurrencia masiva real (>= 100 solicitudes en PGlite compartido entre 4 nodos)
    const goIssuer = new TestOnlyGoAuthorityIssuer({ authorityId: 'ext07-pg-conc-go' })
    const edKeys = crypto.generateKeyPairSync('ed25519')
    const baseSigner = new TestSigningProvider({ authorityId: 'ext07-pg-conc-att' })
    const jwt = signTestJwt({
      alg: 'EdDSA',
      header: { alg: 'EdDSA', kid: 'conc-k1' },
      payload: {
        iss: 'https://issuer.pr02.local',
        aud: 'attestation-authority-api',
        sub: 'conc-client',
        client_id: 'conc-client',
        scope: VALID_SCOPE,
        jti: 'conc-jti',
        iat: Math.floor(clockMs / 1000) - 5,
        exp: Math.floor(clockMs / 1000) + 300,
      },
      privateKey: edKeys.privateKey,
    })
    const oidc = createOidcJwtClientAuthVerifier({
      issuer: 'https://issuer.pr02.local',
      audience: 'attestation-authority-api',
      jwks: { keys: [exportJwkWithKid(edKeys.publicKey, 'conc-k1', 'EdDSA')] },
      now: () => clockMs,
    })

    let signCalls = 0
    const nodes = Array.from({ length: 4 }, (_, i) => {
      const store = new PostgresDistributedAntiReplayStore({
        pool: poolWrapper,
        defaultLeaseTtlMs: 30_000,
        now: () => clockMs,
      })
      const guard = new ServiceAntiReplayGuard({
        storageType: 'distributed',
        nodeId: `conc-node-${i}`,
        distributedStore: store,
        now: () => clockMs,
      })
      const signer = new AwsKmsSigningProvider({
        authorityId: baseSigner.authorityId,
        keyId: baseSigner.keyId ?? undefined,
        publicKeySpki: baseSigner.publicKeySpki ?? undefined,
        kmsKeyArn: 'arn:aws:kms:sa-east-1:111122223333:key/conc',
        awsKmsClient: {
          async sign({ KeyId, Message }) {
            signCalls += 1
            return {
              Signature: Buffer.from(baseSigner.sign(Message), 'hex'),
              SigningAlgorithm: 'ED25519_SHA_512',
              KeyId,
            }
          },
        },
      })
      return new IndependentAttestationAuthorityService({
        signingProvider: signer,
        antiReplayGuard: guard,
        serviceEnvironment: 'PRODUCTION',
        protectedMode: true,
        requireSignedGoGrant: true,
        authorityId: baseSigner.authorityId,
        trustedGoAuthorityId: goIssuer.authorityId,
        trustedGoKeyId: goIssuer.keyId,
        trustedGoPublicKeySpki: goIssuer.publicKeySpki,
        expectedProjectRef: VALID_PROJECT_REF,
        expectedCommitSha: VALID_COMMIT_SHA,
        attestationResponseVersion: '1.1',
        clientAuthVerifier: oidc,
        now: () => clockMs,
        env: { NODE_ENV: 'production', ATTESTATION_ENVIRONMENT: 'PRODUCTION' },
      })
    })

    const uniqueReqs = Array.from({ length: 80 }, () =>
      buildSignedRequestFixture(goIssuer, clockMs)
    )
    // 20 duplicados exactos de los primeros 5 requests -> total 100 requests concurrentes
    const dupReqs = Array.from({ length: 20 }, (_, i) => uniqueReqs[i % 5])
    const allReqs = [...uniqueReqs, ...dupReqs]
    expect(allReqs.length).toBe(100)

    const results = await Promise.allSettled(
      allReqs.map((r, idx) =>
        nodes[idx % nodes.length].handleRequest(
          r,
          { authorization: `Bearer ${jwt}` },
          { now: clockMs }
        )
      )
    )

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled.length).toBe(80)
    expect(rejected.length).toBe(20)
    expect(signCalls).toBe(80)
  }, 20000)

  it('EXT07-PG-02: Falla cerrado ante timeouts PG, errores de red, statementTimeout y commit fallido sin filtrar atestación', async () => {
    const fixedNow = Date.now()

    // 1. Timeout en query PostgreSQL
    let releaseErrSeen: unknown = null
    const slowPool: PostgresPoolExecutor = {
      async connect() {
        return {
          async query() {
            await new Promise((r) => setTimeout(r, 120))
            return { rows: [{ ok: 1 }], rowCount: 1 }
          },
          release(err?: unknown) {
            releaseErrSeen = err ?? null
          },
        }
      },
    }
    const slowStore = new PostgresDistributedAntiReplayStore({
      pool: slowPool,
      queryTimeoutMs: 25,
      healthCheckTimeoutMs: 25,
    })
    expect(await slowStore.isHealthy()).toBe(false)
    await expect(
      slowStore.reserveOnce({
        requestId: 'pg-timeout-1',
        requestSha256: '4'.repeat(64),
        attestationId: 'att-timeout-1',
      })
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_UNAVAILABLE/)
    expect(releaseErrSeen).toBeTruthy()

    // 2. statementTimeout + isolationLevel SERIALIZABLE emiten SET LOCAL y BEGIN ISOLATION LEVEL
    const sqlLog: string[] = []
    const isoPool: PostgresPoolExecutor = {
      async connect() {
        return {
          async query(sql: string) {
            sqlLog.push(sql.trim())
            if (sql.includes('INSERT INTO')) {
              return { rows: [{ request_id: 'pg-iso-1' }], rowCount: 1 }
            }
            return { rows: [{ ok: 1 }], rowCount: 1 }
          },
          release() {},
        }
      },
    }
    const isoStore = new PostgresDistributedAntiReplayStore({
      pool: isoPool,
      statementTimeoutMs: 1500,
      isolationLevel: 'SERIALIZABLE',
    })
    await isoStore.reserveOnce({
      requestId: 'pg-iso-1',
      requestSha256: '5'.repeat(64),
      attestationId: 'att-iso-1',
    })
    expect(sqlLog[0]).toBe('BEGIN ISOLATION LEVEL SERIALIZABLE')
    expect(sqlLog[1]).toBe('SET LOCAL statement_timeout = 1500')
    expect(sqlLog[sqlLog.length - 1]).toBe('COMMIT')

    // 3. Error de red en commitReservation dentro de handleRequest jamás filtra respuesta firmada
    const db = new PGlite()
    pgliteInstances.push(db)
    const executor: PostgresQueryExecutor = {
      async query(sql: string, params?: readonly unknown[]) {
        if (sql.includes("SET state = 'CONSUMED'")) {
          const e = new Error('connection terminated unexpectedly') as Error & { code?: string }
          e.code = '08006'
          throw e
        }
        const res = await db.query<Record<string, unknown>>(
          sql,
          params ? [...params] : undefined
        )
        return {
          rows: res.rows,
          rowCount: res.rows.length > 0 ? res.rows.length : (res.affectedRows ?? 0),
        }
      },
    }
    const flakyStore = new PostgresDistributedAntiReplayStore({
      queryClient: executor,
      now: () => fixedNow,
    })
    await flakyStore.ensureSchema()

    const edKeys = crypto.generateKeyPairSync('ed25519')
    const jwt = signTestJwt({
      alg: 'EdDSA',
      header: { alg: 'EdDSA', kid: 'flaky-k1' },
      payload: {
        iss: 'https://issuer.pr02.local',
        aud: 'attestation-authority-api',
        sub: 'flaky-client',
        scope: VALID_SCOPE,
        jti: 'flaky-jti',
        iat: Math.floor(fixedNow / 1000) - 5,
        exp: Math.floor(fixedNow / 1000) + 300,
      },
      privateKey: edKeys.privateKey,
    })
    const oidc = createOidcJwtClientAuthVerifier({
      issuer: 'https://issuer.pr02.local',
      audience: 'attestation-authority-api',
      jwks: { keys: [exportJwkWithKid(edKeys.publicKey, 'flaky-k1', 'EdDSA')] },
      now: () => fixedNow,
    })

    const bundle = await createIsolatedServiceBundle({
      clientAuthVerifier: oidc,
      store: flakyStore,
      now: () => fixedNow,
    })
    const { url } = await bundle.server.start(0)
    const res = await fetch(`${url}/attestations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-Proto': 'https',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(buildSignedRequestFixture(bundle.goIssuer, fixedNow)),
    })
    expect(res.status).toBe(503)
    const errJson = await res.json()
    expect(errJson.signature).toBeUndefined()
    expect(errJson.error.code).toBe('SERVICE_ANTI_REPLAY_UNAVAILABLE')
  }, 15000)

  it('EXT07-DDB-01: Endurece DynamoDbDistributedAntiReplayStore (TTL, ClientRequestToken, throttling, contienda, timeouts y DescribeTable)', async () => {
    expect(AWS_DYNAMODB_REAL_TESTED).toBe(false)
    expect(DYNAMODB_PRODUCTION_READY).toBe(false)

    const items = buildDynamoDbReserveTransactItems(
      'kioskopos_att',
      {
        idempotencyKey: 'a'.repeat(64),
        requestId: 'req-ddb-1',
        requestSha256: 'b'.repeat(64),
        authorizationId: 'auth-ddb-1',
        attestationId: 'att-ddb-1',
        state: 'RESERVED',
        ownerNodeId: 'n1',
        reservationToken: 'tok-1',
        kmsAttempted: false,
        reservedAt: new Date(1_800_000_000_000).toISOString(),
        leaseExpiresAt: new Date(1_800_000_030_000).toISOString(),
        leaseExpiresAtMs: 1_800_000_030_000,
      },
      { retentionTtlSeconds: 3600 }
    )
    expect(items.ClientRequestToken).toHaveLength(36)
    const firstItem = items.TransactItems[0] as { Put: { Item: { ttlEpochSeconds?: number } } }
    expect(firstItem.Put.Item.ttlEpochSeconds).toBe(1_800_003_600)

    // ThrottlingException -> SERVICE_ANTI_REPLAY_UNAVAILABLE
    const throttledClient: DynamoDbClientAdapter = {
      async transactWriteItems() {
        const e = new Error('Rate exceeded') as Error & { name?: string }
        e.name = 'ThrottlingException'
        throw e
      },
      async updateItem() {
        return {}
      },
      async getItem() {
        return { Item: null }
      },
      async describeTable() {
        return { Table: { TableStatus: 'CREATING' } }
      },
    }
    const throttledStore = new DynamoDbDistributedAntiReplayStore({
      client: throttledClient,
    })
    expect(await throttledStore.isHealthy()).toBe(false) // TableStatus CREATING != ACTIVE
    await expect(
      throttledStore.reserveOnce({
        requestId: 'req-thr',
        requestSha256: 'c'.repeat(64),
        attestationId: 'att-thr',
      })
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_UNAVAILABLE/)

    // TransactionConflictException -> SERVICE_ANTI_REPLAY_LOCK_CONTENTION
    const conflictClient: DynamoDbClientAdapter = {
      async transactWriteItems() {
        const e = new Error('In flight tx') as Error & { name?: string }
        e.name = 'TransactionConflictException'
        throw e
      },
      async updateItem() {
        return {}
      },
      async getItem() {
        return { Item: null }
      },
      async describeTable() {
        await new Promise((r) => setTimeout(r, 80))
        return { Table: { TableStatus: 'ACTIVE' } }
      },
    }
    const conflictStore = new DynamoDbDistributedAntiReplayStore({
      client: conflictClient,
      healthCheckTimeoutMs: 20,
    })
    expect(await conflictStore.isHealthy()).toBe(false) // timeout
    await expect(
      conflictStore.reserveOnce({
        requestId: 'req-conf',
        requestSha256: 'd'.repeat(64),
        attestationId: 'att-conf',
      })
    ).rejects.toThrow(/SERVICE_ANTI_REPLAY_LOCK_CONTENTION/)
  })

  it('EXT07-KMS-01: Valida timeout, algoritmo/KeyId/SPKI mismatch y health de KMS bloqueando antes de reservar', async () => {
    const baseSigner = new TestSigningProvider({ authorityId: 'ext07-kms-att' })
    const otherSigner = new TestSigningProvider({ authorityId: 'ext07-kms-other' })
    const fixedNow = Date.now()

    // 1. Timeout acotado en sign
    const slowKms = new AwsKmsSigningProvider({
      authorityId: baseSigner.authorityId,
      keyId: baseSigner.keyId ?? undefined,
      publicKeySpki: baseSigner.publicKeySpki ?? undefined,
      kmsKeyArn: 'arn:aws:kms:sa-east-1:111:key/slow',
      kmsTimeoutMs: 25,
      awsKmsClient: {
        async sign() {
          await new Promise((r) => setTimeout(r, 120))
          return { Signature: Buffer.from('aa', 'hex') }
        },
      },
    })
    await expect(slowKms.sign('payload')).rejects.toThrow(/PRODUCTION_KMS_TIMEOUT/)

    // 2. KeyId inesperado devuelto por KMS
    const wrongKeyKms = new AwsKmsSigningProvider({
      authorityId: baseSigner.authorityId,
      keyId: baseSigner.keyId ?? undefined,
      publicKeySpki: baseSigner.publicKeySpki ?? undefined,
      kmsKeyArn: 'arn:aws:kms:sa-east-1:111:key/expected',
      awsKmsClient: {
        async sign({ Message }) {
          return {
            Signature: Buffer.from(baseSigner.sign(Message), 'hex'),
            SigningAlgorithm: 'ED25519_SHA_512',
            KeyId: 'arn:aws:kms:sa-east-1:111:key/OTHER',
          }
        },
      },
    })
    await expect(wrongKeyKms.sign('payload')).rejects.toThrow(/PRODUCTION_KMS_KEY_ID_MISMATCH/)

    // 3. Firma válida de otra clave distinta al SPKI configurado -> KMS_PUBLIC_KEY_MISMATCH
    const mismatchedSigKms = new AwsKmsSigningProvider({
      authorityId: baseSigner.authorityId,
      keyId: baseSigner.keyId ?? undefined,
      publicKeySpki: baseSigner.publicKeySpki ?? undefined,
      kmsKeyArn: 'arn:aws:kms:sa-east-1:111:key/mismatch',
      awsKmsClient: {
        async sign({ KeyId, Message }) {
          return {
            Signature: Buffer.from(otherSigner.sign(Message), 'hex'),
            SigningAlgorithm: 'ED25519_SHA_512',
            KeyId,
          }
        },
      },
    })
    await expect(mismatchedSigKms.sign('payload')).rejects.toThrow(/KMS_PUBLIC_KEY_MISMATCH/)

    // 4. Unhealthy KMS bloquea /readiness (503) y POST /attestations (503) SIN crear reserva en BD
    const unhealthyKms = new GcpKmsSigningProvider({
      authorityId: baseSigner.authorityId,
      keyId: baseSigner.keyId ?? undefined,
      publicKeySpki: baseSigner.publicKeySpki ?? undefined,
      keyVersionName: 'projects/ext07/locations/global/keyRings/att/cryptoKeys/k1/cryptoKeyVersions/1',
      gcpKmsClient: {
        async asymmetricSign({ name, data }) {
          return [{ signature: Buffer.from(baseSigner.sign(data), 'hex'), name }]
        },
        async getPublicKey() {
          // SPKI distinto al configurado
          return [{ pem: otherSigner.publicKeySpki! }]
        },
      },
    })
    expect(await unhealthyKms.isHealthy()).toBe(false)

    const edKeys = crypto.generateKeyPairSync('ed25519')
    const jwt = signTestJwt({
      alg: 'EdDSA',
      header: { alg: 'EdDSA', kid: 'kms-k1' },
      payload: {
        iss: 'https://issuer.pr02.local',
        aud: 'attestation-authority-api',
        sub: 'kms-client',
        scope: VALID_SCOPE,
        jti: 'kms-jti',
        iat: Math.floor(fixedNow / 1000) - 5,
        exp: Math.floor(fixedNow / 1000) + 300,
      },
      privateKey: edKeys.privateKey,
    })
    const oidc = createOidcJwtClientAuthVerifier({
      issuer: 'https://issuer.pr02.local',
      audience: 'attestation-authority-api',
      jwks: { keys: [exportJwkWithKid(edKeys.publicKey, 'kms-k1', 'EdDSA')] },
      now: () => fixedNow,
    })

    const bundle = await createIsolatedServiceBundle({
      clientAuthVerifier: oidc,
      kmsSigner: unhealthyKms,
      now: () => fixedNow,
    })
    const { url } = await bundle.server.start(0)

    const readiness = await fetch(`${url}/readiness`)
    expect(readiness.status).toBe(503)
    const rJson = await readiness.json()
    expect(rJson.providerHealthy).toBe(false)
    expect(rJson.reason).toBe('SIGNING_PROVIDER_NOT_READY')

    const req = buildSignedRequestFixture(bundle.goIssuer, fixedNow)
    const postRes = await fetch(`${url}/attestations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-Proto': 'https',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(req),
    })
    expect(postRes.status).toBe(503)
    // No debe haber contaminado anti-replay al caer antes de reservar
    expect(await bundle.store.getReservation(req.requestId)).toBeNull()
  }, 15000)

  it('EXT07-GUARD-01: Mantiene ATTESTATION_REAL_INTEGRATION_ENABLED=false por defecto y valida aislamiento PostgreSQL/SDK', async () => {
    expect(isRealIntegrationEnabled({})).toBe(false)
    expect(POSTGRESQL_REAL_INTEGRATION_TESTED).toBe(false)
    expect(POSTGRESQL_PRODUCTION_READY).toBe(false)

    // Por defecto bloqueado con cero llamadas de red
    await expect(
      createControlledPostgresStoreFromEnv({
        ATTESTATION_POSTGRES_URL: 'postgres://att:pass@att-pg.internal:5432/att?sslmode=verify-full',
      })
    ).rejects.toThrow(/REAL_INTEGRATION_DISABLED/)
    await expect(
      createControlledDynamoDbStoreFromEnv({ ATTESTATION_DYNAMODB_TABLE: 'att' })
    ).rejects.toThrow(/REAL_INTEGRATION_DISABLED/)
    await expect(
      createControlledKmsProviderFromEnv({ ATTESTATION_SIGNING_MODE: 'AWS_KMS' })
    ).rejects.toThrow(/REAL_INTEGRATION_DISABLED/)

    // Rechaza compartir base de datos Supabase POS/fiscal y exige TLS remoto
    expect(() =>
      assertDedicatedPostgresUrl('postgres://postgres:x@db.acoyfwwmhaeruciyedri.supabase.co:5432/postgres?sslmode=require')
    ).toThrow(/POSTGRES_DEDICATED_DATABASE_REQUIRED/)
    expect(() =>
      assertDedicatedPostgresUrl('postgres://u:p@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require')
    ).toThrow(/POSTGRES_DEDICATED_DATABASE_REQUIRED/)
    expect(() =>
      assertDedicatedPostgresUrl('postgres://att:p@dedicated-pg.internal:5432/att')
    ).toThrow(/POSTGRES_TLS_REQUIRED/)
    expect(() =>
      assertDedicatedPostgresUrl('postgres://att:p@dedicated-pg.internal:5432/att?sslmode=disable')
    ).toThrow(/POSTGRES_TLS_REQUIRED/)

    const validMeta = assertDedicatedPostgresUrl(
      'postgres://att:p@dedicated-pg.internal:5432/att_antireplay?sslmode=verify-full'
    )
    expect(validMeta.sslMode).toBe('verify-full')
    expect(validMeta.isLocal).toBe(false)

    // Con opt-in explícito + pool inyectado funciona sin tocar la red
    let ended = false
    const fakePool = class {
      async connect() {
        return {
          async query() {
            return { rows: [{ ok: 1 }], rowCount: 1 }
          },
          release() {},
        }
      }
      async end() {
        ended = true
      }
    }
    const controlledPg = await createControlledPostgresStoreFromEnv(
      {
        ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
        ATTESTATION_POSTGRES_URL:
          'postgres://att:p@dedicated-pg.internal:5432/att?sslmode=verify-full',
        ATTESTATION_POSTGRES_QUERY_TIMEOUT_MS: '4000',
        ATTESTATION_POSTGRES_STATEMENT_TIMEOUT_MS: '3000',
        ATTESTATION_POSTGRES_ISOLATION_LEVEL: 'REPEATABLE READ',
      },
      { pgModule: { Pool: fakePool } }
    )
    expect(await controlledPg.store.isHealthy()).toBe(true)
    await controlledPg.close()
    expect(ended).toBe(true)

    // Paquetes cloud no instalados fallan cerrado limpiamente con REAL_INTEGRATION_DEPENDENCY_MISSING
    await expect(
      createControlledDynamoDbStoreFromEnv({
        ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
        ATTESTATION_DYNAMODB_TABLE: 'kioskopos_att',
        ATTESTATION_AWS_REGION: 'sa-east-1',
      })
    ).rejects.toThrow(/REAL_INTEGRATION_DEPENDENCY_MISSING/)

    const baseSigner = new TestSigningProvider({ authorityId: 'ext07-sdk-guard' })
    await expect(
      createControlledKmsProviderFromEnv({
        ATTESTATION_REAL_INTEGRATION_ENABLED: 'true',
        ATTESTATION_SIGNING_MODE: 'GCP_KMS',
        ATTESTATION_KMS_KEY_ID: baseSigner.keyId ?? '',
        ATTESTATION_KMS_KEY_VERSION_NAME: 'projects/p/locations/global/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1',
        ATTESTATION_KMS_PUBLIC_KEY_SPKI: baseSigner.publicKeySpki ?? '',
      })
    ).rejects.toThrow(/REAL_INTEGRATION_DEPENDENCY_MISSING/)
  })
})

const realPostgresEnabled =
  process.env.ATTESTATION_REAL_INTEGRATION_ENABLED === 'true' &&
  Boolean(process.env.ATTESTATION_POSTGRES_URL)

describe.runIf(realPostgresEnabled)(
  'EXT-REAL-07 — Harness de Integración Real PostgreSQL (Opt-in Explícito)',
  () => {
    it('EXT07-REAL-PG-01: Conecta contra PostgreSQL dedicado real, aplica esquema e idempotencia multi-conexión y limpia registro de prueba', async () => {
      const handle = await createControlledPostgresStoreFromEnv(process.env)
      try {
        await handle.store.ensureSchema()
        expect(await handle.store.isHealthy()).toBe(true)

        const reqId = `ext07-real-pg-${crypto.randomUUID()}`
        const res1 = await handle.store.reserveOnce({
          requestId: reqId,
          requestSha256: crypto.createHash('sha256').update(reqId).digest('hex'),
          authorizationId: `auth-${reqId}`,
          attestationId: `att-${reqId}`,
          ownerNodeId: 'ext07-real-harness',
        })
        expect(res1.state).toBe('RESERVED')
        await expect(
          handle.store.reserveOnce({
            requestId: reqId,
            requestSha256: crypto.createHash('sha256').update(`${reqId}-diff`).digest('hex'),
            authorizationId: `auth-${reqId}`,
            attestationId: `att-${reqId}-2`,
            ownerNodeId: 'ext07-real-harness',
          })
        ).rejects.toThrow(/SERVICE_ANTI_REPLAY_/)
      } finally {
        await handle.close()
      }
    })
  }
)
