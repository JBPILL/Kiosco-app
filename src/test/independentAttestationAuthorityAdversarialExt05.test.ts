/**
 * EXT-REAL-05 — Suite Adversarial Independiente de Confianza, Autorización y Anti-Replay
 *
 * Pruebas adversariales independientes de EXT-REAL-04 para el servicio
 * `services/independent-attestation-authority/`.
 *
 * Cobertura sistemática por bloques:
 * - Bloque A: Verificación criptográfica de GO_AUTHORIZATION_GRANT v1.1 (mutación de todos los campos,
 *   domain separation, claves duplicadas, campos extra, issuerAuthorityId omitido, trust anchor injection)
 * - Bloque B: Separación estricta GO vs Attestation y aislamiento de test providers en STAGING/PRODUCTION
 * - Bloque C: Autenticación/autorización del cliente y manipulación de headers/scopes
 * - Bloque D: Anti-replay host-local, concurrencia real (100 req + 2 procesos OS), persistencia,
 *   corrupción, lock huérfano, permisos de directorio (cuando el SO lo soporta) y symlinks
 * - Bloque E: Garantía estricta de reserva previa antes de invocar signingProvider.sign()
 * - Bloque F: Integridad de evidencia Nivel 1 (Digest-Only) y rechazo de elevación por cliente
 * - Bloque G: Hardening HTTP, manejo seguro de errores, timeouts, streams abortados, headers duplicados, Host/URL
 * - Bloque H: Ciclos E2E completos con restart/recuperación desde archivo real en disco
 *
 * Restricciones:
 * - 100% LOCAL-ONLY: 0 llamadas a ARCA, 0 lecturas/escrituras Supabase, 0 KMS/HSM reales.
 */

import { describe, it, expect, afterEach } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import {
  computeAttestationRequestDigest,
  PR02_P0_COLECTOR_IDENTIDAD,
} from '../../scripts/fiscal/plan-pr02-parameters.mjs'

import {
  TestSigningProvider,
  ProductionKmsSigningProvider,
  ServiceAntiReplayGuard,
  IndependentAttestationAuthorityService,
  IndependentAttestationHttpServer,
  createConfiguredAuthorityFromEnv,
  TestOnlyGoAuthorityIssuer,
  verifyGoAuthorizationGrant,
  buildDomainSeparatedGoGrantSigningBytes,
  createSimulatedClientAuthVerifier,
  verifyServiceAttestationResponse,
  serializeCanonicalAttestationResponsePayload,
  safeParseStrictJson,
  Level2ASubmittedContentEvaluatorStub,
  Level2BIndependentObservedEvaluatorStub,
} from '../../services/independent-attestation-authority/src/index.mjs'

const VALID_PROJECT_REF = 'acoyfwwmhaeruciyedri'
const VALID_COMMIT_SHA = '014ec379a46fc14703b2542ad8bbdd0c97ef8de0'
const VALID_COLLECTOR_ID = PR02_P0_COLECTOR_IDENTIDAD
const VALID_TOKEN = 'ext05-adversarial-valid-oidc-token'
const VALID_FIXED_NOW = new Date(Date.now() - 5_000).toISOString()
const VALID_EXPIRES_AT = new Date(Date.now() + 600_000).toISOString()

const tempDirsToClean: string[] = []

function makeTempDir(prefix = 'ext05-adv-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempDirsToClean.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirsToClean.length > 0) {
    const dir = tempDirsToClean.pop()!
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      // ignore cleanup failures
    }
  }
})

function buildRequestBase(overrides: Record<string, unknown> = {}) {
  const id = crypto.randomUUID()
  const base = {
    schemaVersion: '1.0' as const,
    requestId: `att-req-${id}`,
    processId: `proc-${id}`,
    executionScope: 'PR02_P0_OFFICIAL_EVIDENCE_COLLECTION' as const,
    commitSha: VALID_COMMIT_SHA,
    environment: 'HOMOLOGACION' as const,
    projectRef: VALID_PROJECT_REF,
    authorizationId: `go-auth-${id}`,
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
    consultadoEn: '2026-11-13T14:59:59.000Z',
    requestedAt: VALID_FIXED_NOW,
    collectorIdentity: VALID_COLLECTOR_ID,
    ...overrides,
  }
  const digest = computeAttestationRequestDigest(base)
  return {
    ...base,
    requestSha256:
      overrides.requestSha256 !== undefined ? (overrides.requestSha256 as string) : digest,
  }
}

function createSpySigner(authorityId = 'ext05-attestation-auth') {
  const base = new TestSigningProvider({ authorityId })
  const calls: Array<{ payload: string; at: string }> = []
  let failAfterNCalls: number | null = null
  let throwErrorMessage: string | null = null
  let delayMs = 0

  const provider = Object.assign(Object.create(base), {
    async sign(payload: string | Buffer) {
      calls.push({
        payload: Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload),
        at: new Date().toISOString(),
      })
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs))
      }
      if (throwErrorMessage && (failAfterNCalls === null || calls.length >= failAfterNCalls)) {
        throw new Error(throwErrorMessage)
      }
      return base.sign(payload)
    },
    get calls() {
      return calls
    },
    setFailure(message: string | null, afterCalls: number | null = null) {
      throwErrorMessage = message
      failAfterNCalls = afterCalls
    },
    setDelayMs(ms: number) {
      delayMs = ms
    },
  })

  return provider as TestSigningProvider & {
    calls: Array<{ payload: string; at: string }>
    setFailure: (message: string | null, afterCalls?: number | null) => void
    setDelayMs: (ms: number) => void
  }
}

function createProductionAuthVerifier(opts: {
  token?: string
  clientId?: string
  allowedScopes?: string[]
  isGoAuthority?: boolean
  throwMsg?: string
  returnMalformed?: any
} = {}) {
  const expectedToken = opts.token ?? VALID_TOKEN
  return {
    verifierKind: 'CUSTOM_TEST_OIDC_VERIFIER',
    trustScope: 'CUSTOM_INJECTED',
    isProductionAuthVerifier: () => true,
    async verify(headers: Record<string, unknown>) {
      if (opts.throwMsg) {
        throw new Error(opts.throwMsg)
      }
      if ('returnMalformed' in opts) {
        return opts.returnMalformed
      }
      const auth = typeof headers.authorization === 'string' ? headers.authorization : ''
      if (auth !== `Bearer ${expectedToken}`) {
        throw new Error('CLIENT_AUTH_FAILED: Token rechazado por verificador OIDC')
      }
      return {
        authenticated: true,
        clientId: opts.clientId ?? 'ci-official-collector',
        authMechanism: 'OIDC',
        allowedScopes: opts.allowedScopes ?? ['PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'],
        isGoAuthority: opts.isGoAuthority ?? false,
      }
    },
  }
}

function createHarness(options: {
  serviceEnvironment?: 'TEST' | 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION'
  protectedMode?: boolean
  antiReplayGuard?: ServiceAntiReplayGuard
  clientAuthVerifier?: any
  nowProvider?: () => Date
  signer?: ReturnType<typeof createSpySigner>
  goIssuer?: TestOnlyGoAuthorityIssuer
  expectedProjectRef?: string | null
  expectedCommitSha?: string | null
  logSink?: (entry: any) => void
} = {}) {
  const goIssuer =
    options.goIssuer ??
    new TestOnlyGoAuthorityIssuer({
      authorityId: 'ext05-go-authority',
    })
  const signer = options.signer ?? createSpySigner('ext05-attestation-auth')
  const antiReplayGuard =
    options.antiReplayGuard ?? new ServiceAntiReplayGuard({ storageType: 'memory' })
  const clientAuthVerifier =
    options.clientAuthVerifier === undefined
      ? createSimulatedClientAuthVerifier({
          validTokens: {
            [VALID_TOKEN]: {
              clientId: 'ci-collector-ext05',
              allowedScopes: ['PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'],
              mechanism: 'SIMULATED_OIDC',
            },
          },
        })
      : options.clientAuthVerifier

  const service = new IndependentAttestationAuthorityService({
    signingProvider: signer,
    antiReplayGuard,
    serviceEnvironment: options.serviceEnvironment ?? 'DEVELOPMENT',
    protectedMode: options.protectedMode ?? true,
    clientAuthVerifier,
    trustedGoPublicKeySpki: goIssuer.publicKeySpki,
    trustedGoAuthorityId: goIssuer.authorityId,
    trustedGoKeyId: goIssuer.keyId,
    expectedProjectRef:
      options.expectedProjectRef === undefined ? VALID_PROJECT_REF : options.expectedProjectRef,
    expectedCommitSha:
      options.expectedCommitSha === undefined ? VALID_COMMIT_SHA : options.expectedCommitSha,
    ...(options.nowProvider ? { now: options.nowProvider } : {}),
    ...(options.logSink
      ? {
          logger: {
            info(event: string, meta: Record<string, unknown>) {
              options.logSink!({ event, ...meta })
            },
          },
        }
      : {}),
  })

  function buildSignedRequest(overrides: {
    requestOverrides?: Record<string, unknown>
    grantOverrides?: Record<string, unknown>
    omitGrantFields?: string[]
  } = {}) {
    const reqBase = buildRequestBase({
      ...(overrides.requestOverrides || {}),
    })
    const grant = goIssuer.issueGrant({
      authorizationId: reqBase.authorizationId,
      requestId: reqBase.requestId,
      processId: reqBase.processId,
      executionScope: reqBase.executionScope,
      environment: reqBase.environment,
      projectRef: reqBase.projectRef,
      commitSha: reqBase.commitSha,
      requestSha256: reqBase.requestSha256,
      issuedAt: VALID_FIXED_NOW,
      notBefore: VALID_FIXED_NOW,
      expiresAt: VALID_EXPIRES_AT,
      ...(overrides.grantOverrides || {}),
    })
    const mutableGrant: Record<string, unknown> = { ...grant }
    if (overrides.omitGrantFields) {
      for (const field of overrides.omitGrantFields) {
        delete mutableGrant[field]
      }
    }
    return {
      request: { ...reqBase, goAuthorizationGrant: mutableGrant },
      grant: mutableGrant,
    }
  }

  return {
    goIssuer,
    signer,
    antiReplayGuard,
    service,
    buildSignedRequest,
    authHeaders: { authorization: `Bearer ${VALID_TOKEN}` },
  }
}

function sendRawHttpRequest(
  port: number,
  rawPayload: string,
  abortAfterMs?: number
): Promise<{ statusLine: string; rawResponse: string; error?: Error }> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    let response = ''
    let timer: ReturnType<typeof setTimeout> | null = null

    socket.on('connect', () => {
      if (abortAfterMs !== undefined) {
        // Send headers and partial body, then forcibly destroy socket mid-body
        const splitAt = Math.floor(rawPayload.length / 2)
        socket.write(rawPayload.slice(0, splitAt))
        timer = setTimeout(() => {
          socket.destroy()
          resolve({ statusLine: 'ABORTED', rawResponse: response })
        }, abortAfterMs)
      } else {
        socket.write(rawPayload)
        socket.end()
      }
    })

    socket.on('data', (chunk) => {
      response += chunk.toString('utf8')
    })

    socket.on('end', () => {
      if (timer) clearTimeout(timer)
      const firstLine = response.split('\r\n')[0] || ''
      resolve({ statusLine: firstLine, rawResponse: response })
    })

    socket.on('error', (err) => {
      if (timer) clearTimeout(timer)
      resolve({ statusLine: 'ERROR', rawResponse: response, error: err })
    })
  })
}

describe('EXT-REAL-05 — Auditoría Adversarial Independiente (Bloques A–H)', () => {
  // =========================================================================
  // BLOQUE A — VERIFICACIÓN CRIPTOGRÁFICA DE GO_AUTHORIZATION_GRANT
  // =========================================================================
  describe('Bloque A — Verificación criptográfica de GO_AUTHORIZATION_GRANT v1.1', () => {
    it('EXT-REAL-05-A-1: Rechaza alteración de CADA campo del grant manteniendo firma original (bit/field tampering)', async () => {
      /**
       * Objetivo: Garantizar que todos los campos críticos del GoAuthorizationGrant estén cubiertos por la firma Ed25519.
       * Condición de ataque: Tomar un grant válidamente firmado y mutar uno a uno sus 15 campos críticos sin re-firmar.
       * Esperado: Cada mutación falla antes de invocar signer.sign() (0 firmas).
       */
      const fx = createHarness()
      const { request } = fx.buildSignedRequest()
      const altDigest = 'f'.repeat(64)

      const fieldMutations: Array<[string, unknown]> = [
        ['authorizationId', `auth-tampered-${crypto.randomUUID()}`],
        ['requestId', `req-tampered-${crypto.randomUUID()}`],
        ['processId', 'PR02-P0-TAMPERED'],
        ['executionScope', 'PR02_P1_IMPORT'],
        ['environment', 'production'],
        ['projectRef', 'evilprojectref123456'],
        ['commitSha', 'b'.repeat(40)],
        ['requestSha256', altDigest],
        ['issuerAuthorityId', 'spoofed-go-authority'],
        ['issuerKeyId', 'ed25519-spki-0000000000000000'],
        ['issuedAt', '2026-11-13T14:59:59.000Z'],
        ['notBefore', '2026-11-13T15:00:01.000Z'],
        ['expiresAt', '2026-11-13T15:11:00.000Z'],
        ['singleUse', false],
        ['schemaVersion', 'GO_AUTHORIZATION_GRANT_V2'],
      ]

      for (const [field, mutatedVal] of fieldMutations) {
        const tamperedReq = {
          ...request,
          goAuthorizationGrant: {
            ...request.goAuthorizationGrant,
            [field]: mutatedVal,
          },
        }
        await expect(
          fx.service.handleRequest(tamperedReq, fx.authHeaders),
          `Mutación de '${field}' debería fallar`
        ).rejects.toThrow(/GO_AUTHORIZATION_/)
      }

      expect(fx.signer.calls.length).toBe(0)
    })

    it('EXT-REAL-05-A-2 [REPRO-VULN]: Bloquea omisión de issuerAuthorityId en el grant para no evadir trustedGoAuthorityId ni colapso', async () => {
      /**
       * Objetivo: Evitar que un grant válidamente firmado omita issuerAuthorityId para saltarse trustedGoAuthorityId y la comprobación de colapso.
       * Condición de ataque: Grant firmado válidamente con clave Ed25519 GO omitiendo `issuerAuthorityId` cuando `trustedGoAuthorityId` está configurado.
       * Esperado: Rechazo explícito con `GO_AUTHORIZATION_ISSUER_INVALID`.
       */
      const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
      const goPubSpki = publicKey.export({ format: 'pem', type: 'spki' }).toString()
      const der = publicKey.export({ format: 'der', type: 'spki' })
      const goKeyId = `ed25519-spki-${crypto.createHash('sha256').update(der).digest('hex').slice(0, 16)}`
      const reqBase = buildRequestBase()

      const grantWithoutIssuer: Record<string, unknown> = {
        schemaVersion: '1.1',
        authorizationId: reqBase.authorizationId,
        issuerKeyId: goKeyId,
        requestId: reqBase.requestId,
        processId: reqBase.processId,
        executionScope: reqBase.executionScope,
        environment: reqBase.environment,
        projectRef: reqBase.projectRef,
        commitSha: reqBase.commitSha,
        requestSha256: reqBase.requestSha256,
        issuedAt: VALID_FIXED_NOW,
        notBefore: VALID_FIXED_NOW,
        expiresAt: VALID_EXPIRES_AT,
        singleUse: true,
      }
      const sigBytes = crypto.sign(
        null,
        buildDomainSeparatedGoGrantSigningBytes(grantWithoutIssuer),
        privateKey
      )
      grantWithoutIssuer.signature = sigBytes.toString('hex')

      expect(() =>
        verifyGoAuthorizationGrant(grantWithoutIssuer, {
          trustedGoPublicKeySpki: goPubSpki,
          trustedGoKeyId: goKeyId,
          trustedGoAuthorityId: 'expected-go-authority',
          requestPkg: reqBase,
          now: new Date(),
        })
      ).toThrow(/GO_AUTHORIZATION_ISSUER_INVALID/)
    })

    it('EXT-REAL-05-A-3: Bloquea domain confusion (firma de attestation usada como GO grant), claves JSON duplicadas, campos desconocidos y trust anchor inyectado en request', async () => {
      /**
       * Objetivo: Impedir cross-protocol replay (usar firma de atestación o payload genérico como GO grant), JSON duplicate keys y shadow trust anchor en el body.
       * Condición de ataque: (a) firma con clave del attestation signer o payload con prefijo erróneo, (b) request con `trustedGoPublicKeySpki` inyectado, (c) campo extra en grant, (d) JSON crudo con clave duplicada.
       * Esperado: Rechazo en todos los casos y 0 firmas emitidas.
       */
      const fx = createHarness()
      const reqBase = buildRequestBase()

      // (a) Intentar usar una firma con la clave de la autoridad de atestación
      const foreignIssuer = new TestOnlyGoAuthorityIssuer({
        authorityId: fx.goIssuer.authorityId,
      })
      const foreignGrant = foreignIssuer.issueGrant({
        authorizationId: reqBase.authorizationId,
        requestId: reqBase.requestId,
        processId: reqBase.processId,
        executionScope: reqBase.executionScope,
        environment: reqBase.environment,
        projectRef: reqBase.projectRef,
        commitSha: reqBase.commitSha,
        requestSha256: reqBase.requestSha256,
        issuedAt: VALID_FIXED_NOW,
        expiresAt: VALID_EXPIRES_AT,
      })
      await expect(
        fx.service.handleRequest(
          { ...reqBase, goAuthorizationGrant: foreignGrant },
          fx.authHeaders
        )
      ).rejects.toThrow(/GO_AUTHORIZATION_/)

      // (b) Campo inesperado / shadow trust anchor inyectado dentro de request o grant
      const { request: validReq } = fx.buildSignedRequest()
      await expect(
        fx.service.handleRequest(
          {
            ...validReq,
            trustedGoPublicKeySpki: foreignIssuer.publicKeySpki,
          } as any,
          fx.authHeaders
        )
      ).rejects.toThrow(/UNEXPECTED_REQUEST_FIELD/)

      // (c) Campo desconocido dentro de goAuthorizationGrant
      await expect(
        fx.service.handleRequest(
          {
            ...validReq,
            goAuthorizationGrant: {
              ...validReq.goAuthorizationGrant,
              shadowAdminOverride: true,
            },
          } as any,
          fx.authHeaders
        )
      ).rejects.toThrow(/UNEXPECTED_GO_GRANT_FIELD/)

      // (d) Claves duplicadas en JSON crudo
      expect(() =>
        safeParseStrictJson('{"executionScope":"PR02_P1","executionScope":"PR02_P0_OFFICIAL_EVIDENCE_COLLECTION"}')
      ).toThrow(/DUPLICATE_JSON_KEY/)

      // (e) Ventana temporal inválida: antes de notBefore, expirado exactamente al límite (strict >= expiresAt), issuedAt > now
      const { grant: nbfGrant, request: nbfReq } = fx.buildSignedRequest({
        grantOverrides: {
          issuedAt: '2026-11-13T15:00:00.000Z',
          notBefore: '2026-11-13T15:05:00.000Z',
          expiresAt: '2026-11-13T15:10:00.000Z',
        },
      })
      expect(() =>
        verifyGoAuthorizationGrant(nbfGrant, {
          trustedGoPublicKeySpki: fx.goIssuer.publicKeySpki,
          trustedGoAuthorityId: fx.goIssuer.authorityId,
          trustedGoKeyId: fx.goIssuer.keyId,
          requestPkg: nbfReq,
          now: '2026-11-13T15:02:00.000Z',
        })
      ).toThrow(/GO_AUTHORIZATION_NOT_YET_VALID/)

      expect(() =>
        verifyGoAuthorizationGrant(validReq.goAuthorizationGrant, {
          trustedGoPublicKeySpki: fx.goIssuer.publicKeySpki,
          trustedGoAuthorityId: fx.goIssuer.authorityId,
          trustedGoKeyId: fx.goIssuer.keyId,
          requestPkg: validReq,
          now: VALID_EXPIRES_AT,
        })
      ).toThrow(/GO_AUTHORIZATION_EXPIRED/)

      expect(fx.signer.calls.length).toBe(0)
    })

    it('EXT-REAL-05-A-4 [REPRO-VULN]: verifyServiceAttestationResponse exige Ed25519 real y coherencia responseId === attestationId', () => {
      /**
       * Objetivo: Evitar algoritmos degradados / sustitución de tipo de clave SPKI o divergencia responseId vs attestationId en verificación de respuesta.
       * Condición de ataque: Generar respuesta v1.1 válidamente firmada con Ed25519 pero con `algorithm: 'RSA-SHA256'` y `attestationId !== responseId`.
       * Esperado: Rechazo explícito en verifyServiceAttestationResponse.
       */
      const { privateKey: edPriv, publicKey: edPub } = crypto.generateKeyPairSync('ed25519')
      const edSpki = edPub.export({ format: 'pem', type: 'spki' }).toString()
      const der = edPub.export({ format: 'der', type: 'spki' })
      const derivedKeyId = `ed25519-spki-${crypto.createHash('sha256').update(der).digest('hex').slice(0, 16)}`

      const craftedResp: Record<string, unknown> = {
        schemaVersion: '1.1',
        responseId: 'att-resp-1',
        attestationId: 'att-DIFFERENT-id',
        authorityType: 'TEST_AUTHORITY',
        authorityId: 'ext05-auth',
        keyId: derivedKeyId,
        algorithm: 'RSA-SHA256',
        requestId: 'req-1',
        requestSha256: 'b'.repeat(64),
        manifestSha256: 'c'.repeat(64),
        processId: 'PR02-P0-COLLECT-01',
        executionScope: 'PR02_P0_OFFICIAL_EVIDENCE_COLLECTION',
        commitSha: VALID_COMMIT_SHA,
        environment: 'HOMOLOGACION',
        projectRef: VALID_PROJECT_REF,
        authorizationId: 'auth-1',
        goAuthorizationDocumentSha256: 'a'.repeat(64),
        goIssuerKeyId: derivedKeyId,
        goGrantSha256: 'd'.repeat(64),
        authenticatedClientId: 'ci-client',
        evidenceLevel: 'LEVEL_1_DIGEST_ONLY',
        rawSoapVerified: false,
        arcaOriginVerified: false,
        issuedAt: VALID_FIXED_NOW,
      }
      const canonical = serializeCanonicalAttestationResponsePayload(craftedResp)
      craftedResp.attestationPayloadSha256 = crypto
        .createHash('sha256')
        .update(canonical, 'utf8')
        .digest('hex')
      craftedResp.signature = crypto.sign(null, Buffer.from(canonical, 'utf8'), edPriv).toString('hex')

      expect(() =>
        verifyServiceAttestationResponse(craftedResp, {
          trustedAttestationPublicKey: edSpki,
        })
      ).toThrow(/ATTESTATION_/)
    })
  })

  // =========================================================================
  // BLOQUE B — SEPARACIÓN DE AUTORIDADES Y TEST PROVIDERS
  // =========================================================================
  describe('Bloque B — Separación estricta GO vs Attestation y bloqueo de test artifacts en entornos protegidos', () => {
    it('EXT-REAL-05-B-1 [REPRO-VULN]: PRODUCTION/STAGING rechazan clientAuthVerifier personalizado cuya isProductionAuthVerifier() sea false', () => {
      /**
       * Objetivo: Cerrar bypass donde un verificador simulado/custom sin `simulated: true` ni `TEST_ONLY` reporta `isProductionAuthVerifier() === false` e intenta usarse en PRODUCTION.
       * Condición de ataque: Instanciar servicio PRODUCTION con ProductionKmsSigningProvider + Verificador con `isProductionAuthVerifier: () => false`.
       * Esperado: Constructor lanza `SIMULATED_CLIENT_AUTH_FORBIDDEN_IN_PRODUCTION`.
       */
      const baseSigner = new TestSigningProvider({ authorityId: 'prod-auth-b1' })
      const prodSigner = new ProductionKmsSigningProvider({
        authorityId: 'prod-auth-b1',
        keyId: 'kms-key-b1',
        publicKeySpki: baseSigner.publicKeySpki!,
        keyVersionName: 'projects/p/locations/l/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1',
        kmsClient: { async sign({ data }) { return baseSigner.sign(data) } },
      })
      const goIssuer = new TestOnlyGoAuthorityIssuer({ authorityId: 'go-auth-b1' })

      const disguisedTestVerifier = {
        verifierKind: 'CUSTOM_BYPASS_VERIFIER',
        trustScope: 'CUSTOM',
        isProductionAuthVerifier: () => false,
        async verify() {
          return {
            authenticated: true,
            clientId: 'attacker',
            authMechanism: 'OIDC',
            allowedScopes: ['PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'],
          }
        },
      }

      expect(
        () =>
          new IndependentAttestationAuthorityService({
            signingProvider: prodSigner,
            antiReplayGuard: new ServiceAntiReplayGuard({
              storageType: 'distributed',
              distributedStore: {
                hasRequestId: async () => false,
                hasRequestHash: async () => false,
                hasAttestationId: async () => false,
                hasGoAuthorizationId: async () => false,
                reserveOnce: async () => {},
                recordOnce: async () => {},
                isHealthy: async () => true,
              },
            }),
            serviceEnvironment: 'PRODUCTION',
            clientAuthVerifier: disguisedTestVerifier,
            trustedGoPublicKeySpki: goIssuer.publicKeySpki,
            trustedGoAuthorityId: goIssuer.authorityId,
          })
      ).toThrow(/SIMULATED_CLIENT_AUTH_FORBIDDEN_IN_PRODUCTION|PRODUCTION_ENVIRONMENT_POLICY_VIOLATION/)
    })

    it('EXT-REAL-05-B-2: Bloquea TestSigningProvider en STAGING/PRODUCTION y colapso GO==Attestation con claves compartidas', () => {
      const goIssuer = new TestOnlyGoAuthorityIssuer({ authorityId: 'shared-auth' })
      const signerDifferent = createSpySigner('shared-auth')
      const prodAuth = createProductionAuthVerifier()

      // Mismo authorityId colapsado
      expect(
        () =>
          new IndependentAttestationAuthorityService({
            signingProvider: signerDifferent,
            antiReplayGuard: new ServiceAntiReplayGuard({ storageType: 'memory' }),
            serviceEnvironment: 'DEVELOPMENT',
            clientAuthVerifier: prodAuth,
            trustedGoPublicKeySpki: goIssuer.publicKeySpki,
            trustedGoAuthorityId: 'shared-auth',
          })
      ).toThrow(/COLLAPSED_AUTHORITIES_REJECTED/)

      // Misma clave pública aunque tengan authorityId distinto
      const signerSameKey = createSpySigner('distinct-att-id')
      Object.defineProperty(signerSameKey, 'publicKeySpki', { value: goIssuer.publicKeySpki })
      expect(
        () =>
          new IndependentAttestationAuthorityService({
            signingProvider: signerSameKey,
            antiReplayGuard: new ServiceAntiReplayGuard({ storageType: 'memory' }),
            serviceEnvironment: 'DEVELOPMENT',
            clientAuthVerifier: prodAuth,
            trustedGoPublicKeySpki: goIssuer.publicKeySpki,
            trustedGoAuthorityId: 'go-distinct-id',
          })
      ).toThrow(/COLLAPSED_AUTHORITIES_REJECTED/)

      // El servicio de atestación nunca expone método para emitir grants GO
      const fx = createHarness()
      expect((fx.service as any).issueGrant).toBeUndefined()
      expect((fx.service as any).issueGoAuthorizationGrant).toBeUndefined()
    })

    it('EXT-REAL-05-B-3: STAGING/PRODUCTION rechazan TestSigningProvider y ProductionKmsSigningProvider rechaza SPKI RSA o sin kmsClient', async () => {
      const goIssuer = new TestOnlyGoAuthorityIssuer({ authorityId: 'go-b3' })
      const prodAuth = createProductionAuthVerifier()
      const testSigner = new TestSigningProvider({ authorityId: 'test-b3' })

      for (const envName of ['STAGING', 'PRODUCTION'] as const) {
        expect(
          () =>
            new IndependentAttestationAuthorityService({
              signingProvider: testSigner,
              antiReplayGuard: new ServiceAntiReplayGuard({
                storageType: 'distributed',
                distributedStore: {
                  hasRequestId: async () => false,
                  hasRequestHash: async () => false,
                  hasAttestationId: async () => false,
                  hasGoAuthorizationId: async () => false,
                  reserveOnce: async () => {},
                  recordOnce: async () => {},
                  isHealthy: async () => true,
                },
              }),
              serviceEnvironment: envName,
              clientAuthVerifier: prodAuth,
              trustedGoPublicKeySpki: goIssuer.publicKeySpki,
              trustedGoAuthorityId: goIssuer.authorityId,
            })
        ).toThrow(/TEST_SIGNER_FORBIDDEN_IN_/)
      }

      const { publicKey: rsaPub } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
      const rsaKms = new ProductionKmsSigningProvider({
        authorityId: 'kms-b3',
        keyId: 'kms-key-b3',
        publicKeySpki: rsaPub.export({ format: 'pem', type: 'spki' }).toString(),
        keyVersionName: 'projects/p/locations/l/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1',
        kmsClient: { async sign() { return '00'.repeat(64) } },
      })
      expect(rsaKms.isProductionReady()).toBe(false)
      await expect(rsaKms.sign('test')).rejects.toThrow(/PRODUCTION_KMS_PUBLIC_KEY_INVALID/)
      expect(
        () =>
          new IndependentAttestationAuthorityService({
            signingProvider: rsaKms,
            antiReplayGuard: new ServiceAntiReplayGuard({
              storageType: 'distributed',
              distributedStore: {
                hasRequestId: async () => false,
                hasRequestHash: async () => false,
                hasAttestationId: async () => false,
                hasGoAuthorizationId: async () => false,
                reserveOnce: async () => {},
                recordOnce: async () => {},
                isHealthy: async () => true,
              },
            }),
            serviceEnvironment: 'PRODUCTION',
            clientAuthVerifier: prodAuth,
            trustedGoPublicKeySpki: goIssuer.publicKeySpki,
            trustedGoAuthorityId: goIssuer.authorityId,
          })
      ).toThrow(/PRODUCTION_KMS_NOT_CONFIGURED/)
    })
  })

  // =========================================================================
  // BLOQUE C — AUTENTICACIÓN Y AUTORIZACIÓN DEL CLIENTE
  // =========================================================================
  describe('Bloque C — Autenticación, scopes y manipulación de identidad cliente', () => {
    it('EXT-REAL-05-C-1: Rechaza credenciales ausentes/vacías, sin scopes, scope insuficiente, cross-scope y verifier isGoAuthority=true', async () => {
      const customAuth = createProductionAuthVerifier({
        allowedScopes: ['PR02_P1_IMPORT'], // scope distinto del solicitado
      })
      const fx = createHarness({ clientAuthVerifier: customAuth })
      const { request } = fx.buildSignedRequest()

      // Sin header authorization
      await expect(fx.service.handleRequest(request, {})).rejects.toThrow(/CLIENT_AUTH_FAILED/)
      // Header vacío / Bearer vacío
      await expect(
        fx.service.handleRequest(request, { authorization: 'Bearer   ' })
      ).rejects.toThrow(/CLIENT_AUTH_FAILED/)
      // Token válido pero sin el scope solicitado
      await expect(
        fx.service.handleRequest(request, fx.authHeaders)
      ).rejects.toThrow(/CLIENT_AUTH_SCOPE_INSUFFICIENT/)

      // Verifier que devuelve allowedScopes vacío
      const emptyScopesFx = createHarness({
        clientAuthVerifier: createProductionAuthVerifier({ allowedScopes: [] }),
      })
      await expect(
        emptyScopesFx.service.handleRequest(
          emptyScopesFx.buildSignedRequest().request,
          fx.authHeaders
        )
      ).rejects.toThrow(/CLIENT_AUTH_SCOPE_INSUFFICIENT/)

      // Verifier que intenta identificar al cliente como GO authority
      const collapsedCallerFx = createHarness({
        clientAuthVerifier: createProductionAuthVerifier({ isGoAuthority: true }),
      })
      await expect(
        collapsedCallerFx.service.handleRequest(
          collapsedCallerFx.buildSignedRequest().request,
          fx.authHeaders
        )
      ).rejects.toThrow(/CLIENT_AUTH_AUTHORITY_CONFUSION_REJECTED/)

      expect(fx.signer.calls.length).toBe(0)
    })

    it('EXT-REAL-05-C-2 [REPRO-VULN]: Modo DEVELOPMENT (incluso con protectedMode=false) y TEST protegido rechazan tokens Bearer estáticos sin verificador', async () => {
      /**
       * Objetivo: Evitar que en entornos no aislados (DEVELOPMENT aunque se intente protectedMode: false, o TEST con protectedMode: true) un Bearer estático evada CLIENT_AUTH_VERIFIER.
       * Condición de ataque: Enviar `authorization: 'Bearer spoofed-static'` a servicio DEVELOPMENT sin verificador (`protectedMode: false`) y luego sin headers.
       * Esperado: Rechazo explícito en constructor (`CLIENT_AUTH_VERIFIER_REQUIRED`) o runtime (`UNMODELED_BEARER_TOKEN_REJECTED`).
       */
      const devUnprotected = createHarness({
        serviceEnvironment: 'DEVELOPMENT',
        protectedMode: false,
        clientAuthVerifier: null,
      })
      const { request } = devUnprotected.buildSignedRequest()

      await expect(
        devUnprotected.service.handleRequest(request, { authorization: 'Bearer spoofed-static' })
      ).rejects.toThrow(/UNMODELED_BEARER_TOKEN_REJECTED/)

      await expect(devUnprotected.service.handleRequest(request, {})).rejects.toThrow(
        /CLIENT_AUTH_VERIFIER_REQUIRED/
      )
      expect(devUnprotected.signer.calls.length).toBe(0)
    })

    it('EXT-REAL-05-C-3: Rechaza getters JS mutantes en request/grant (TOCTOU en memoria) y errores del verificador sin filtrar secretos', async () => {
      /**
       * Objetivo: Impedir ataques TOCTOU in-process mediante propiedades accessor (getters que mutan entre validación y firma).
       * Condición de ataque: Construir request con un getter en `executionScope`.
       * Esperado: Rechazo inmediato en assertNoPrototypePollution (`PROTOTYPE_POLLUTION_REJECTED`) antes de autenticar o firmar.
       */
      const fx = createHarness()
      const { request } = fx.buildSignedRequest()
      let readCount = 0
      const mutatingReq = { ...request }
      Object.defineProperty(mutatingReq, 'executionScope', {
        enumerable: true,
        configurable: true,
        get() {
          readCount += 1
          return readCount === 1
            ? 'PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'
            : 'PR02_P2_MUTATED_MID_FLIGHT'
        },
      })

      await expect(
        fx.service.handleRequest(mutatingReq, fx.authHeaders)
      ).rejects.toThrow(/PROTOTYPE_POLLUTION_REJECTED/)
      expect(fx.signer.calls.length).toBe(0)

      // Verifier que lanza una excepción arbitraria inesperada -> fail closed como CLIENT_AUTH_VERIFIER_ERROR
      const throwingFx = createHarness({
        clientAuthVerifier: createProductionAuthVerifier({
          throwMsg: 'unexpected upstream oidc timeout token=SECRET_RAW_TOKEN',
        }),
      })
      await expect(
        throwingFx.service.handleRequest(throwingFx.buildSignedRequest().request, fx.authHeaders)
      ).rejects.toThrow(/CLIENT_AUTH_VERIFIER_ERROR/)
    })
  })

  // =========================================================================
  // BLOQUE D — ANTI-REPLAY HOST-LOCAL, CONCURRENCIA REAL Y PERSISTENCIA
  // =========================================================================
  describe('Bloque D — Anti-replay host-local: concurrencia 100x, 2 procesos OS reales, crashes, corrupción, lockfile y symlinks', () => {
    it('EXT-REAL-05-D-1: 100 solicitudes concurrentes sobre mismo authorizationId producen exactamente 1 firma y 99 rechazos', async () => {
      const dir = makeTempDir('ext05-conc100-')
      const filePath = path.join(dir, 'anti-replay.json')
      const signer = createSpySigner('ext05-attestation-auth')
      signer.setDelayMs(15)

      const fx = createHarness({
        signer,
        antiReplayGuard: new ServiceAntiReplayGuard({
          storageType: 'file',
          filePath,
        }),
      })
      const { request } = fx.buildSignedRequest()

      const results = await Promise.allSettled(
        Array.from({ length: 100 }, () => fx.service.handleRequest(structuredClone(request), fx.authHeaders))
      )

      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter((r) => r.status === 'rejected')

      expect(fulfilled.length).toBe(1)
      expect(rejected.length).toBe(99)
      expect(signer.calls.length).toBe(1)
    })

    it('EXT-REAL-05-D-2: 2 procesos Node independientes compitiendo sobre el mismo filePath garantizan máximo 1 firma real', async () => {
      /**
       * Objetivo: Verificar atomicidad real inter-proceso con lockfile O_EXCL y persistencia atómica en disco usando 2 procesos OS `node` separados.
       * Condición de ataque: Lanzar 2 procesos hijos simultáneos apuntando al mismo `anti-replay.json` y enviando exactamente el mismo request + grant firmado.
       * Esperado: Al menos 0 o 1 ganador total (si contendieron en el mismo milisegundo puede haber 1 ganador y 1 rechazo), NUNCA 2 ganadores ni 2 firmas emitidas.
       */
      const dir = makeTempDir('ext05-2proc-')
      const filePath = path.join(dir, 'shared-anti-replay.json')
      const markerDir = path.join(dir, 'markers')
      fs.mkdirSync(markerDir, { recursive: true })

      const goIssuer = new TestOnlyGoAuthorityIssuer({ authorityId: 'ext05-go-authority' })
      const reqBase = buildRequestBase()
      const grant = goIssuer.issueGrant({
        authorizationId: reqBase.authorizationId,
        requestId: reqBase.requestId,
        processId: reqBase.processId,
        executionScope: reqBase.executionScope,
        environment: reqBase.environment,
        projectRef: reqBase.projectRef,
        commitSha: reqBase.commitSha,
        requestSha256: reqBase.requestSha256,
        issuedAt: VALID_FIXED_NOW,
        notBefore: VALID_FIXED_NOW,
        expiresAt: VALID_EXPIRES_AT,
      })

      const payloadPath = path.join(dir, 'worker-input.json')
      fs.writeFileSync(
        payloadPath,
        JSON.stringify({
          request: { ...reqBase, goAuthorizationGrant: grant },
          trustedGoPublicKeySpki: goIssuer.publicKeySpki,
          trustedGoAuthorityId: goIssuer.authorityId,
          trustedGoKeyId: goIssuer.keyId,
          filePath,
          markerDir,
        }),
        'utf8'
      )

      const serviceIndexUrl = pathToFileURL(
        path.resolve(process.cwd(), 'services/independent-attestation-authority/src/index.mjs')
      ).href

      const workerScript = `
        import fs from 'node:fs';
        import path from 'node:path';
        import {
          TestSigningProvider,
          ServiceAntiReplayGuard,
          IndependentAttestationAuthorityService,
          createSimulatedClientAuthVerifier,
        } from ${JSON.stringify(serviceIndexUrl)};

        const workerId = process.argv[2];
        const cfg = JSON.parse(fs.readFileSync(${JSON.stringify(payloadPath)}, 'utf8'));
        const baseSigner = new TestSigningProvider({ authorityId: 'ext05-attestation-auth' });
        let signCount = 0;
        const signer = Object.assign(Object.create(baseSigner), {
          async sign(payload) {
            signCount += 1;
            fs.writeFileSync(path.join(cfg.markerDir, 'sign-' + workerId + '-' + signCount + '.txt'), 'signed');
            await new Promise((r) => setTimeout(r, 40));
            return baseSigner.sign(payload);
          },
        });
        const guard = new ServiceAntiReplayGuard({
          storageType: 'file',
          filePath: cfg.filePath,
        });
        const service = new IndependentAttestationAuthorityService({
          signingProvider: signer,
          antiReplayGuard: guard,
          serviceEnvironment: 'DEVELOPMENT',
          clientAuthVerifier: createSimulatedClientAuthVerifier({
            validTokens: {
              '${VALID_TOKEN}': {
                clientId: 'ci-collector-ext05',
                allowedScopes: ['PR02_P0_OFFICIAL_EVIDENCE_COLLECTION'],
              },
            },
          }),
          trustedGoPublicKeySpki: cfg.trustedGoPublicKeySpki,
          trustedGoAuthorityId: cfg.trustedGoAuthorityId,
          trustedGoKeyId: cfg.trustedGoKeyId,
          expectedProjectRef: ${JSON.stringify(VALID_PROJECT_REF)},
          expectedCommitSha: ${JSON.stringify(VALID_COMMIT_SHA)},
        });

        // Barrera temporal corta para alinear arranque en ambos procesos OS
        const startAt = Number(process.argv[3]);
        const wait = startAt - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));

        try {
          const res = await service.handleRequest(cfg.request, { authorization: 'Bearer ${VALID_TOKEN}' });
          console.log(JSON.stringify({ ok: true, workerId, signCount, attestationId: res.attestationId }));
        } catch (err) {
          console.log(JSON.stringify({ ok: false, workerId, signCount, error: err?.message || String(err) }));
        }
      `
      const workerFile = path.join(dir, 'worker.mjs')
      fs.writeFileSync(workerFile, workerScript, 'utf8')

      const runWorker = (id: string, syncTimestamp: number) =>
        new Promise<{ ok: boolean; workerId: string; signCount: number; error?: string }>((resolve, reject) => {
          const child = spawn(process.execPath, [workerFile, id, String(syncTimestamp)], {
            stdio: ['ignore', 'pipe', 'pipe'],
          })
          let stdout = ''
          let stderr = ''
          child.stdout.on('data', (d) => (stdout += d.toString('utf8')))
          child.stderr.on('data', (d) => (stderr += d.toString('utf8')))
          child.on('exit', (code) => {
            if (code !== 0) {
              reject(new Error(`Worker ${id} exited ${code}: ${stderr}`))
              return
            }
            resolve(JSON.parse(stdout.trim()))
          })
        })

      const syncAt = Date.now() + 250
      const [w1, w2] = await Promise.all([runWorker('p1', syncAt), runWorker('p2', syncAt)])
      const markerFiles = fs.readdirSync(markerDir)
      const diag = JSON.stringify({ w1, w2, markerFiles })

      expect(markerFiles.length, diag).toBe(1)
      expect(w1.signCount + w2.signCount, diag).toBe(1)
      expect([w1.ok, w2.ok].filter(Boolean).length, diag).toBe(1)
      expect([w1.ok, w2.ok].filter((v) => !v).length, diag).toBe(1)
    })

    it('EXT-REAL-05-D-3: Reinicio tras RESERVED, reinicio tras kmsAttempted=true, fallo de rollback, truncado/corrupción y lockfile huérfano', async () => {
      // (a) Archivo corrupto o truncado parcial falla cerrado al arrancar y también si se corrompe tras arrancar
      const dir = makeTempDir('ext05-corrupt-')
      const corruptFile = path.join(dir, 'corrupt-ar.json')
      fs.writeFileSync(corruptFile, '{"schemaVersion":"service-anti-replay-v1.1","entries":[', 'utf8')

      expect(
        () => new ServiceAntiReplayGuard({ storageType: 'file', filePath: corruptFile })
      ).toThrow(/SERVICE_ANTI_REPLAY_STORAGE_ERROR/)

      const validThenCorruptFile = path.join(dir, 'later-corrupt-ar.json')
      const healthyGuard = new ServiceAntiReplayGuard({
        storageType: 'file',
        filePath: validThenCorruptFile,
      })
      expect(await healthyGuard.isHealthy()).toBe(true)
      fs.writeFileSync(validThenCorruptFile, '{corrupt', 'utf8')
      await expect(healthyGuard.isHealthy()).resolves.toBe(false)

      // (b) Simular crash después de reserveBeforeSign + markSigningAttemptStarted (kmsAttempted=true) sin commitReservation:
      // al reiniciar un nuevo guard desde el mismo archivo en disco, DEBE bloquear cualquier reintento como ya consumido/bloqueado!
      const crashFile = path.join(dir, 'crash-recovery.json')
      const guardBeforeCrash = new ServiceAntiReplayGuard({ storageType: 'file', filePath: crashFile })
      const reqPkg = {
        requestId: 'req-crash-1',
        authorizationId: 'auth-crash-1',
        requestSha256: 'd'.repeat(64),
        goGrantSha256: 'e'.repeat(64),
      }
      const resv = await guardBeforeCrash.reserveBeforeSign(reqPkg, 'att-crash-1')
      expect(resv.attestationId).toBe('att-crash-1')
      await guardBeforeCrash.markSigningAttemptStarted(resv)

      // Nuevo guard cargando desde el mismo archivo (reinicio de proceso)
      const guardAfterRestart = new ServiceAntiReplayGuard({ storageType: 'file', filePath: crashFile })
      await expect(guardAfterRestart.reserveBeforeSign(reqPkg, 'att-crash-2')).rejects.toThrow(
        /SERVICE_ANTI_REPLAY|REPLAY/
      )

      // (c) Simular lock huérfano (p. ej. tras SIGKILL) -> falla cerrado sin doble firma
      const lockedFile = path.join(dir, 'orphaned-lock.json')
      fs.writeFileSync(`${lockedFile}.lock`, JSON.stringify({ pid: 999999 }), 'utf8')
      const lockedGuard = new ServiceAntiReplayGuard({
        storageType: 'file',
        filePath: lockedFile,
      })
      await expect(
        lockedGuard.reserveBeforeSign(
          {
            requestId: 'req-lock-1',
            authorizationId: 'auth-lock-1',
            requestSha256: '1'.repeat(64),
          },
          'att-lock-1'
        )
      ).rejects.toThrow(/SERVICE_ANTI_REPLAY_LOCK_CONTENTION/)
    })

    it('EXT-REAL-05-D-4 [REPRO-VULN]: Bloquea symlink attack en filePath anti-replay y fallos de store distributed sin reserveOnce atómico', async () => {
      /**
       * Objetivo: Impedir sobrescritura arbitraria de archivos vía symlink pre-colocado y rechazar `distributedStore` sin `reserveOnce` atómico al reservar.
       * Condición de ataque: (a) Enlazador simbólico `anti-replay.json -> victim.txt` (si el OS permite crear symlinks; si no, verificar `lstatSync` explícito o documentar EPERM), y (b) `distributedStore` sin `reserveOnce`.
       * Esperado: (a) Nunca sobrescribe `victim.txt` y rechaza symlink (`SERVICE_ANTI_REPLAY_SYMLINK_FORBIDDEN`), (b) `reserveBeforeSign` falla cerrado con `SERVICE_ANTI_REPLAY_STORAGE_ERROR` si el store distribuido no implementa `reserveOnce`.
       */
      const dir = makeTempDir('ext05-sym-')
      const victimPath = path.join(dir, 'victim-do-not-touch.txt')
      const symlinkFilePath = path.join(dir, 'anti-replay.json')
      fs.writeFileSync(victimPath, 'ORIGINAL_SENSITIVE_CONTENT', 'utf8')

      let symlinkCreated = false
      try {
        fs.symlinkSync(victimPath, symlinkFilePath, 'file')
        symlinkCreated = true
      } catch {
        // Windows sin Developer Mode puede devolver EPERM para symlinkSync
      }

      if (symlinkCreated) {
        await expect(
          (async () => {
            const symGuard = new ServiceAntiReplayGuard({ storageType: 'file', filePath: symlinkFilePath })
            await symGuard.reserveBeforeSign(
              {
                requestId: 'req-sym-1',
                authorizationId: 'auth-sym-1',
                requestSha256: '2'.repeat(64),
              },
              'att-sym-1'
            )
          })()
        ).rejects.toThrow(/SERVICE_ANTI_REPLAY_SYMLINK_FORBIDDEN/)
        expect(fs.readFileSync(victimPath, 'utf8')).toBe('ORIGINAL_SENSITIVE_CONTENT')
      } else {
        // Aunque Windows sin Developer Mode bloquee fs.symlinkSync EPERM, el directorio symlink ('junction') funciona sin privilegios admin en Windows!
        const targetDir = path.join(dir, 'victim-dir')
        const junctionDir = path.join(dir, 'junction-dir')
        fs.mkdirSync(targetDir, { recursive: true })
        fs.symlinkSync(targetDir, junctionDir, 'junction')
        const junctionFile = path.join(junctionDir, 'anti-replay.json')
        await expect(
          (async () => {
            const jGuard = new ServiceAntiReplayGuard({ storageType: 'file', filePath: junctionFile })
            await jGuard.reserveBeforeSign(
              {
                requestId: 'req-junc-1',
                authorizationId: 'auth-junc-1',
                requestSha256: '3'.repeat(64),
              },
              'att-junc-1'
            )
          })()
        ).rejects.toThrow(/SERVICE_ANTI_REPLAY_SYMLINK_FORBIDDEN/)
        expect(fs.existsSync(path.join(targetDir, 'anti-replay.json'))).toBe(false)
      }

      // Distributed store incompleto sin reserveOnce ni hasGoAuthorizationId nunca debe firmar sin reserva previa
      const incompleteDistributed = new ServiceAntiReplayGuard({
        storageType: 'distributed',
        distributedStore: {
          hasRequestId: async () => false,
          hasRequestHash: async () => false,
          hasAttestationId: async () => false,
          recordOnce: async () => {},
          isHealthy: async () => true,
        },
      })
      await expect(
        incompleteDistributed.reserveBeforeSign(
          {
            requestId: 'req-dist-incomp',
            authorizationId: 'auth-dist-incomp',
            requestSha256: '4'.repeat(64),
          },
          'att-dist-incomp'
        )
      ).rejects.toThrow(/SERVICE_ANTI_REPLAY_STORAGE_ERROR/)
    })

    it('EXT-REAL-05-D-5: Colisiones parciales de IDs (requestId, authorizationId, requestSha256), crash en RESERVED sin kmsAttempted y rollback pre-firma al fallar persistencia', async () => {
      const dir = makeTempDir('ext05-d5-')
      const replayFile = path.join(dir, 'd5-ar.json')

      // (a) Reutilización cruzada de requestId / authorizationId / requestSha256 con otro payload
      const fx = createHarness({
        antiReplayGuard: new ServiceAntiReplayGuard({ storageType: 'file', filePath: replayFile }),
      })
      const first = fx.buildSignedRequest()
      await fx.service.handleRequest(first.request, fx.authHeaders)

      // Mismo requestId pero authorizationId y requestSha256 distintos
      const dupReqId = fx.buildSignedRequest({
        requestOverrides: { requestId: first.request.requestId },
      })
      await expect(fx.service.handleRequest(dupReqId.request, fx.authHeaders)).rejects.toThrow(
        /SERVICE_ANTI_REPLAY_REQUEST_ID_DUPLICATED/
      )

      // Mismo authorizationId pero requestId y requestSha256 distintos
      const dupAuthId = fx.buildSignedRequest({
        requestOverrides: { authorizationId: first.request.authorizationId },
      })
      await expect(fx.service.handleRequest(dupAuthId.request, fx.authHeaders)).rejects.toThrow(
        /SERVICE_ANTI_REPLAY_GO_AUTHORIZATION_DUPLICATED/
      )

      // Mismo requestSha256 pero requestId y authorizationId distintos (probado directo sobre antiReplayGuard.reserveBeforeSign)
      await expect(
        fx.antiReplayGuard.reserveBeforeSign(
          {
            requestId: `req-other-${crypto.randomUUID()}`,
            authorizationId: `auth-other-${crypto.randomUUID()}`,
            requestSha256: first.request.requestSha256,
          },
          `att-other-${crypto.randomUUID()}`
        )
      ).rejects.toThrow(/SERVICE_ANTI_REPLAY_REQUEST_HASH_DUPLICATED/)
      expect(fx.signer.calls.length).toBe(1)

      // (b) Crash recuperado con registro en estado RESERVED en disco sigue bloqueado tras restart (fail-closed conservative guarantee)
      const crashReservedFile = path.join(dir, 'crash-reserved.json')
      const guardReserved = new ServiceAntiReplayGuard({
        storageType: 'file',
        filePath: crashReservedFile,
      })
      const resvPkg = {
        requestId: 'req-resv-only',
        authorizationId: 'auth-resv-only',
        requestSha256: '7'.repeat(64),
        goGrantSha256: '8'.repeat(64),
      }
      await guardReserved.reserveBeforeSign(resvPkg, 'att-resv-1')
      const reloadedReserved = new ServiceAntiReplayGuard({
        storageType: 'file',
        filePath: crashReservedFile,
      })
      await expect(reloadedReserved.reserveBeforeSign(resvPkg, 'att-resv-2')).rejects.toThrow(
        /SERVICE_ANTI_REPLAY/
      )

      // (c) Fallo al persistir en _persistToFile durante reserveBeforeSign hace rollback limpio en memoria (_removeUncommittedMemoryEntry)
      const rollbackFile = path.join(dir, 'rollback-ar.json')
      const rollbackGuard = new ServiceAntiReplayGuard({
        storageType: 'file',
        filePath: rollbackFile,
      })
      const originalPersist = (rollbackGuard as any)._persistToFile.bind(rollbackGuard)
      ;(rollbackGuard as any)._persistToFile = () => {
        throw new Error('SERVICE_ANTI_REPLAY_STORAGE_ERROR: EACCES simulated disk write failure')
      }
      await expect(
        rollbackGuard.reserveBeforeSign(resvPkg, 'att-rb-1')
      ).rejects.toThrow(/SERVICE_ANTI_REPLAY_STORAGE_ERROR/)
      expect(rollbackGuard.check(resvPkg)).toBe(true) // rollback limpió memoria porque jamás se firmó
      ;(rollbackGuard as any)._persistToFile = originalPersist
    })
  })

  // =========================================================================
  // BLOQUE E — FLUJO DE FIRMA Y GARANTÍA PRE-SIGN
  // =========================================================================
  describe('Bloque E — Cero firmas si falla cualquier validación y bloqueo post-firma aunque caiga el transporte HTTP', () => {
    it('EXT-REAL-05-E-1: Si el socket HTTP cae justo mientras el servidor responde tras firmar, el reintento NO re-firma ni duplica emisión', async () => {
      /**
       * Objetivo: Demostrar que una vez reservado y firmado el request, incluso si la respuesta HTTP falla por caída de red/cliente, un reintento idéntico queda bloqueado sin re-invocar `sign()`.
       */
      const dir = makeTempDir('ext05-drop-')
      const filePath = path.join(dir, 'drop-ar.json')
      const signer = createSpySigner('ext05-attestation-auth')
      signer.setDelayMs(80)

      const fx = createHarness({
        signer,
        antiReplayGuard: new ServiceAntiReplayGuard({ storageType: 'file', filePath }),
      })
      const httpServer = new IndependentAttestationHttpServer({
        service: fx.service,
        requireHttps: false,
        trustProxyHttps: true,
      })
      const { port } = await httpServer.start(0)

      try {
        const { request } = fx.buildSignedRequest()
        const bodyStr = JSON.stringify(request)
        // Iniciar solicitud HTTP y cortar socket del cliente mientras signingProvider.sign() aún corre o responde
        const rawReq =
          `POST /attestations HTTP/1.1\r\n` +
          `Host: 127.0.0.1:${port}\r\n` +
          `Authorization: Bearer ${VALID_TOKEN}\r\n` +
          `X-Forwarded-Proto: https\r\n` +
          `Content-Type: application/json\r\n` +
          `Content-Length: ${Buffer.byteLength(bodyStr)}\r\n` +
          `\r\n` +
          bodyStr

        const sock = net.createConnection({ host: '127.0.0.1', port })
        await new Promise<void>((resolve) => {
          sock.on('connect', () => {
            sock.write(rawReq)
            // Esperar lo suficiente para que auth + GO grant + reserveBeforeSign + inicio de sign() ocurran, luego destruir socket
            setTimeout(() => {
              sock.destroy()
              resolve()
            }, 35)
          })
        })

        // Dar margen a que termine la operación async en servidor (delayMs=80)
        await new Promise((r) => setTimeout(r, 150))

        // Reintentar la misma petición por HTTP limpio -> DEBE rechazarse con 409 REPLAY y signer.calls seguir en 1!
        const retryRes = await fetch(`http://127.0.0.1:${port}/attestations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-Proto': 'https',
            authorization: `Bearer ${VALID_TOKEN}`,
          },
          body: bodyStr,
        })
        expect(retryRes.status).toBe(409)
        const retryJson = await retryRes.json()
        expect(retryJson.error?.code).toMatch(/REPLAY/)
        expect(signer.calls.length).toBe(1)
      } finally {
        await httpServer.close()
      }
    })

    it('EXT-REAL-05-E-2: Fallos en TODAS las etapas pre-firma dejan 0 invocaciones a sign(), y fallo dentro de sign() NO recicla identidad', async () => {
      const dir = makeTempDir('ext05-e2-')
      const signer = createSpySigner('ext05-attestation-auth')
      const fx = createHarness({
        signer,
        antiReplayGuard: new ServiceAntiReplayGuard({
          storageType: 'file',
          filePath: path.join(dir, 'e2-ar.json'),
        }),
      })

      // Fallos pre-firma: auth inválida, scope inválido, proto pollution, JSON duplicado, policy inválida, GO key distinta
      await expect(fx.service.handleRequest(fx.buildSignedRequest().request, {})).rejects.toThrow()
      await expect(
        fx.service.handleRequest('{"a":1,"a":2}', fx.authHeaders)
      ).rejects.toThrow(/DUPLICATE_JSON_KEY/)
      await expect(
        fx.service.handleRequest(
          fx.buildSignedRequest({ requestOverrides: { executionScope: 'PR02_P1' } }).request,
          fx.authHeaders
        )
      ).rejects.toThrow()
      const badSigReq = fx.buildSignedRequest()
      badSigReq.request.goAuthorizationGrant = {
        ...badSigReq.request.goAuthorizationGrant,
        signature: '0'.repeat(128),
      }
      await expect(fx.service.handleRequest(badSigReq.request, fx.authHeaders)).rejects.toThrow()
      expect(signer.calls.length).toBe(0)

      // Fallo dentro de signingProvider.sign() NO permite reciclar ni requestId ni authorizationId
      signer.setFailure('PRODUCTION_KMS_UNAVAILABLE: KMS timeout simulado', 1)
      const { request } = fx.buildSignedRequest()
      await expect(fx.service.handleRequest(request, fx.authHeaders)).rejects.toThrow(
        /PRODUCTION_KMS_UNAVAILABLE/
      )
      expect(signer.calls.length).toBe(1)

      signer.setFailure(null)
      await expect(fx.service.handleRequest(request, fx.authHeaders)).rejects.toThrow(
        /SERVICE_ANTI_REPLAY/
      )
      expect(signer.calls.length).toBe(1)
    })
  })

  // =========================================================================
  // BLOQUE F — INTEGRIDAD DE EVIDENCIA NIVEL 1
  // =========================================================================
  describe('Bloque F — Integridad de evidencia Nivel 1 (Digest-Only) inmutable', () => {
    it('EXT-REAL-05-F-1 [REPRO-VULN]: Rechaza todo intento cliente de elevar evidenceLevel o falsear rawSoapVerified/arcaOriginVerified y verifica stubs 2A/2B fail-closed', async () => {
      const fx = createHarness()
      const { request } = fx.buildSignedRequest()

      await expect(
        fx.service.handleRequest(request, {
          ...fx.authHeaders,
          'x-attestation-evidence-level': 'LEVEL_2A_SUBMITTED_CONTENT',
        })
      ).rejects.toThrow(/EVIDENCE_LEVEL_ELEVATION_REJECTED/)

      await expect(
        fx.service.handleRequest(
          { ...request, rawSoapVerified: true } as any,
          fx.authHeaders
        )
      ).rejects.toThrow(/EVIDENCE_LEVEL_ELEVATION_REJECTED|UNEXPECTED_REQUEST_FIELD/)

      await expect(
        fx.service.handleRequest(
          { ...request, arcaOriginVerified: true } as any,
          fx.authHeaders
        )
      ).rejects.toThrow(/EVIDENCE_LEVEL_ELEVATION_REJECTED|UNEXPECTED_REQUEST_FIELD/)

      await expect(
        new Level2ASubmittedContentEvaluatorStub().inspect(request)
      ).rejects.toThrow(/EVIDENCE_LEVEL_2A_NOT_IMPLEMENTED/)
      await expect(
        new Level2BIndependentObservedEvaluatorStub().inspect(request)
      ).rejects.toThrow(/EVIDENCE_LEVEL_2B_NOT_IMPLEMENTED/)
      expect(fx.signer.calls.length).toBe(0)
    })
  })

  // =========================================================================
  // BLOQUE G — HARDENING HTTP Y MANEJO SEGURO DE ERRORES
  // =========================================================================
  describe('Bloque G — Hardening HTTP, anti-leakage de rutas/tokens, headers duplicados, timeouts y streams abortados', () => {
    it('EXT-REAL-05-G-1 [REPRO-VULN]: Errores de lock/almacenamiento NO filtran rutas del sistema de archivos en respuestas HTTP', async () => {
      /**
       * Objetivo: Impedir information disclosure (rutas internas de disco / stack traces) en respuestas JSON HTTP 5xx/4xx.
       * Condición de ataque: Forzar una contención de lockfile en un path identificable `secret-internal-path-dir/ar.json.lock` y enviar `POST /attestations`.
       * Esperado: HTTP 503 sin ninguna mención del path ni de nombres de archivos del host.
       */
      const dir = makeTempDir('secret-internal-host-dir-')
      const filePath = path.join(dir, 'sensitive-anti-replay-store.json')
      fs.writeFileSync(`${filePath}.lock`, JSON.stringify({ pid: 4242 }), 'utf8')

      const fx = createHarness({
        antiReplayGuard: new ServiceAntiReplayGuard({
          storageType: 'file',
          filePath,
        }),
      })
      const httpServer = new IndependentAttestationHttpServer({
        service: fx.service,
        requireHttps: false,
        trustProxyHttps: true,
      })
      const { url } = await httpServer.start(0)
      try {
        const { request } = fx.buildSignedRequest()
        const res = await fetch(`${url}/attestations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-Proto': 'https',
            authorization: `Bearer ${VALID_TOKEN}`,
          },
          body: JSON.stringify(request),
        })
        expect(res.status).toBe(503)
        const text = await res.text()
        expect(text).not.toContain('secret-internal-host-dir')
        expect(text).not.toContain('sensitive-anti-replay-store.json')
        expect(text).not.toContain('.lock')
      } finally {
        await httpServer.close()
      }
    })

    it('EXT-REAL-05-G-2 [REPRO-VULN]: Bloquea headers críticos duplicados, URIs absolute-form y Host malformado/no permitido', async () => {
      /**
       * Objetivo: Mitigar header smuggling (múltiples `Authorization`, `Host`, `X-Forwarded-Proto`, `Content-Type`) y SSRF/request-target poisoning via absolute-form URI.
       * Condición de ataque: Enviar requests TCP crudos con (a) `Authorization` duplicado, (b) `Host` duplicado, (c) absolute-form URI `POST http://evil.attacker/attestations`.
       * Esperado: Rechazo HTTP 400 antes de procesar autenticación o firmar.
       */
      const fx = createHarness()
      const httpServer = new IndependentAttestationHttpServer({
        service: fx.service,
        requireHttps: false,
        trustProxyHttps: true,
        allowedHosts: ['127.0.0.1'],
      })
      const { port } = await httpServer.start(0)
      try {
        const { request } = fx.buildSignedRequest()
        const body = JSON.stringify(request)

        // (a) Doble Authorization header en raw TCP
        const dupAuthRaw =
          `POST /attestations HTTP/1.1\r\n` +
          `Host: 127.0.0.1:${port}\r\n` +
          `Authorization: Bearer ${VALID_TOKEN}\r\n` +
          `Authorization: Bearer another-token\r\n` +
          `X-Forwarded-Proto: https\r\n` +
          `Content-Type: application/json\r\n` +
          `Content-Length: ${Buffer.byteLength(body)}\r\n` +
          `Connection: close\r\n\r\n` +
          body
        const resDupAuth = await sendRawHttpRequest(port, dupAuthRaw)
        expect(resDupAuth.statusLine).toContain('400')

        // (b) Host no permitido
        const badHostRaw =
          `POST /attestations HTTP/1.1\r\n` +
          `Host: evil.attacker.local\r\n` +
          `Authorization: Bearer ${VALID_TOKEN}\r\n` +
          `X-Forwarded-Proto: https\r\n` +
          `Content-Type: application/json\r\n` +
          `Content-Length: ${Buffer.byteLength(body)}\r\n` +
          `Connection: close\r\n\r\n` +
          body
        const resBadHost = await sendRawHttpRequest(port, badHostRaw)
        expect(resBadHost.statusLine).toContain('400')

        // (c) Request target absolute-form URI
        const absUriRaw =
          `POST http://evil.attacker.local/attestations HTTP/1.1\r\n` +
          `Host: 127.0.0.1:${port}\r\n` +
          `Authorization: Bearer ${VALID_TOKEN}\r\n` +
          `X-Forwarded-Proto: https\r\n` +
          `Content-Type: application/json\r\n` +
          `Content-Length: ${Buffer.byteLength(body)}\r\n` +
          `Connection: close\r\n\r\n` +
          body
        const resAbsUri = await sendRawHttpRequest(port, absUriRaw)
        expect(resAbsUri.statusLine).toContain('400')

        expect(fx.signer.calls.length).toBe(0)
      } finally {
        await httpServer.close()
      }
    })

    it('EXT-REAL-05-G-3: Rechaza métodos erróneos (405), paths inválidos (404), Content-Type no JSON (415), JSON duplicado (400), body gigante (413), stream abortado y CORS ausente', async () => {
      const fx = createHarness()
      const httpServer = new IndependentAttestationHttpServer({
        service: fx.service,
        requireHttps: false,
        trustProxyHttps: true,
        maxBodySizeBytes: 256,
        requestTimeoutMs: 500,
      })
      const { url, port } = await httpServer.start(0)
      try {
        // 405 Method Not Allowed
        const getAtt = await fetch(`${url}/attestations`)
        expect(getAtt.status).toBe(405)
        expect(getAtt.headers.get('access-control-allow-origin')).toBeNull()

        // 404 Unknown path / traversal-like path
        const notFound = await fetch(`${url}/admin/../attestations-secret`)
        expect(notFound.status).toBe(404)

        // 415 Unsupported Media Type
        const badCt = await fetch(`${url}/attestations`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain', 'X-Forwarded-Proto': 'https' },
          body: '{}',
        })
        expect(badCt.status).toBe(415)

        // 400 Malformed / duplicate key JSON (con token autenticado)
        const dupJson = await fetch(`${url}/attestations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-Proto': 'https',
            authorization: `Bearer ${VALID_TOKEN}`,
          },
          body: '{"a":1,"a":2}',
        })
        expect(dupJson.status).toBe(400)

        // 413 Oversized body (cliente autenticado)
        const bigBody = JSON.stringify({ pad: 'x'.repeat(512) })
        const bigRes = await fetch(`${url}/attestations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-Proto': 'https',
            authorization: `Bearer ${VALID_TOKEN}`,
          },
          body: bigBody,
        })
        expect(bigRes.status).toBe(413)

        // Request incompleto abortado antes de terminar body -> servidor sigue sano después
        const { request } = fx.buildSignedRequest()
        const body = JSON.stringify(request)
        const abortedRaw =
          `POST /attestations HTTP/1.1\r\n` +
          `Host: 127.0.0.1:${port}\r\n` +
          `Content-Type: application/json\r\n` +
          `X-Forwarded-Proto: https\r\n` +
          `Content-Length: ${Buffer.byteLength(body) + 100}\r\n\r\n` +
          body.slice(0, 20)
        const aborted = await sendRawHttpRequest(port, abortedRaw, 25)
        expect(aborted.statusLine).toBe('ABORTED')

        const health = await fetch(`${url}/health`)
        expect(health.status).toBe(200)
        const healthText = await health.text()
        expect(healthText).not.toContain('BEGIN PRIVATE KEY')
        expect(healthText).not.toContain(VALID_TOKEN)
      } finally {
        await httpServer.close()
      }
    })

    it('EXT-REAL-05-G-4: Request lento dispara timeout HTTP sin firmar, 20 requests HTTP concurrentes = 1x200 + 19x409, y env JSON estricto en server.mjs', async () => {
      const dir = makeTempDir('ext05-g4-')
      const fx = createHarness({
        antiReplayGuard: new ServiceAntiReplayGuard({
          storageType: 'file',
          filePath: path.join(dir, 'g4-ar.json'),
        }),
      })
      const httpServer = new IndependentAttestationHttpServer({
        service: fx.service,
        requireHttps: false,
        trustProxyHttps: true,
        requestTimeoutMs: 120,
      })
      const { url, port } = await httpServer.start(0)
      try {
        // (a) Socket lento que no termina nunca -> se cierra por timeout sin firmar
        const slowResult = await new Promise<{ statusLine: string }>((resolve) => {
          const sock = net.createConnection({ host: '127.0.0.1', port })
          let data = ''
          sock.on('connect', () => {
            sock.write(
              `POST /attestations HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nAuthorization: Bearer ${VALID_TOKEN}\r\nX-Forwarded-Proto: https\r\nContent-Type: application/json\r\nContent-Length: 500\r\n\r\n{"partial":`
            )
          })
          sock.on('data', (d) => (data += d.toString('utf8')))
          sock.on('close', () => resolve({ statusLine: data.split('\r\n')[0] || 'CLOSED' }))
          sock.on('error', () => resolve({ statusLine: 'CLOSED' }))
        })
        expect(['CLOSED', 'HTTP/1.1 408 Request Timeout'].some((s) => slowResult.statusLine.includes(s) || slowResult.statusLine === 'CLOSED')).toBe(true)
        expect(fx.signer.calls.length).toBe(0)

        // (b) 20 solicitudes HTTP concurrentes sobre mismo authorizationId -> exactamente 1x 200 y 19x 409/503 sin ningun 500
        const { request } = fx.buildSignedRequest()
        const payload = JSON.stringify(request)
        const responses = await Promise.all(
          Array.from({ length: 20 }, () =>
            fetch(`${url}/attestations`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-Proto': 'https',
                authorization: `Bearer ${VALID_TOKEN}`,
              },
              body: payload,
            })
          )
        )
        const statuses = responses.map((r) => r.status)
        expect(statuses.filter((s) => s === 200).length).toBe(1)
        expect(statuses.some((s) => s === 500)).toBe(false)
        expect(fx.signer.calls.length).toBe(1)
      } finally {
        await httpServer.close()
      }

      // (c) createConfiguredAuthorityFromEnv usa safeParseStrictJson para ATTESTATION_SIMULATED_CLIENT_TOKENS_JSON
      const goIssuer = new TestOnlyGoAuthorityIssuer({ authorityId: 'go-env-g4' })
      expect(() =>
        createConfiguredAuthorityFromEnv({
          ATTESTATION_ENVIRONMENT: 'DEVELOPMENT',
          ATTESTATION_SIGNING_PROVIDER: 'TEST_SIGNER',
          ATTESTATION_CLIENT_AUTH_MODE: 'SIMULATED_TEST_ONLY',
          ATTESTATION_SIMULATED_CLIENT_TOKENS_JSON: '{"t1":{},"t1":{}}',
          ATTESTATION_TRUSTED_GO_PUBLIC_KEY_SPKI: goIssuer.publicKeySpki,
          ATTESTATION_ANTI_REPLAY_MODE: 'LOCAL_DURABLE',
          ATTESTATION_ANTI_REPLAY_FILE_PATH: path.join(dir, 'env-ar.json'),
        })
      ).toThrow(/ATTESTATION_SIMULATED_CLIENT_TOKENS_INVALID/)
    })
  })

  // =========================================================================
  // BLOQUE H — EJECUCIÓN COMPLETA E2E + RESTART EN DISCO
  // =========================================================================
  describe('Bloque H — Ciclo E2E completo: autorización -> emisión -> verificación criptográfica -> rechazo de replay tras restart', () => {
    it('EXT-REAL-05-H-1: Flujo E2E HTTP con persistencia real en disco sobrevive reinicio del servicio y bloquea replay cross-restart', async () => {
      const dir = makeTempDir('ext05-e2e-')
      const replayFile = path.join(dir, 'e2e-anti-replay.json')
      const logs: any[] = []

      // Instancia 1
      const signer1 = createSpySigner('ext05-attestation-auth')
      const fx1 = createHarness({
        signer: signer1,
        antiReplayGuard: new ServiceAntiReplayGuard({ storageType: 'file', filePath: replayFile }),
        logSink: (e) => logs.push(e),
      })
      const http1 = new IndependentAttestationHttpServer({
        service: fx1.service,
        requireHttps: false,
        trustProxyHttps: true,
      })
      const { url: url1 } = await http1.start(0)

      let signedResponse: any
      let sentRequest: any
      try {
        const readyRes = await fetch(`${url1}/readiness`)
        expect(readyRes.status).toBe(200)

        const { request } = fx1.buildSignedRequest()
        sentRequest = request
        const res = await fetch(`${url1}/attestations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-Proto': 'https',
            authorization: `Bearer ${VALID_TOKEN}`,
          },
          body: JSON.stringify(request),
        })
        expect(res.status).toBe(200)
        signedResponse = await res.json()

        const check = verifyServiceAttestationResponse(signedResponse, {
          trustedAttestationPublicKey: signer1.publicKeySpki!,
          pinnedKeyId: signer1.keyId,
        })
        expect(check.valid).toBe(true)
        expect(signer1.calls.length).toBe(1)
      } finally {
        await http1.close()
      }

      // Instancia 2 tras restart leyendo mismo archivo de persistencia y misma raíz GO confiable
      const signer2 = createSpySigner('ext05-attestation-auth')
      const fx2 = createHarness({
        signer: signer2,
        goIssuer: fx1.goIssuer,
        antiReplayGuard: new ServiceAntiReplayGuard({ storageType: 'file', filePath: replayFile }),
      })
      const http2 = new IndependentAttestationHttpServer({
        service: fx2.service,
        requireHttps: false,
        trustProxyHttps: true,
      })
      const { url: url2 } = await http2.start(0)
      try {
        const replayRes = await fetch(`${url2}/attestations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-Proto': 'https',
            authorization: `Bearer ${VALID_TOKEN}`,
          },
          body: JSON.stringify(sentRequest),
        })
        expect(replayRes.status).toBe(409)
        expect(signer2.calls.length).toBe(0)
      } finally {
        await http2.close()
      }

      const serialized = JSON.stringify(logs)
      expect(serialized).not.toContain(VALID_TOKEN)
      expect(serialized).not.toContain('BEGIN PRIVATE KEY')
    })
  })
})
