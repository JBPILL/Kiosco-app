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
} from '../../services/independent-attestation-authority/src/index.mjs'

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
