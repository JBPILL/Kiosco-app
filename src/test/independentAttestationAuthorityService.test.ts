import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  computeAttestationRequestDigest,
  verifyAttestationResponse,
  validateAttestationEndpointUrl,
  executeHttpsAttestationTransport,
  evaluateExternalAuthorityReadiness,
  PR02_P0_COLECTOR_IDENTIDAD,
} from '../../scripts/fiscal/plan-pr02-parameters.mjs'

import {
  AttestationSigningProvider,
  TestSigningProvider,
  ProductionKmsSigningProvider,
  ServiceAntiReplayGuard,
  validateAttestationPolicy,
  assertServiceEnvironmentIsolation,
  safeParseStrictJson,
  assertNoPrototypePollution,
  IndependentAttestationAuthorityService,
  IndependentAttestationHttpServer,
  createConfiguredAuthorityFromEnv,
  createGracefulShutdownHandler,
  TestOnlyGoAuthorityIssuer,
  verifyGoAuthorizationGrant,
  computeGoGrantDigest,
  createSimulatedClientAuthVerifier,
  verifyServiceAttestationResponse,
  Level2ASubmittedContentEvaluatorStub,
  Level2BIndependentObservedEvaluatorStub,
  EVIDENCE_INTEGRITY_LEVELS,
  GO_GRANT_SCHEMA_VERSION,
} from '../../services/independent-attestation-authority/src/index.mjs'

function createTestCustomAuthVerifier(expectedToken = 'valid-oidc-token-for-test') {
  return {
    verifierKind: 'CUSTOM_TEST_OIDC_VERIFIER',
    trustScope: 'CUSTOM_INJECTED',
    isProductionAuthVerifier: () => true,
    async verify(headers: Record<string, unknown>) {
      const auth = typeof headers.authorization === 'string' ? headers.authorization : ''
      if (auth.startsWith('Bearer ') && auth.slice(7).trim() !== expectedToken) {
        throw new Error('UNMODELED_BEARER_TOKEN_REJECTED: Token no reconocido por verificador')
      }
      if (auth !== `Bearer ${expectedToken}`) {
        throw new Error('CLIENT_AUTH_FAILED: Token cliente ausente o inválido')
      }
      return {
        authenticated: true,
        clientId: 'pos-collector-ci-service-account',
        authMechanism: 'OIDC',
        allowedScopes: ['PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'],
        isGoAuthority: false,
      }
    },
  }
}

const VALID_COMMIT_SHA = 'c56930d358f76e5a255292693b83fd709414f6e2'
const VALID_COLLECTOR_ID = PR02_P0_COLECTOR_IDENTIDAD

function buildValidRequest(overrides: Record<string, any> = {}) {
  const base = {
    schemaVersion: '1.0' as const,
    requestId: `att-req-${randomUUID()}`,
    processId: `proc-${randomUUID()}`,
    executionScope: 'PR02_P0_OFFICIAL_EVIDENCE_COLLECTION' as const,
    commitSha: VALID_COMMIT_SHA,
    environment: 'HOMOLOGACION' as const,
    authorizationId: `go-auth-${randomUUID()}`,
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
    consultadoEn: '2026-11-08T22:00:00.000Z',
    requestedAt: '2026-11-08T22:00:01.000Z',
    collectorIdentity: VALID_COLLECTOR_ID,
    ...overrides,
  }

  const digest = computeAttestationRequestDigest(base)
  return {
    ...base,
    requestSha256: overrides.requestSha256 !== undefined ? overrides.requestSha256 : digest,
  }
}

describe('PR02 — FASE EXT-REAL-01: Independent Attestation Authority Adversarial Suite', () => {
  let testSigner: TestSigningProvider
  let service: IndependentAttestationAuthorityService

  beforeEach(() => {
    testSigner = new TestSigningProvider({
      authorityId: 'test-independent-attestation-authority-v1',
    })
    service = new IndependentAttestationAuthorityService({
      signingProvider: testSigner,
      antiReplayGuard: new ServiceAntiReplayGuard({ storageType: 'memory' }),
    })
  })

  // EXT-REAL-01: Servicio rechaza request con schemaVersion inválido
  it('EXT-REAL-01: Servicio rechaza request con schemaVersion inválido', async () => {
    const req = buildValidRequest({ schemaVersion: '2.0' })
    await expect(service.handleRequest(req)).rejects.toThrow('ATTESTATION_REQUEST_SCHEMA_INVALID')
  })

  // EXT-REAL-02: Servicio rechaza requestSha256 incorrecto
  it('EXT-REAL-02: Servicio rechaza requestSha256 que no coincide con el digest canónico', async () => {
    const req = buildValidRequest({ requestSha256: '0'.repeat(64) })
    await expect(service.handleRequest(req)).rejects.toThrow('ATTESTATION_REQUEST_HASH_MISMATCH')
  })

  // EXT-REAL-03: Servicio rechaza executionScope distinto de P0
  it('EXT-REAL-03: Servicio rechaza executionScope distinto de P0', async () => {
    const req1 = buildValidRequest({ executionScope: 'PR02_P1_IMPORT_BATCH' })
    await expect(service.handleRequest(req1)).rejects.toThrow('ATTESTATION_REQUEST_SCOPE_MISMATCH')

    const req2 = buildValidRequest({ executionScope: 'PRODUCTION_CAE_EMISSION' })
    await expect(service.handleRequest(req2)).rejects.toThrow('ATTESTATION_REQUEST_SCOPE_MISMATCH')
  })

  // EXT-REAL-04: Servicio rechaza environment distinto de HOMOLOGACION
  it('EXT-REAL-04: Servicio rechaza environment distinto de HOMOLOGACION', async () => {
    const req = buildValidRequest({ environment: 'PRODUCTION' })
    await expect(service.handleRequest(req)).rejects.toThrow('ATTESTATION_REQUEST_ENVIRONMENT_MISMATCH')
  })

  // EXT-REAL-05: Servicio rechaza manifestSha256 inválido
  it('EXT-REAL-05: Servicio rechaza manifestSha256 inválido', async () => {
    const req1 = buildValidRequest({ manifestSha256: 'short-invalid-sha' })
    await expect(service.handleRequest(req1)).rejects.toThrow('ATTESTATION_REQUEST_MANIFEST_SHA_INVALID')

    const req2 = buildValidRequest({ manifestSha256: 'z'.repeat(64) }) // non-hex
    await expect(service.handleRequest(req2)).rejects.toThrow('ATTESTATION_REQUEST_MANIFEST_SHA_INVALID')
  })

  // EXT-REAL-06: Servicio no firma sin SigningProvider válido
  it('EXT-REAL-06: Servicio no inicializa ni firma sin SigningProvider válido', () => {
    expect(testSigner instanceof AttestationSigningProvider).toBe(true)
    expect(validateAttestationPolicy(buildValidRequest())).toBe(true)
    expect(() => new IndependentAttestationAuthorityService({} as any)).toThrow(
      'AUTHORITY_SERVICE_SIGNING_PROVIDER_REQUIRED'
    )
    expect(() => new IndependentAttestationAuthorityService({ signingProvider: {} as any })).toThrow(
      'AUTHORITY_SERVICE_SIGNING_PROVIDER_REQUIRED'
    )
  })

  // EXT-REAL-07: TestSigningProvider no puede declararse Production
  it('EXT-REAL-07: TestSigningProvider no puede declararse como producción', () => {
    expect(() => new TestSigningProvider({ declareProduction: true })).toThrow(
      'TEST_SIGNING_PROVIDER_CANNOT_BE_PRODUCTION'
    )
    expect(() => new TestSigningProvider({ isProduction: true })).toThrow(
      'TEST_SIGNING_PROVIDER_CANNOT_BE_PRODUCTION'
    )
    expect(testSigner.isProductionReady()).toBe(false)
    expect(testSigner.trustScope).toBe('TEST_ONLY')
    expect(testSigner.signerType).toBe('TEST_SIGNER')
  })

  // EXT-REAL-08: Producción sin KMS provider falla cerrado
  it('EXT-REAL-08: Producción sin KMS provider configurado falla cerrado', async () => {
    const kmsProvider = new ProductionKmsSigningProvider({
      authorityId: 'kioskopos-independent-attestation-authority-prod',
      keyId: 'ed25519-kms-key-v1',
      publicKeySpki: 'pem...',
      // No kmsClient provided
    })
    expect(kmsProvider.isProductionReady()).toBe(false)
    await expect(kmsProvider.sign(Buffer.from('test'))).rejects.toThrow('PRODUCTION_KMS_NOT_CONFIGURED')
    expect(() => kmsProvider.accessPrivateKey()).toThrow('KMS_PRIVATE_KEY_NON_EXPORTABLE')
  })

  // EXT-REAL-09: Respuesta firmada puede verificarse con la clave pública correspondiente
  it('EXT-REAL-09: Respuesta firmada puede verificarse con la clave pública correspondiente', async () => {
    const req = buildValidRequest()
    const response = await service.handleRequest(req)

    expect(response.algorithm).toBe('Ed25519')
    expect(response.signature).toMatch(/^[0-9a-f]{128}$/)

    const verification = verifyAttestationResponse(response, {
      trustedAttestationPublicKey: testSigner.publicKeySpki,
      attestationRequest: req,
      allowTestKeys: true,
    })

    expect(verification.valid).toBe(true)
    expect(verification.authorityId).toBe('test-independent-attestation-authority-v1')
  })

  // EXT-REAL-10: Clave pública incorrecta es rechazada
  it('EXT-REAL-10: Clave pública incorrecta rechaza la firma en fail-closed', async () => {
    const req = buildValidRequest()
    const response = await service.handleRequest(req)

    const otherPair = crypto.generateKeyPairSync('ed25519')
    const otherPubSpki = otherPair.publicKey.export({ format: 'pem', type: 'spki' }).toString()

    const verification = verifyAttestationResponse(response, {
      trustedAttestationPublicKey: otherPubSpki,
      attestationRequest: req,
      allowTestKeys: true,
    })

    expect(verification.valid).toBe(false)
    expect(verification.reason).toBe('ATTESTATION_KEY_ID_MISMATCH')
  })

  // EXT-REAL-11: keyId sustituido es rechazado
  it('EXT-REAL-11: keyId sustituido en la respuesta es rechazado', async () => {
    const req = buildValidRequest()
    const response = await service.handleRequest(req)

    const tamperedResponse = {
      ...response,
      keyId: 'ed25519-spki-substituted00',
    }

    const verification = verifyAttestationResponse(tamperedResponse, {
      trustedAttestationPublicKey: testSigner.publicKeySpki,
      attestationRequest: req,
      allowTestKeys: true,
    })

    expect(verification.valid).toBe(false)
    expect(verification.reason).toBe('ATTESTATION_KEY_ID_MISMATCH')
  })

  // EXT-REAL-12: GO key reutilizada como Attestation key es rechazada
  it('EXT-REAL-12: GO key reutilizada como Attestation key es rechazada por assertSeparationOfAuthorities', () => {
    const goKeyId = testSigner.keyId
    const goPubSpki = testSigner.publicKeySpki

    expect(
      () =>
        new IndependentAttestationAuthorityService({
          signingProvider: testSigner,
          trustedGoKeyId: goKeyId,
        })
    ).toThrow('COLLAPSED_AUTHORITIES_REJECTED')

    expect(
      () =>
        new IndependentAttestationAuthorityService({
          signingProvider: testSigner,
          trustedGoPublicKeySpki: goPubSpki,
        })
    ).toThrow('COLLAPSED_AUTHORITIES_REJECTED')
  })

  // EXT-REAL-13: requestId replay es rechazado
  it('EXT-REAL-13: requestId replay es rechazado por el guardia anti-replay del servicio', async () => {
    const req = buildValidRequest()
    await service.handleRequest(req)

    // Reintento con exactamente el mismo requestId
    await expect(service.handleRequest(req)).rejects.toThrow('SERVICE_ANTI_REPLAY_REQUEST_ID_DUPLICATED')
  })

  // EXT-REAL-14: requestSha256 replay es rechazado
  it('EXT-REAL-14: requestSha256 replay con requestId distinto es rechazado', async () => {
    const req1 = buildValidRequest()
    await service.handleRequest(req1)

    // Modificar requestId pero mantener el mismo requestSha256
    const req2 = {
      ...req1,
      requestId: `att-req-different-${randomUUID()}`,
    }
    expect(() => service.antiReplayGuard.check(req2)).toThrow(
      'SERVICE_ANTI_REPLAY_REQUEST_HASH_DUPLICATED'
    )
  })

  // EXT-REAL-15: Payload alterado después de firmado es rechazado
  it('EXT-REAL-15: Payload alterado después de firmado es rechazado por el verificador', async () => {
    const req = buildValidRequest()
    const response = await service.handleRequest(req)

    const tampered = {
      ...response,
      manifestSha256: 'f'.repeat(64), // modificado
    }

    const verification = verifyAttestationResponse(tampered, {
      trustedAttestationPublicKey: testSigner.publicKeySpki,
      attestationRequest: req,
      allowTestKeys: true,
    })

    expect(verification.valid).toBe(false)
    expect(verification.reason).toBe('ATTESTATION_PAYLOAD_MISMATCH')
  })

  // EXT-REAL-16: Firma inválida es rechazada
  it('EXT-REAL-16: Firma corrupta es rechazada con ATTESTATION_SIGNATURE_INVALID', async () => {
    const req = buildValidRequest()
    const response = await service.handleRequest(req)

    // Corromper un byte de la firma
    const corruptedSig = '00' + response.signature.slice(2)
    const tampered = {
      ...response,
      signature: corruptedSig,
    }

    const verification = verifyAttestationResponse(tampered, {
      trustedAttestationPublicKey: testSigner.publicKeySpki,
      attestationRequest: req,
      allowTestKeys: true,
    })

    expect(verification.valid).toBe(false)
    expect(verification.reason).toBe('ATTESTATION_SIGNATURE_INVALID')
  })

  // EXT-REAL-17: Campos inesperados en response son rechazados
  it('EXT-REAL-17: Campos inesperados en response son rechazados en fail-closed', async () => {
    const req = buildValidRequest()
    const response = await service.handleRequest(req)

    const injected = {
      ...response,
      UNEXPECTED_FIELD: 'MALICIOUS_INJECTION',
    }

    const verification = verifyAttestationResponse(injected, {
      trustedAttestationPublicKey: testSigner.publicKeySpki,
      attestationRequest: req,
      allowTestKeys: true,
    })

    expect(verification.valid).toBe(false)
    expect(verification.reason).toBe('ATTESTATION_RESPONSE_INVALID')
    expect(verification.errorCategory).toBe('UNEXPECTED_RESPONSE_FIELD')
  })

  // EXT-REAL-18: Endpoint HTTP no puede ser usado como producción
  it('EXT-REAL-18: validateAttestationEndpointUrl rechaza protocolo HTTP sin allowHttp explícito', () => {
    expect(() => validateAttestationEndpointUrl('http://attestation.kioskopos.internal/attestations')).toThrow(
      'Protocolo \'http:\' no permitido. Se exige HTTPS'
    )

    const validHttps = validateAttestationEndpointUrl('https://attestation.kioskopos.internal/attestations')
    expect(validHttps).toBe('https://attestation.kioskopos.internal/attestations')
  })

  // EXT-REAL-19: Secretos no aparecen en logs
  it('EXT-REAL-19: Secretos prohibidos son rechazados y no aparecen en logs de eventos', async () => {
    const loggedEvents: any[] = []
    const mockLogger = {
      info: (event: string, meta: any) => loggedEvents.push({ event, meta }),
    }

    const secureService = new IndependentAttestationAuthorityService({
      signingProvider: testSigner,
      logger: mockLogger,
    })

    const payloadWithSecret = JSON.stringify({
      schemaVersion: '1.0',
      token: 'SECRET_AFIP_TOKEN_123',
    })

    await expect(secureService.handleRequest(payloadWithSecret)).rejects.toThrow(
      'PROHIBITED_SECRET_DETECTED'
    )

    // Verificar que nada se registró en logs
    expect(loggedEvents.length).toBe(0)
  })

  // EXT-REAL-20: El servicio de prueba no puede modificar P1_IMPORT_ALLOWED
  it('EXT-REAL-20: La respuesta de la autoridad de prueba no eleva P1_IMPORT_ALLOWED', async () => {
    const req = buildValidRequest()
    const response = await service.handleRequest(req)

    const verification = verifyAttestationResponse(response, {
      trustedAttestationPublicKey: testSigner.publicKeySpki,
      attestationRequest: req,
      allowTestKeys: true,
    })

    expect(verification.valid).toBe(true)
    expect(verification.trustScope).toBe('TEST_ONLY')
    expect(verification.P1_IMPORT_ALLOWED).toBe(false)
    expect(verification.INDEPENDENT_ATTESTATION_AVAILABLE).toBe(false)
    expect(verification.PRODUCTION_ATTESTED).toBe(false)
    expect(verification.ATTESTATION_TRUST_MODEL).toBe('TEST_ONLY')
  })

  // EXT-REAL-21 (Integración HTTP Server): POST /attestations y GET /health
  it('EXT-REAL-21: IndependentAttestationHttpServer opera vía HTTP local con el adaptador cliente', async () => {
    const server = new IndependentAttestationHttpServer({
      service,
      requireHttps: false,
    })

    const { url } = await server.start(0)

    try {
      // 1. Health check
      const healthRes = await fetch(`${url}/health`)
      expect(healthRes.status).toBe(200)
      const healthJson = await healthRes.json()
      expect(healthJson.status).toBe('HEALTHY')
      expect(healthJson.service).toBe('independent-attestation-authority')

      // 2. Prohibición de endpoints administrativos
      const forbiddenRes1 = await fetch(`${url}/private-key`)
      expect(forbiddenRes1.status).toBe(404)
      const forbiddenRes2 = await fetch(`${url}/sign-arbitrary`, { method: 'POST' })
      expect(forbiddenRes2.status).toBe(404)

      // 3. Envío de attestation request usando el cliente de transporte executeHttpsAttestationTransport
      const req = buildValidRequest()
      const response = await executeHttpsAttestationTransport(`${url}/attestations`, req, {
        allowHttp: true,
      })

      expect(response.schemaVersion).toBe('1.0')
      expect(response.algorithm).toBe('Ed25519')

      const verification = verifyAttestationResponse(response, {
        trustedAttestationPublicKey: testSigner.publicKeySpki,
        attestationRequest: req,
        allowTestKeys: true,
      })

      expect(verification.valid).toBe(true)
      expect(verification.P1_IMPORT_ALLOWED).toBe(false)
    } finally {
      await server.close()
    }
  })
})

describe('EXT-REAL-02: Independent Attestation Authority Deployment Readiness & Security Hardening', () => {
  let testSigner: TestSigningProvider
  let antiReplayGuard: ServiceAntiReplayGuard
  let service: IndependentAttestationAuthorityService

  beforeEach(() => {
    testSigner = new TestSigningProvider({
      authorityId: 'ext-authority-readiness-test',
      keyId: 'readiness-key-v1',
    })
    antiReplayGuard = new ServiceAntiReplayGuard({ storageType: 'memory' })
    service = new IndependentAttestationAuthorityService({
      signingProvider: testSigner,
      antiReplayGuard,
      serviceEnvironment: 'TEST',
    })
  })

  it('EXT-REAL-02-HTTP-1: rechaza rutas desconocidas (404), métodos inválidos (405) y rutas prohibidas', async () => {
    const server = new IndependentAttestationHttpServer({
      service,
      requireHttps: false,
      maxBodySizeBytes: 1024 * 64,
    })
    const { url } = await server.start(0)

    try {
      expect((await fetch(`${url}/unknown-route`)).status).toBe(404)
      expect((await fetch(`${url}/attestations`, { method: 'GET' })).status).toBe(405)
      expect((await fetch(`${url}/health`, { method: 'POST' })).status).toBe(405)
      expect((await fetch(`${url}/readiness`, { method: 'POST' })).status).toBe(405)

      const forbiddenPaths = [
        { path: '/sign', method: 'GET' },
        { path: '/sign', method: 'POST' },
        { path: '/sign-arbitrary', method: 'POST' },
        { path: '/private-key', method: 'GET' },
        { path: '/export-key', method: 'GET' },
        { path: '/debug-sign', method: 'POST' },
        { path: '/force-attest', method: 'POST' },
        { path: '/metrics', method: 'GET' },
        { path: '/admin', method: 'GET' },
        { path: '/admin', method: 'POST' },
      ]

      for (const item of forbiddenPaths) {
        const res = await fetch(`${url}${item.path}`, { method: item.method })
        expect(res.status).toBe(404)
      }
    } finally {
      await server.close()
    }
  })

  it('EXT-REAL-02-HTTP-2: rechaza body vacío (400), JSON inválido (400), Content-Type incorrecto (415) y payload excedido (413)', async () => {
    const server = new IndependentAttestationHttpServer({
      service,
      requireHttps: false,
      maxBodySizeBytes: 512,
    })
    const { url } = await server.start(0)

    try {
      const emptyRes = await fetch(`${url}/attestations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '   ',
      })
      expect(emptyRes.status).toBe(400)

      const badJsonRes = await fetch(`${url}/attestations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid-json',
      })
      expect(badJsonRes.status).toBe(400)

      const wrongCtRes = await fetch(`${url}/attestations`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(buildValidRequest()),
      })
      expect(wrongCtRes.status).toBe(415)

      const oversizedRes = await fetch(`${url}/attestations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildValidRequest(), pad: 'x'.repeat(800) }),
      })
      expect(oversizedRes.status).toBe(413)
    } finally {
      await server.close()
    }
  })

  it('EXT-REAL-02-SEC-1: bloquea prototype pollution, claves duplicadas, profundidad > 8 y campos desconocidos', async () => {
    expect(() =>
      safeParseStrictJson('{"a":1,"__proto__":{"polluted":true}}')
    ).toThrow(/PROTOTYPE_POLLUTION_REJECTED/)

    expect(() =>
      safeParseStrictJson('{"constructor":{"prototype":{"admin":true}}}')
    ).toThrow(/PROTOTYPE_POLLUTION_REJECTED/)

    expect(() =>
      safeParseStrictJson('{"requestId":"r1","requestId":"r2"}')
    ).toThrow(/DUPLICATE_JSON_KEY_REJECTED/)

    const deepJson = `${'{"nested":'.repeat(10)}1${'}'.repeat(10)}`
    expect(() => safeParseStrictJson(deepJson)).toThrow(/JSON_MAX_DEPTH_EXCEEDED/)

    const pollutedObj = Object.create(null)
    pollutedObj.safe = 1
    Object.defineProperty(pollutedObj, 'constructor', { value: {}, enumerable: true })
    expect(() => assertNoPrototypePollution(pollutedObj)).toThrow(/PROTOTYPE_POLLUTION_REJECTED/)

    const reqWithUnknown = { ...buildValidRequest(), unexpectedField: 'injected' }
    await expect(service.handleRequest(reqWithUnknown)).rejects.toThrow(/UNEXPECTED_REQUEST_FIELD/)
  })

  it('EXT-REAL-02-SEC-2: exige HTTPS en PRODUCTION, bloquea headers WSAA/ARCA/Supabase y tokens Bearer estáticos no modelados', async () => {
    const req = buildValidRequest()
    await expect(
      service.handleRequest(req, { 'x-wsaa-token': 'secret-token' })
    ).rejects.toThrow(/PROHIBITED_FISCAL_CREDENTIALS_IN_HEADERS/)

    await expect(
      service.handleRequest(req, { 'x-supabase-key': 'service-role-secret' })
    ).rejects.toThrow(/PROHIBITED_FISCAL_CREDENTIALS_IN_HEADERS/)

    const prodKms = new ProductionKmsSigningProvider({
      authorityId: 'prod-kms-auth',
      keyId: 'kms-key-v1',
      publicKeySpki: testSigner.publicKeySpki ?? undefined,
      keyVersionName: 'projects/p/locations/l/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1',
      kmsClient: {
        async sign({ data }) {
          return testSigner.sign(data)
        },
      },
    })

    const goFixtureIssuer = new TestOnlyGoAuthorityIssuer({
      authorityId: 'go-fixture-sec-2',
    })

    const prodService = new IndependentAttestationAuthorityService({
      signingProvider: prodKms,
      antiReplayGuard: new ServiceAntiReplayGuard({
        storageType: 'distributed',
        distributedStore: {
          hasRequestId: async () => false,
          hasRequestHash: async () => false,
          hasAttestationId: async () => false,
          recordOnce: async () => {},
          isHealthy: async () => true,
        },
      }),
      serviceEnvironment: 'PRODUCTION',
      env: { NODE_ENV: 'production', ATTESTATION_ENVIRONMENT: 'PRODUCTION' },
      clientAuthVerifier: createTestCustomAuthVerifier(),
      trustedGoPublicKeySpki: goFixtureIssuer.publicKeySpki,
    })

    await expect(
      prodService.handleRequest(req, { authorization: 'Bearer static-secret-token' })
    ).rejects.toThrow(/UNMODELED_BEARER_TOKEN_REJECTED/)

    expect(
      () =>
        new IndependentAttestationHttpServer({
          service: prodService,
          requireHttps: false,
          trustProxyHttps: false,
        })
    ).toThrow(/INSECURE_HTTP_FORBIDDEN_IN_PRODUCTION/)

    const proxyHttpsServer = new IndependentAttestationHttpServer({
      service: prodService,
      requireHttps: false,
      trustProxyHttps: true,
    })
    const { url } = await proxyHttpsServer.start(0)

    try {
      const insecurePost = await fetch(`${url}/attestations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      })
      expect(insecurePost.status).toBe(403)
      const insecureJson = await insecurePost.json()
      expect(insecureJson.error.code).toBe('INSECURE_TRANSPORT_REJECTED')
    } finally {
      await proxyHttpsServer.close()
    }
  })

  it('EXT-REAL-02-KMS-1: ProductionKmsSigningProvider exige Ed25519, keyId/SPKI válidos y bloquea fallback local', async () => {
    expect(() => new ProductionKmsSigningProvider({ algorithm: 'RSA' })).toThrow(
      /UNSUPPORTED_SIGNING_ALGORITHM/
    )

    const missingKeyIdProvider = new ProductionKmsSigningProvider({
      authorityId: 'kms-a',
      keyId: '',
      publicKeySpki: testSigner.publicKeySpki ?? undefined,
      keyVersionName: 'kv-1',
      kmsClient: {
        async sign({ data }) {
          return testSigner.sign(data)
        },
      },
    })
    expect(missingKeyIdProvider.isProductionReady()).toBe(false)
    await expect(missingKeyIdProvider.sign('canonical-test')).rejects.toThrow(
      /PRODUCTION_KMS_KEY_ID_MISSING/
    )

    const otherKey = crypto.generateKeyPairSync('ed25519')
    const otherSpki = otherKey.publicKey.export({ type: 'spki', format: 'pem' }).toString()

    const mismatchedSigner = new ProductionKmsSigningProvider({
      authorityId: 'kms-a',
      keyId: 'key-1',
      publicKeySpki: otherSpki,
      keyVersionName: 'kv-1',
      kmsClient: {
        async sign({ data }) {
          return testSigner.sign(data)
        },
      },
    })

    await expect(mismatchedSigner.sign('canonical-test')).rejects.toThrow(
      /KMS_PUBLIC_KEY_MISMATCH/
    )

    expect(() => mismatchedSigner.fallbackToLocal()).toThrow(/LOCAL_FALLBACK_SIGNING_FORBIDDEN/)
  })

  it('EXT-REAL-02-ENV-1: /readiness diferencia readiness real, rechaza TestSigningProvider y fallback NODE_ENV en PRODUCTION/STAGING', async () => {
    expect(() =>
      assertServiceEnvironmentIsolation({
        serviceEnvironment: 'PRODUCTION',
        signingProvider: testSigner,
        antiReplayGuard,
      })
    ).toThrow(/TEST_SIGNER_FORBIDDEN_IN_PRODUCTION/)

    expect(() =>
      assertServiceEnvironmentIsolation({
        serviceEnvironment: 'STAGING',
        signingProvider: testSigner,
        antiReplayGuard,
      })
    ).toThrow(/TEST_SIGNER_FORBIDDEN_IN_STAGING/)

    expect(() =>
      new IndependentAttestationAuthorityService({
        signingProvider: testSigner,
        antiReplayGuard,
        serviceEnvironment: 'TEST',
        env: { NODE_ENV: 'production' },
      })
    ).toThrow(/TEST_SIGNER_FORBIDDEN_WHEN_NODE_ENV_PRODUCTION/)

    expect(() =>
      createConfiguredAuthorityFromEnv({
        NODE_ENV: 'production',
      })
    ).toThrow(/ATTESTATION_ENVIRONMENT_REQUIRED/)

    expect(() =>
      createConfiguredAuthorityFromEnv({
        ATTESTATION_ENVIRONMENT: 'PRODUCTION',
        ATTESTATION_SIGNING_PROVIDER: 'TEST_SIGNER',
        NODE_ENV: 'production',
      })
    ).toThrow(/TEST_SIGNER_FORBIDDEN_IN_PRODUCTION|TEST_SIGNER_FORBIDDEN_WHEN_NODE_ENV_PRODUCTION/)

    expect(() =>
      createConfiguredAuthorityFromEnv({
        ATTESTATION_ENVIRONMENT: 'PRODUCTION',
        ATTESTATION_SIGNING_PROVIDER: 'PRODUCTION_KMS_SIGNER',
        NODE_ENV: 'production',
      })
    ).toThrow(/PRODUCTION_KMS_NOT_CONFIGURED/)

    const unreadyKms = new ProductionKmsSigningProvider({
      authorityId: 'prod-unwired',
      keyId: 'kms-key-unwired',
      publicKeySpki: testSigner.publicKeySpki ?? undefined,
      keyVersionName: 'kv-unwired',
    })

    expect(
      () =>
        new IndependentAttestationAuthorityService({
          signingProvider: unreadyKms,
          antiReplayGuard: new ServiceAntiReplayGuard({
            storageType: 'distributed',
            distributedStore: {
              hasRequestId: async () => false,
              hasRequestHash: async () => false,
              hasAttestationId: async () => false,
              recordOnce: async () => {},
              isHealthy: async () => true,
            },
          }),
          serviceEnvironment: 'PRODUCTION',
          env: { NODE_ENV: 'production', ATTESTATION_ENVIRONMENT: 'PRODUCTION' },
        })
    ).toThrow(/PRODUCTION_KMS_NOT_CONFIGURED/)

    let antiReplayStoreHealthy = false
    const readyKms = new ProductionKmsSigningProvider({
      authorityId: 'prod-ready-auth',
      keyId: 'kms-key-ready',
      publicKeySpki: testSigner.publicKeySpki ?? undefined,
      keyVersionName: 'projects/p/locations/l/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1',
      kmsClient: {
        async sign({ data }) {
          return testSigner.sign(data)
        },
      },
    })

    const goFixtureIssuerEnv = new TestOnlyGoAuthorityIssuer({
      authorityId: 'go-fixture-env-1',
    })

    const degradedProdService = new IndependentAttestationAuthorityService({
      signingProvider: readyKms,
      antiReplayGuard: new ServiceAntiReplayGuard({
        storageType: 'distributed',
        distributedStore: {
          hasRequestId: async () => false,
          hasRequestHash: async () => false,
          hasAttestationId: async () => false,
          recordOnce: async () => {},
          isHealthy: async () => antiReplayStoreHealthy,
        },
      }),
      serviceEnvironment: 'PRODUCTION',
      env: { NODE_ENV: 'production', ATTESTATION_ENVIRONMENT: 'PRODUCTION' },
      clientAuthVerifier: createTestCustomAuthVerifier(),
      trustedGoPublicKeySpki: goFixtureIssuerEnv.publicKeySpki,
    })

    const server = new IndependentAttestationHttpServer({
      service: degradedProdService,
      requireHttps: false,
      trustProxyHttps: true,
    })
    const { url } = await server.start(0)

    try {
      const healthRes = await fetch(`${url}/health`)
      expect(healthRes.status).toBe(200)
      const readinessDownRes = await fetch(`${url}/readiness`)
      expect(readinessDownRes.status).toBe(503)
      const readinessDownJson = await readinessDownRes.json()
      expect(readinessDownJson.ready).toBe(false)
      expect(readinessDownJson.antiReplayHealthy).toBe(false)
      expect(readinessDownJson).not.toHaveProperty('privateKey')
      expect(readinessDownJson).not.toHaveProperty('kmsEndpoint')

      antiReplayStoreHealthy = true
      const readinessUpRes = await fetch(`${url}/readiness`)
      expect(readinessUpRes.status).toBe(200)
      const readinessUpJson = await readinessUpRes.json()
      expect(readinessUpJson.ready).toBe(true)
      expect(readinessUpJson.providerReady).toBe(true)
      expect(readinessUpJson.antiReplayHealthy).toBe(true)
    } finally {
      await server.close()
    }
  })

  it('EXT-REAL-02-REPLAY-LOG-1: anti-replay durable persiste tras reinicio y logging seguro no filtra secretos ni headers', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-real-02-replay-'))
    const replayFile = path.join(tmpDir, 'replay-store.json')

    try {
      const events: Array<{ event: string; meta: Record<string, unknown> }> = []
      const safeLogger = {
        info(event: string, meta: Record<string, unknown>) {
          events.push({ event, meta })
        },
      }

      const guard1 = new ServiceAntiReplayGuard({
        storageType: 'file',
        filePath: replayFile,
      })
      const svc1 = new IndependentAttestationAuthorityService({
        signingProvider: testSigner,
        antiReplayGuard: guard1,
        serviceEnvironment: 'TEST',
        logger: safeLogger,
      })

      const req = buildValidRequest()
      const res1 = await svc1.handleRequest(req, { authorization: 'Bearer super-secret-should-not-log' })
      expect(res1.schemaVersion).toBe('1.0')
      expect(res1.authorityType).toBe('TEST_AUTHORITY')
      expect(typeof res1.signature).toBe('string')

      // Reinicio simulado con nueva instancia leyendo del archivo persistido
      const guard2 = new ServiceAntiReplayGuard({
        storageType: 'file',
        filePath: replayFile,
      })
      const svc2 = new IndependentAttestationAuthorityService({
        signingProvider: testSigner,
        antiReplayGuard: guard2,
        serviceEnvironment: 'TEST',
        logger: safeLogger,
      })

      await expect(svc2.handleRequest(req)).rejects.toThrow(/SERVICE_ANTI_REPLAY_REQUEST_ID_DUPLICATED/)

      const serializedLogs = JSON.stringify(events)
      expect(serializedLogs).toContain('ATTESTATION_ISSUED')
      expect(serializedLogs).toContain('ATTESTATION_REJECTED')
      expect(serializedLogs).not.toContain('super-secret-should-not-log')
      expect(serializedLogs).not.toContain('authorization')
      expect(serializedLogs).not.toContain('PRIVATE KEY')

      expect(
        () => new ServiceAntiReplayGuard({ storageType: 'distributed' })
      ).toThrow(/SERVICE_ANTI_REPLAY_DISTRIBUTED_STORE_REQUIRED/)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('EXT-REAL-02-CFG-READINESS-1: valida puerto, body limit, backend anti-replay, config parcial y readiness honesto', () => {
    expect(() =>
      createConfiguredAuthorityFromEnv({
        ATTESTATION_ENVIRONMENT: 'TEST',
        ATTESTATION_SIGNING_PROVIDER: 'TEST_SIGNER',
        ATTESTATION_SERVICE_PORT: 'abc',
      })
    ).toThrow(/ATTESTATION_PORT_INVALID/)

    expect(() =>
      createConfiguredAuthorityFromEnv({
        ATTESTATION_ENVIRONMENT: 'TEST',
        ATTESTATION_SIGNING_PROVIDER: 'TEST_SIGNER',
        ATTESTATION_SERVICE_PORT: '70000',
      })
    ).toThrow(/ATTESTATION_PORT_INVALID/)

    expect(() =>
      createConfiguredAuthorityFromEnv({
        ATTESTATION_ENVIRONMENT: 'TEST',
        ATTESTATION_SIGNING_PROVIDER: 'TEST_SIGNER',
        ATTESTATION_MAX_BODY_BYTES: '100',
      })
    ).toThrow(/ATTESTATION_MAX_BODY_BYTES_INVALID/)

    expect(() =>
      createConfiguredAuthorityFromEnv({
        ATTESTATION_ENVIRONMENT: 'TEST',
        ATTESTATION_SIGNING_PROVIDER: 'TEST_SIGNER',
        ATTESTATION_ANTI_REPLAY_BACKEND: 'UNWIRED_REDIS',
      })
    ).toThrow(/ATTESTATION_ANTI_REPLAY_BACKEND_INVALID/)

    expect(() =>
      createConfiguredAuthorityFromEnv({
        ATTESTATION_ENVIRONMENT: 'PRODUCTION',
        ATTESTATION_SIGNING_PROVIDER: 'PRODUCTION_KMS_SIGNER',
        ATTESTATION_KMS_KEY_ID: 'projects/p/locations/l/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1',
        ATTESTATION_KEY_ID: 'ed25519-spki-0000000000000000',
      })
    ).toThrow(/PRODUCTION_KMS_NOT_CONFIGURED/)

    const readiness = evaluateExternalAuthorityReadiness({
      endpoint: 'https://attestation.example.invalid/attestations',
      kmsKeyId: 'projects/p/locations/l/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1',
      env: {
        ATTESTATION_KMS_KEY_ID: 'projects/p/locations/l/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1',
      },
    })
    expect(readiness.EXTERNAL_AUTHORITY_SERVICE_IMPLEMENTED).toBe(true)
    expect(readiness.EXTERNAL_AUTHORITY_DEPLOYMENT_READY).toBe(true)
    expect(readiness.EXTERNAL_AUTHORITY_ENDPOINT_CONFIGURED).toBe(true)
    expect(readiness.EXTERNAL_AUTHORITY_SERVICE_DEPLOYED).toBe(false)
    expect(readiness.PRODUCTION_SIGNING_PROVIDER_CONFIGURED).toBe(false)
    expect(readiness.EXTERNAL_AUTHORITY_ENDPOINT_REACHABLE).toBe(false)
    expect(readiness.EXTERNAL_AUTHORITY_CRYPTOGRAPHICALLY_VERIFIED).toBe(false)
    expect(readiness.AUTHORITY_REAL_WORLD_AVAILABLE).toBe(false)
    expect(readiness.P1_IMPORT_ALLOWED).toBe(false)
    expect(readiness.READINESS_STAGES.DEPLOYMENT_READY).toBe(true)
    expect(readiness.READINESS_STAGES.DEPLOYED).toBe(false)
    expect(readiness.READINESS_STAGES.REAL_WORLD_AVAILABLE).toBe(false)
  })

  it('EXT-REAL-02-HEALTH-REPLAY-SHUTDOWN-1: distingue health vs autoridad real, rechaza attestationId duplicado y ejecuta graceful shutdown', async () => {
    const server = new IndependentAttestationHttpServer({
      service,
      requireHttps: false,
    })
    const { url } = await server.start(0)

    const guard = new ServiceAntiReplayGuard({ storageType: 'memory' })
    expect(guard.antiReplayTier).toBe('IN_MEMORY')
    const req1 = buildValidRequest()
    const req2 = buildValidRequest()
    guard.record(req1, { attestationId: 'att-dup-1' })
    expect(() => guard.record(req2, { attestationId: 'att-dup-1' })).toThrow(
      /SERVICE_ANTI_REPLAY_ATTESTATION_ID_DUPLICATED/
    )

    try {
      const healthRes = await fetch(`${url}/health`)
      expect(healthRes.status).toBe(200)
      const healthJson = await healthRes.json()
      expect(healthJson.status).toBe('HEALTHY')
      expect(healthJson.processStarted).toBe(true)
      expect(healthJson.httpServerRunning).toBe(true)
      expect(healthJson.signingProviderConfigured).toBe(true)
      expect(healthJson.productionSigningReady).toBe(false)
      expect(healthJson.authorityRealWorldAvailable).toBe(false)

      const shutdownEvents: string[] = []
      const exitCodes: number[] = []
      const handleShutdown = createGracefulShutdownHandler({
        server,
        logger: {
          info(event: string) {
            shutdownEvents.push(event)
          },
        },
        onExit: (code: number) => exitCodes.push(code),
      })

      const [resA, resB] = await Promise.all([
        handleShutdown('SIGTERM'),
        handleShutdown('SIGINT'),
      ])
      expect(resA.closed).toBe(true)
      expect(resB.closed).toBe(true)
      expect(server.isShuttingDown).toBe(true)
      expect(server.isRunning).toBe(false)
      expect(exitCodes).toEqual([0])
      expect(shutdownEvents).toEqual([
        'SERVER_SHUTDOWN_INITIATED',
        'SERVER_SHUTDOWN_COMPLETED',
      ])
    } finally {
      if (server.isRunning) await server.close()
    }
  })
})

describe('EXT-REAL-04: Controles Críticos de Confianza, GoAuthorizationGrant v1.1 y Anti-Replay Pre-Firma', () => {
  const EXPECTED_PROJECT_REF = 'acoyfwwmhaeruciyedri'
  const VALID_TOKEN = 'sim-pos-collector-token-04'
  const AUTH_HEADERS = { authorization: `Bearer ${VALID_TOKEN}` }

  const spyCallsMap = new WeakMap<object, string[]>()
  const spyCustomSignMap = new WeakMap<object, (payload: string | Buffer) => string>()

  class SpyTestSigningProvider extends TestSigningProvider {
    override sign(payload: string | Buffer): string {
      const calls = spyCallsMap.get(this) || []
      calls.push(typeof payload === 'string' ? payload : payload.toString('utf8'))
      spyCallsMap.set(this, calls)
      const custom = spyCustomSignMap.get(this)
      if (custom) {
        return custom(payload)
      }
      return super.sign(payload)
    }
  }

  function createFixture({
    serviceEnvironment = 'DEVELOPMENT',
    protectedMode = true,
    antiReplayGuard,
    signOverride,
    now = '2026-11-13T15:00:00.000Z',
  }: {
    serviceEnvironment?: 'TEST' | 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION'
    protectedMode?: boolean
    antiReplayGuard?: ServiceAntiReplayGuard
    signOverride?: (payload: string | Buffer) => string
    now?: string
  } = {}) {
    const goIssuer = new TestOnlyGoAuthorityIssuer({
      authorityId: 'kioskopos-go-governance-test-only',
    })
    const signerCalls: string[] = []
    const rawSpy = new SpyTestSigningProvider({
      authorityId: 'external-attestation-test-only',
    })
    spyCallsMap.set(rawSpy, signerCalls)
    if (signOverride) {
      spyCustomSignMap.set(rawSpy, signOverride)
    }
    const signer = Object.assign(Object.create(rawSpy), {
      signCalls: signerCalls,
    }) as SpyTestSigningProvider & { signCalls: string[] }
    // Ensure instance passed to service is rawSpy itself so instanceof & WeakMap lookup work directly
    void signer

    const simulatedAuth = createSimulatedClientAuthVerifier({
      validTokens: {
        [VALID_TOKEN]: {
          clientId: 'pos-collector-test-client',
          allowedScopes: ['PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'],
          mechanism: 'SIMULATED_OIDC',
        },
      },
    })

    const service = new IndependentAttestationAuthorityService({
      signingProvider: rawSpy,
      antiReplayGuard: antiReplayGuard || new ServiceAntiReplayGuard({ storageType: 'memory' }),
      serviceEnvironment,
      protectedMode,
      clientAuthVerifier: simulatedAuth,
      trustedGoPublicKeySpki: goIssuer.publicKeySpki,
      trustedGoAuthorityId: goIssuer.authorityId,
      trustedGoKeyId: goIssuer.keyId,
      expectedProjectRef: EXPECTED_PROJECT_REF,
      expectedCommitSha: VALID_COMMIT_SHA,
    })

    const buildSignedGrantBundle = (overrides: Record<string, any> = {}) => {
      const reqWithoutGrant = buildValidRequest({
        projectRef: EXPECTED_PROJECT_REF,
        ...overrides.requestOverrides,
      })
      const signedGrant = goIssuer.issueGrant({
        authorizationId: reqWithoutGrant.authorizationId,
        requestId: reqWithoutGrant.requestId,
        processId: reqWithoutGrant.processId,
        executionScope: reqWithoutGrant.executionScope,
        environment: reqWithoutGrant.environment,
        projectRef: overrides.grantProjectRef ?? EXPECTED_PROJECT_REF,
        commitSha: reqWithoutGrant.commitSha,
        requestSha256: overrides.grantRequestSha256 ?? reqWithoutGrant.requestSha256,
        issuedAt: overrides.issuedAt ?? now,
        expiresAt: overrides.expiresAt ?? '2026-11-13T15:10:00.000Z',
        ...overrides.grantOverrides,
      })
      const grantSha256 = computeGoGrantDigest(signedGrant)
      const finalReq = {
        ...reqWithoutGrant,
        ...(overrides.includeGrant === false ? {} : { goAuthorizationGrant: signedGrant }),
      }
      return { request: finalReq, grant: signedGrant, grantSha256 }
    }

    const signerHandle = {
      signCalls: signerCalls,
      get publicKeySpki() {
        return rawSpy.publicKeySpki
      },
      get authorityId() {
        return rawSpy.authorityId
      },
      get keyId() {
        return rawSpy.keyId
      },
      provider: rawSpy,
    }

    return {
      goIssuer,
      signer: signerHandle,
      simulatedAuth,
      service,
      buildSignedGrantBundle,
      now,
    }
  }

  it('EXT-REAL-04-01/02/03/04: rechaza sin auth, sin Grant, con firma inválida o con clave GO distinta (0 firmas)', async () => {
    const { service, signer, buildSignedGrantBundle, now } = createFixture()
    const { request } = buildSignedGrantBundle()

    // 1. Sin autenticación en modo protegido -> 401 CLIENT_AUTH_FAILED
    await expect(service.handleRequest(request, {}, { now })).rejects.toThrow(/CLIENT_AUTH_FAILED/)
    expect(signer.signCalls.length).toBe(0)

    // 2. Sin GoAuthorizationGrant -> 403 GO_AUTHORIZATION_GRANT_REQUIRED
    const withoutGrant = buildSignedGrantBundle({ includeGrant: false })
    await expect(
      service.handleRequest(withoutGrant.request, AUTH_HEADERS, { now })
    ).rejects.toThrow(/GO_AUTHORIZATION_GRANT_REQUIRED/)
    expect(signer.signCalls.length).toBe(0)

    // 3. Firma inválida / corrupta en GoAuthorizationGrant -> 403 GO_AUTHORIZATION_SIGNATURE_INVALID
    const originalGrant = request.goAuthorizationGrant!
    const badSigReq = {
      ...request,
      goAuthorizationGrant: {
        ...originalGrant,
        signature:
          (originalGrant.signature[0] === '0' ? '1' : '0') +
          originalGrant.signature.slice(1),
      },
    }
    await expect(service.handleRequest(badSigReq, AUTH_HEADERS, { now })).rejects.toThrow(
      /GO_AUTHORIZATION_SIGNATURE_INVALID/
    )
    expect(signer.signCalls.length).toBe(0)

    // 4. Grant firmado por otra clave GO no confiable -> 403 GO_AUTHORIZATION_KEY_ID_MISMATCH / SIGNATURE_INVALID
    const rogueGo = new TestOnlyGoAuthorityIssuer({ authorityId: 'kioskopos-go-governance-test-only' })
    const reqForRogue = buildValidRequest({ projectRef: EXPECTED_PROJECT_REF })
    const rogueGrant = rogueGo.issueGrant({
      authorizationId: reqForRogue.authorizationId,
      requestId: reqForRogue.requestId,
      processId: reqForRogue.processId,
      executionScope: reqForRogue.executionScope,
      environment: reqForRogue.environment,
      projectRef: EXPECTED_PROJECT_REF,
      commitSha: reqForRogue.commitSha,
      requestSha256: reqForRogue.requestSha256,
      issuedAt: now,
      expiresAt: '2026-11-13T15:10:00.000Z',
    })
    const rogueReq = {
      ...reqForRogue,
      goAuthorizationGrant: rogueGrant,
    }
    await expect(service.handleRequest(rogueReq, AUTH_HEADERS, { now })).rejects.toThrow(
      /GO_AUTHORIZATION_KEY_ID_MISMATCH|GO_AUTHORIZATION_SIGNATURE_INVALID/
    )
    expect(signer.signCalls.length).toBe(0)
  })

  it('EXT-REAL-04-05/06/13: rechaza Grant expirado, issuedAt futuro y digest mismatch (0 firmas)', async () => {
    const { service, signer, buildSignedGrantBundle } = createFixture()

    // 5. Grant expirado
    const expiredBundle = buildSignedGrantBundle({
      issuedAt: '2026-11-13T14:30:00.000Z',
      expiresAt: '2026-11-13T14:40:00.000Z',
    })
    await expect(
      service.handleRequest(expiredBundle.request, AUTH_HEADERS, { now: '2026-11-13T15:00:00.000Z' })
    ).rejects.toThrow(/GO_AUTHORIZATION_EXPIRED/)
    expect(signer.signCalls.length).toBe(0)

    // 6. issuedAt futuro fuera de tolerancia (> 0s)
    const futureBundle = buildSignedGrantBundle({
      issuedAt: '2026-11-13T15:05:00.000Z',
      expiresAt: '2026-11-13T15:15:00.000Z',
    })
    await expect(
      service.handleRequest(futureBundle.request, AUTH_HEADERS, { now: '2026-11-13T15:00:00.000Z' })
    ).rejects.toThrow(/GO_AUTHORIZATION_NOT_YET_VALID/)
    expect(signer.signCalls.length).toBe(0)

    // 13. Digest del request no coincide con el digest vinculado en el Grant
    const badDigestBundle = buildSignedGrantBundle({
      grantRequestSha256: 'f'.repeat(64),
    })
    await expect(
      service.handleRequest(badDigestBundle.request, AUTH_HEADERS, { now: '2026-11-13T15:00:00.000Z' })
    ).rejects.toThrow(/GO_AUTHORIZATION_DIGEST_MISMATCH/)
    expect(signer.signCalls.length).toBe(0)
  })

  it('EXT-REAL-04-07/08/09/10/11/12: rechaza mismatch de requestId, requestSha256, executionScope, environment, projectRef y commitSha (0 firmas)', async () => {
    const { goIssuer, service, signer, now } = createFixture()

    // 7. Otro requestId
    const targetReq7 = buildValidRequest({ projectRef: EXPECTED_PROJECT_REF })
    const grant7 = goIssuer.issueGrant({
      authorizationId: targetReq7.authorizationId,
      requestId: `att-req-other-${randomUUID()}`,
      processId: targetReq7.processId,
      executionScope: targetReq7.executionScope,
      environment: targetReq7.environment,
      projectRef: EXPECTED_PROJECT_REF,
      commitSha: targetReq7.commitSha,
      requestSha256: targetReq7.requestSha256,
      issuedAt: now,
      expiresAt: '2026-11-13T15:10:00.000Z',
    })
    await expect(
      service.handleRequest({ ...targetReq7, goAuthorizationGrant: grant7 }, AUTH_HEADERS, { now })
    ).rejects.toThrow(/GO_AUTHORIZATION_REQUEST_MISMATCH/)

    // 8. Otro requestSha256 (digest diferente en grant)
    const req8 = buildValidRequest({ projectRef: EXPECTED_PROJECT_REF })
    const grant8 = goIssuer.issueGrant({
      authorizationId: req8.authorizationId,
      requestId: req8.requestId,
      processId: req8.processId,
      executionScope: req8.executionScope,
      environment: req8.environment,
      projectRef: EXPECTED_PROJECT_REF,
      commitSha: req8.commitSha,
      requestSha256: '1'.repeat(64),
      issuedAt: now,
      expiresAt: '2026-11-13T15:10:00.000Z',
    })
    await expect(
      service.handleRequest({ ...req8, goAuthorizationGrant: grant8 }, AUTH_HEADERS, { now })
    ).rejects.toThrow(/GO_AUTHORIZATION_DIGEST_MISMATCH/)

    // 9. Otro executionScope (e.g. intentando scope distinto en grant)
    const req9 = buildValidRequest({ projectRef: EXPECTED_PROJECT_REF })
    const grant9 = goIssuer.issueGrant({
      authorizationId: req9.authorizationId,
      requestId: req9.requestId,
      processId: req9.processId,
      executionScope: 'PR02_P0_DRY_RUN',
      environment: req9.environment,
      projectRef: EXPECTED_PROJECT_REF,
      commitSha: req9.commitSha,
      requestSha256: req9.requestSha256,
      issuedAt: now,
      expiresAt: '2026-11-13T15:10:00.000Z',
    })
    await expect(
      service.handleRequest({ ...req9, goAuthorizationGrant: grant9 }, AUTH_HEADERS, { now })
    ).rejects.toThrow(/GO_AUTHORIZATION_SCOPE_MISMATCH|FORBIDDEN_EXECUTION_SCOPE/)

    // 10. Otro environment en grant
    const req10 = buildValidRequest({ projectRef: EXPECTED_PROJECT_REF })
    const grant10 = goIssuer.issueGrant({
      authorizationId: req10.authorizationId,
      requestId: req10.requestId,
      processId: req10.processId,
      executionScope: req10.executionScope,
      environment: 'STAGING',
      projectRef: EXPECTED_PROJECT_REF,
      commitSha: req10.commitSha,
      requestSha256: req10.requestSha256,
      issuedAt: now,
      expiresAt: '2026-11-13T15:10:00.000Z',
    })
    await expect(
      service.handleRequest({ ...req10, goAuthorizationGrant: grant10 }, AUTH_HEADERS, { now })
    ).rejects.toThrow(/GO_AUTHORIZATION_ENVIRONMENT_MISMATCH/)

    // 11. Otro projectRef (no esperado por la autoridad ni en el grant)
    const req11 = buildValidRequest({ projectRef: 'rogueprojectref12345' })
    const grant11 = goIssuer.issueGrant({
      authorizationId: req11.authorizationId,
      requestId: req11.requestId,
      processId: req11.processId,
      executionScope: req11.executionScope,
      environment: req11.environment,
      projectRef: 'rogueprojectref12345',
      commitSha: req11.commitSha,
      requestSha256: req11.requestSha256,
      issuedAt: now,
      expiresAt: '2026-11-13T15:10:00.000Z',
    })
    await expect(
      service.handleRequest({ ...req11, goAuthorizationGrant: grant11 }, AUTH_HEADERS, { now })
    ).rejects.toThrow(/ATTESTATION_POLICY_PROJECT_MISMATCH|GO_AUTHORIZATION_PROJECT_MISMATCH/)

    const req11b = buildValidRequest({ projectRef: EXPECTED_PROJECT_REF })
    const grant11b = goIssuer.issueGrant({
      authorizationId: req11b.authorizationId,
      requestId: req11b.requestId,
      processId: req11b.processId,
      executionScope: req11b.executionScope,
      environment: req11b.environment,
      projectRef: 'rogueprojectref12345',
      commitSha: req11b.commitSha,
      requestSha256: req11b.requestSha256,
      issuedAt: now,
      expiresAt: '2026-11-13T15:10:00.000Z',
    })
    await expect(
      service.handleRequest({ ...req11b, goAuthorizationGrant: grant11b }, AUTH_HEADERS, { now })
    ).rejects.toThrow(/GO_AUTHORIZATION_PROJECT_MISMATCH/)

    // 12. Otro commitSha
    const otherSha = '9'.repeat(40)
    const req12 = buildValidRequest({ projectRef: EXPECTED_PROJECT_REF, commitSha: otherSha })
    const grant12 = goIssuer.issueGrant({
      authorizationId: req12.authorizationId,
      requestId: req12.requestId,
      processId: req12.processId,
      executionScope: req12.executionScope,
      environment: req12.environment,
      projectRef: EXPECTED_PROJECT_REF,
      commitSha: otherSha,
      requestSha256: req12.requestSha256,
      issuedAt: now,
      expiresAt: '2026-11-13T15:10:00.000Z',
    })
    await expect(
      service.handleRequest({ ...req12, goAuthorizationGrant: grant12 }, AUTH_HEADERS, { now })
    ).rejects.toThrow(/ATTESTATION_POLICY_COMMIT_MISMATCH|GO_AUTHORIZATION_COMMIT_MISMATCH/)

    const req12b = buildValidRequest({ projectRef: EXPECTED_PROJECT_REF })
    const grant12b = goIssuer.issueGrant({
      authorizationId: req12b.authorizationId,
      requestId: req12b.requestId,
      processId: req12b.processId,
      executionScope: req12b.executionScope,
      environment: req12b.environment,
      projectRef: EXPECTED_PROJECT_REF,
      commitSha: otherSha,
      requestSha256: req12b.requestSha256,
      issuedAt: now,
      expiresAt: '2026-11-13T15:10:00.000Z',
    })
    await expect(
      service.handleRequest({ ...req12b, goAuthorizationGrant: grant12b }, AUTH_HEADERS, { now })
    ).rejects.toThrow(/GO_AUTHORIZATION_COMMIT_MISMATCH/)

    expect(signer.signCalls.length).toBe(0)
  })

  it('EXT-REAL-04-14/15: rechaza alcances prohibidos (PRODUCTION/P1/P2/PV2/CAE/EMISION) y elevación de evidencia desde el cliente (0 firmas)', async () => {
    const { service, signer, buildSignedGrantBundle, now } = createFixture()

    // 14. Alcances y entornos prohibidos rechazados antes de firmar
    for (const forbiddenScope of ['P1_IMPORT', 'P2_MIGRATION', 'PV2_ACTIVATION', 'CAE_EMISION', 'PRODUCTION_RUN']) {
      const reqBadScope = buildValidRequest({ executionScope: forbiddenScope, projectRef: EXPECTED_PROJECT_REF })
      await expect(service.handleRequest(reqBadScope, AUTH_HEADERS, { now })).rejects.toThrow(
        /ATTESTATION_REQUEST_SCOPE_MISMATCH|FORBIDDEN_EXECUTION_SCOPE/
      )
      expect(() =>
        validateAttestationPolicy({
          executionScope: forbiddenScope,
          environment: 'HOMOLOGACION',
          commitSha: VALID_COMMIT_SHA,
          requestId: reqBadScope.requestId,
          processId: reqBadScope.processId,
          authorizationId: reqBadScope.authorizationId,
        })
      ).toThrow(/ATTESTATION_POLICY_FORBIDDEN_SCOPE/)
    }
    const reqProdEnv = buildValidRequest({ environment: 'PRODUCTION', projectRef: EXPECTED_PROJECT_REF })
    await expect(service.handleRequest(reqProdEnv, AUTH_HEADERS, { now })).rejects.toThrow(
      /ATTESTATION_REQUEST_ENVIRONMENT_MISMATCH|FORBIDDEN_TARGET_ENVIRONMENT/
    )

    // 15. Elevación de evidencia declarativa enviada por el cliente
    const valid = buildSignedGrantBundle().request
    for (const forbiddenField of [
      { arcaOriginVerified: true },
      { rawSoapContentVerified: true },
      { evidenceLevel: 'LEVEL_2B_INDEPENDENT_OBSERVED' },
      { selfAttested: true },
      { GO_APPROVED: true },
    ]) {
      const evilReq = { ...valid, ...forbiddenField }
      await expect(service.handleRequest(evilReq, AUTH_HEADERS, { now })).rejects.toThrow(
        /EVIDENCE_LEVEL_ELEVATION_REJECTED|UNEXPECTED_REQUEST_FIELD/
      )
    }

    // Also verify typed Level 2A/2B stubs refuse cleanly with explicit unimplemented status
    const stub2a = new Level2ASubmittedContentEvaluatorStub()
    expect(stub2a.level).toBe(EVIDENCE_INTEGRITY_LEVELS.LEVEL_2A_SUBMITTED_CONTENT)
    await expect(stub2a.inspect(valid)).rejects.toThrow(/EVIDENCE_LEVEL_2A_NOT_IMPLEMENTED/)
    const stub2b = new Level2BIndependentObservedEvaluatorStub()
    expect(stub2b.level).toBe(EVIDENCE_INTEGRITY_LEVELS.LEVEL_2B_INDEPENDENT_OBSERVED)
    await expect(stub2b.inspect(valid)).rejects.toThrow(/EVIDENCE_LEVEL_2B_NOT_IMPLEMENTED/)

    expect(signer.signCalls.length).toBe(0)
  })

  it('EXT-REAL-04-16/17/18: bloquea colapso GO/Attestation y exige clientAuthVerifier + trustedGoPublicKeySpki en modo protegido', () => {
    const goIssuer = new TestOnlyGoAuthorityIssuer({ authorityId: 'shared-auth-id' })
    const attSigner = new TestSigningProvider({ authorityId: 'shared-auth-id', keyId: 'att-k1' })
    const customAuth = createTestCustomAuthVerifier()

    // 16. Colapso de authorityId / clave pública entre GO y Attestation
    expect(
      () =>
        new IndependentAttestationAuthorityService({
          signingProvider: attSigner,
          antiReplayGuard: new ServiceAntiReplayGuard({ storageType: 'memory' }),
          serviceEnvironment: 'DEVELOPMENT',
          clientAuthVerifier: customAuth,
          trustedGoPublicKeySpki: attSigner.publicKeySpki,
          trustedGoAuthorityId: 'other-go',
        })
    ).toThrow(/COLLAPSED_AUTHORITIES_REJECTED/)

    expect(
      () =>
        new IndependentAttestationAuthorityService({
          signingProvider: attSigner,
          antiReplayGuard: new ServiceAntiReplayGuard({ storageType: 'memory' }),
          serviceEnvironment: 'DEVELOPMENT',
          clientAuthVerifier: customAuth,
          trustedGoPublicKeySpki: goIssuer.publicKeySpki,
          trustedGoAuthorityId: 'shared-auth-id',
        })
    ).toThrow(/COLLAPSED_AUTHORITIES_REJECTED/)

    // 17. Arranque protegido sin clientAuthVerifier falla cerrado
    expect(
      () =>
        new IndependentAttestationAuthorityService({
          signingProvider: attSigner,
          antiReplayGuard: new ServiceAntiReplayGuard({ storageType: 'memory' }),
          serviceEnvironment: 'DEVELOPMENT',
          trustedGoPublicKeySpki: goIssuer.publicKeySpki,
        })
    ).toThrow(/CLIENT_AUTH_VERIFIER_REQUIRED/)

    // 18. Arranque protegido sin trustedGoPublicKeySpki falla cerrado
    expect(
      () =>
        new IndependentAttestationAuthorityService({
          signingProvider: attSigner,
          antiReplayGuard: new ServiceAntiReplayGuard({ storageType: 'memory' }),
          serviceEnvironment: 'DEVELOPMENT',
          clientAuthVerifier: customAuth,
        })
    ).toThrow(/GO_TRUST_ANCHOR_REQUIRED/)

    // En PRODUCTION también exige ambos sin fallback
    const dummyProdSigner = new ProductionKmsSigningProvider({
      authorityId: 'prod-guard-auth',
      keyId: 'prod-k1',
      publicKeySpki: attSigner.publicKeySpki ?? undefined,
      keyVersionName: 'projects/p/locations/l/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1',
      kmsClient: { async sign({ data }) { return attSigner.sign(data) } },
    })
    expect(
      () =>
        new IndependentAttestationAuthorityService({
          signingProvider: dummyProdSigner,
          antiReplayGuard: new ServiceAntiReplayGuard({
            storageType: 'distributed',
            distributedStore: {
              hasRequestId: async () => false,
              hasRequestHash: async () => false,
              hasAttestationId: async () => false,
              recordOnce: async () => {},
              isHealthy: async () => true,
            },
          }),
          serviceEnvironment: 'PRODUCTION',
          trustedGoPublicKeySpki: goIssuer.publicKeySpki,
        })
    ).toThrow(/CLIENT_AUTH_VERIFIER_REQUIRED/)

    expect(
      () =>
        new IndependentAttestationAuthorityService({
          signingProvider: dummyProdSigner,
          antiReplayGuard: new ServiceAntiReplayGuard({
            storageType: 'distributed',
            distributedStore: {
              hasRequestId: async () => false,
              hasRequestHash: async () => false,
              hasAttestationId: async () => false,
              recordOnce: async () => {},
              isHealthy: async () => true,
            },
          }),
          serviceEnvironment: 'PRODUCTION',
          clientAuthVerifier: customAuth,
        })
    ).toThrow(/GO_TRUST_ANCHOR_REQUIRED/)

    // También createConfiguredAuthorityFromEnv bloquea SIMULATED_TEST_ONLY en STAGING y exige auth en DEVELOPMENT
    expect(() =>
      createConfiguredAuthorityFromEnv({
        ATTESTATION_ENVIRONMENT: 'DEVELOPMENT',
        ATTESTATION_SIGNING_PROVIDER: 'TEST_SIGNER',
        ATTESTATION_TEST_MODE: 'true',
      })
    ).toThrow(/CLIENT_AUTH_VERIFIER_REQUIRED/)

    // En DEVELOPMENT sí admite explícitamente SIMULATED_TEST_ONLY declarando honestamente clientAuthSimulated: true
    const devSimulatedCfg = createConfiguredAuthorityFromEnv({
      ATTESTATION_ENVIRONMENT: 'DEVELOPMENT',
      ATTESTATION_SIGNING_PROVIDER: 'TEST_SIGNER',
      ATTESTATION_TEST_MODE: 'true',
      ATTESTATION_ANTI_REPLAY_MODE: 'memory',
      ATTESTATION_CLIENT_AUTH_MODE: 'SIMULATED_TEST_ONLY',
      ATTESTATION_SIMULATED_AUTH_TOKENS_JSON: JSON.stringify({
        'dev-tok': { clientId: 'dev-cli', allowedScopes: ['PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'] },
      }),
      ATTESTATION_GO_PUBLIC_KEY_SPKI: goIssuer.publicKeySpki,
    })
    expect(devSimulatedCfg.service.handleHealth().clientAuthSimulated).toBe(true)

    const prodEnvKmsTestDummyKey = crypto.generateKeyPairSync('ed25519')
    const spkiPem = prodEnvKmsTestDummyKey.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    expect(() =>
      createConfiguredAuthorityFromEnv({
        ATTESTATION_ENVIRONMENT: 'STAGING',
        ATTESTATION_SIGNING_PROVIDER: 'PRODUCTION_KMS_SIGNER',
        ATTESTATION_TEST_MODE: 'false',
        ATTESTATION_REQUIRE_HTTPS: 'false',
        ATTESTATION_TRUST_PROXY_HTTPS: 'true',
        ATTESTATION_ANTI_REPLAY_STORAGE: 'distributed',
        ATTESTATION_AUTHORITY_ID: 'staging-auth',
        ATTESTATION_KEY_ID: 'staging-key-1',
        ATTESTATION_PUBLIC_KEY_SPKI: spkiPem,
        ATTESTATION_KMS_KEY_VERSION: 'arn:aws:kms:us-east-1:111:key/222',
        ATTESTATION_CLIENT_AUTH_MODE: 'SIMULATED_TEST_ONLY',
        ATTESTATION_GO_PUBLIC_KEY_SPKI: goIssuer.publicKeySpki,
      })
    ).toThrow(/SIMULATED_CLIENT_AUTH_FORBIDDEN_IN_STAGING/)
  })

  it('EXT-REAL-04-19/20/21: anti-replay secuencial, carrera concurrente (>=10 paralelas = 1 firma / 9 409) y fallo en firma no recicla identidad', async () => {
    // 19 & 20: Carrera concurrente con 10 solicitudes idénticas simultáneas
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext04-replay-'))
    try {
      const fileGuard = new ServiceAntiReplayGuard({
        storageType: 'file',
        filePath: path.join(tmpDir, 'anti-replay-ext04.json'),
      })
      const fx = createFixture({ antiReplayGuard: fileGuard })
      const { request } = fx.buildSignedGrantBundle()

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => fx.service.handleRequest(request, AUTH_HEADERS, { now: fx.now }))
      )

      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]

      expect(fulfilled.length).toBe(1)
      expect(rejected.length).toBe(9)
      for (const r of rejected) {
        expect(String(r.reason)).toMatch(
          /SERVICE_ANTI_REPLAY_.*DUPLICATED|GO_AUTHORIZATION_REPLAY_DETECTED|REPLAY_DETECTED/
        )
      }
      // Exactly 1 signingProvider.sign() call across all 10 concurrent requests
      expect(fx.signer.signCalls.length).toBe(1)

      // 19b. Reutilizar mismo authorizationId en nuevo requestId también da 409 GO_AUTHORIZATION_REPLAY_DETECTED
      const donorReq2 = buildValidRequest({
        projectRef: EXPECTED_PROJECT_REF,
        authorizationId: request.authorizationId,
      })
      const grant2 = fx.goIssuer.issueGrant({
        authorizationId: donorReq2.authorizationId,
        requestId: donorReq2.requestId,
        processId: donorReq2.processId,
        executionScope: donorReq2.executionScope,
        environment: donorReq2.environment,
        projectRef: EXPECTED_PROJECT_REF,
        commitSha: donorReq2.commitSha,
        requestSha256: donorReq2.requestSha256,
        issuedAt: fx.now,
        expiresAt: '2026-11-13T15:10:00.000Z',
      })
      await expect(
        fx.service.handleRequest(
          {
            ...donorReq2,
            goAuthorizationGrant: grant2,
          },
          AUTH_HEADERS,
          { now: fx.now }
        )
      ).rejects.toThrow(/SERVICE_ANTI_REPLAY_GO_AUTHORIZATION_DUPLICATED|GO_AUTHORIZATION_REPLAY_DETECTED/)
      expect(fx.signer.signCalls.length).toBe(1)

      // 21. Fallo durante firma marca FAILED_CONSUMED y bloquea todo reintento del mismo requestId/authorizationId
      const failFx = createFixture({
        signOverride: () => {
          throw new Error('KMS_TRANSIENT_FAILURE_SIMULATED')
        },
      })
      const failBundle = failFx.buildSignedGrantBundle()
      await expect(
        failFx.service.handleRequest(failBundle.request, AUTH_HEADERS, { now: failFx.now })
      ).rejects.toThrow(/KMS_TRANSIENT_FAILURE_SIMULATED/)
      expect(failFx.signer.signCalls.length).toBe(1)

      // Retry after signing failure MUST NOT call signer again and MUST fail closed
      await expect(
        failFx.service.handleRequest(failBundle.request, AUTH_HEADERS, { now: failFx.now })
      ).rejects.toThrow(
        /SERVICE_ANTI_REPLAY_.*DUPLICATED|SERVICE_ANTI_REPLAY_FAILED|FAILED_ATTEMPT|REPLAY_DETECTED/
      )
      expect(failFx.signer.signCalls.length).toBe(1)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('EXT-REAL-04-22/23: verifica nivel LEVEL_1_DIGEST_ONLY en v1.0 y v1.1 + compatibilidad HTTP + logs sin secretos/tokens', async () => {
    const logs: Record<string, unknown>[] = []
    const fx = createFixture()
    // Capture audit logs
    const auditedService = new IndependentAttestationAuthorityService({
      signingProvider: fx.signer.provider,
      antiReplayGuard: new ServiceAntiReplayGuard({ storageType: 'memory' }),
      serviceEnvironment: 'DEVELOPMENT',
      protectedMode: true,
      clientAuthVerifier: fx.simulatedAuth,
      trustedGoPublicKeySpki: fx.goIssuer.publicKeySpki,
      trustedGoAuthorityId: fx.goIssuer.authorityId,
      trustedGoKeyId: fx.goIssuer.keyId,
      expectedProjectRef: EXPECTED_PROJECT_REF,
      expectedCommitSha: VALID_COMMIT_SHA,
      logger: {
        info(event: string, meta: Record<string, unknown> = {}) {
          logs.push({ event, ...meta })
        },
      },
    })

    // 22a. v1.1 response carries Level 1 declaration inside signed canonical payload
    const bundle11 = fx.buildSignedGrantBundle()
    const res11 = await auditedService.handleRequest(bundle11.request, AUTH_HEADERS, {
      now: fx.now,
      responseVersion: '1.1',
    })
    expect(res11.schemaVersion).toBe('1.1')
    expect(res11.evidenceLevel).toBe(EVIDENCE_INTEGRITY_LEVELS.LEVEL_1_DIGEST_ONLY)
    expect(res11.rawSoapVerified).toBe(false)
    expect(res11.arcaOriginVerified).toBe(false)
    expect(res11.authenticatedClientId).toBe('pos-collector-test-client')
    expect(res11.goIssuerKeyId).toBe(fx.goIssuer.keyId)
    expect(res11.goGrantSha256).toBe(bundle11.grantSha256)

    const verified11 = verifyServiceAttestationResponse(res11, {
      trustedAttestationPublicKey: fx.signer.publicKeySpki!,
      pinnedKeyId: fx.signer.keyId ?? undefined,
    })
    expect(verified11.valid).toBe(true)
    expect(res11.requestSha256).toBe(bundle11.request.requestSha256)

    // Tampering evidenceLevel in v1.1 fails cryptographic verification
    const tampered11 = { ...res11, arcaOriginVerified: true }
    expect(() =>
      verifyServiceAttestationResponse(tampered11, {
        trustedAttestationPublicKey: fx.signer.publicKeySpki!,
      })
    ).toThrow(/ATTESTATION_RESPONSE_EVIDENCE_CLAIM_INVALID|ATTESTATION_SIGNATURE_INVALID/)

    // 22b. HTTP Server integration with v1.0 client verifier & honest headers
    const liveNowMs = Date.now()
    const bundle10 = fx.buildSignedGrantBundle({
      issuedAt: new Date(liveNowMs - 1000).toISOString(),
      expiresAt: new Date(liveNowMs + 300_000).toISOString(),
    })
    const httpServer = new IndependentAttestationHttpServer({
      service: auditedService,
      requireHttps: false,
      trustProxyHttps: true,
    })
    const { url } = await httpServer.start(0)
    try {
      const httpRes = await fetch(`${url}/attestations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-Proto': 'https',
          ...AUTH_HEADERS,
        },
        body: JSON.stringify(bundle10.request),
      })
      expect(httpRes.status).toBe(200)
      expect(httpRes.headers.get('x-attestation-evidence-level')).toBe('LEVEL_1_DIGEST_ONLY')
      expect(httpRes.headers.get('x-attestation-arca-origin-verified')).toBe('false')
      const json10 = await httpRes.json()
      const clientCheck = verifyAttestationResponse(json10, {
        trustedAttestationPublicKey: fx.signer.publicKeySpki,
        attestationRequest: bundle10.request,
        allowTestKeys: true,
      })
      expect(clientCheck.valid).toBe(true)
      expect(clientCheck.authorityId).toBe(fx.signer.authorityId)

      // Trigger rejected auth over HTTP and ensure error + logs never leak Bearer token or private keys
      const unauthRes = await fetch(`${url}/attestations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-Proto': 'https',
          authorization: 'Bearer ultra-secret-leak-probe-token-999',
        },
        body: JSON.stringify(bundle10.request),
      })
      expect([401, 403]).toContain(unauthRes.status)
      const unauthText = await unauthRes.text()
      expect(unauthText).not.toContain('ultra-secret-leak-probe-token-999')
    } finally {
      await httpServer.close()
    }

    // 23. Ningún token, header Authorization ni BEGIN PRIVATE KEY aparece en logs
    const serializedLogs = JSON.stringify(logs)
    expect(serializedLogs).not.toContain(VALID_TOKEN)
    expect(serializedLogs).not.toContain('ultra-secret-leak-probe-token-999')
    expect(serializedLogs).not.toContain('BEGIN PRIVATE KEY')
    expect(serializedLogs).not.toContain('goAuthorizationGrant')
    expect(logs.some((l) => l.event === 'ATTESTATION_ISSUED')).toBe(true)
    expect(logs.some((l) => l.event === 'ATTESTATION_REJECTED')).toBe(true)
  })

  it('EXT-REAL-04-DIRECT-GRANT-VERIFY: verifyGoAuthorizationGrant valida domain separation y singleUse', () => {
    const goIssuer = new TestOnlyGoAuthorityIssuer({ authorityId: 'go-gov-1' })
    const req = buildValidRequest({ projectRef: 'acoyfwwmhaeruciyedri' })
    const grant = goIssuer.issueGrant({
      authorizationId: req.authorizationId,
      requestId: req.requestId,
      processId: req.processId,
      executionScope: req.executionScope,
      environment: req.environment,
      projectRef: 'acoyfwwmhaeruciyedri',
      commitSha: req.commitSha,
      requestSha256: req.requestSha256,
      issuedAt: '2026-11-13T15:00:00.000Z',
      expiresAt: '2026-11-13T15:10:00.000Z',
    })
    const grantSha256 = computeGoGrantDigest(grant)
    expect(grant.schemaVersion).toBe(GO_GRANT_SCHEMA_VERSION)
    const ok = verifyGoAuthorizationGrant(grant, {
      trustedGoPublicKeySpki: goIssuer.publicKeySpki,
      trustedGoAuthorityId: goIssuer.authorityId,
      trustedGoKeyId: goIssuer.keyId,
      expectedProjectRef: 'acoyfwwmhaeruciyedri',
      expectedCommitSha: VALID_COMMIT_SHA,
      requestPkg: req,
      now: '2026-11-13T15:05:00.000Z',
    })
    expect(ok.valid).toBe(true)
    expect(ok.grantSha256).toBe(grantSha256)
  })
})
