import crypto, { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  PR02_P0_SCOPE,
  PR02_PARAMETERS_TARGET_PROJECT_REF,
  PR02_P0_COLECTOR_IDENTIDAD,
  ANTI_REPLAY_GUARANTEE_LEVEL,
  ATTESTATION_SIGNER_ORIGINS,
  ATTESTATION_AUTHORITY_TYPES,
  ATTESTATION_TRUST_MODELS,
  computePublicKeyId,
  serializeCanonicalAttestationResponsePayload,
  computeAttestationResponsePayloadDigest,
  createExternalAuthoritySigner,
  createExternalAttestationAuthorityService,
  type AttestationRequestPackage,
  type AttestationResponse,
  type AttestationAuthorityType,
  type AttestationAllowedAlgorithm,
  type AttestationSignerOrigin,
  type AttestationRequestArtifact,
} from '../../../scripts/fiscal/plan-pr02-parameters.mjs'

export interface KeyPairPem {
  publicKey: string
  privateKey: string
}

/**
 * Genera un par de claves Ed25519 efímero para pruebas de autoridad GO.
 */
export function generateEphemeralGoAuthorityKeyPair(): KeyPairPem {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }
}

/**
 * Genera un par de claves Ed25519 efímero para pruebas de autoridad de atestación independiente.
 */
export function generateEphemeralAttestationKeyPair(): KeyPairPem {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }
}

/**
 * Firma datos en UTF-8 utilizando Ed25519 nativo de Node.js.
 * Retorna firma de 64 bytes en formato hexadecimal (128 caracteres).
 */
export function signEd25519(dataString: string, privateKeyInput: string | crypto.KeyObject): string {
  const privKey =
    typeof privateKeyInput === 'string'
      ? crypto.createPrivateKey(privateKeyInput)
      : privateKeyInput
  const dataBuf = Buffer.from(dataString, 'utf8')
  const sig = crypto.sign(null, dataBuf, privKey)
  return sig.toString('hex')
}

/**
 * Verifica firma Ed25519 sobre datos UTF-8.
 */
export function verifyEd25519(
  dataString: string,
  signatureHex: string,
  publicKeyInput: string | crypto.KeyObject
): boolean {
  try {
    const pubKey =
      typeof publicKeyInput === 'string'
        ? crypto.createPublicKey(publicKeyInput)
        : publicKeyInput
    const dataBuf = Buffer.from(dataString, 'utf8')
    const sigBuf = Buffer.from(signatureHex, 'hex')
    return crypto.verify(null, dataBuf, pubKey, sigBuf)
  } catch {
    return false
  }
}

/**
 * Crea y firma un documento de autorización GO para PR02-P0 exclusivo para propósitos de prueba.
 * Exige campos explícitos para no ocultar discrepancias.
 */
export function createSignedTestPr02P0GoAuthorization(
  doc: {
    version?: string
    identificador?: string
    aprobador_identidad: string
    scope?: string
    project_ref?: string
    entorno?: string
    commit_sha: string
    operaciones_permitidas?: readonly string[] | string[]
    limites?: {
      loginCmsMax: number
      tiposIvaMax: number
      condicionIvaReceptorMax: number
      totalMax: number
    }
    emitido_en?: string
    vence_en?: string
    single_use_nonce?: string
  },
  privateKeyInput: string | crypto.KeyObject
) {
  const canonical = {
    version: doc.version || '1.0',
    identificador: doc.identificador || `GO-P0-${randomUUID()}`,
    aprobador_identidad: doc.aprobador_identidad,
    scope: doc.scope || PR02_P0_SCOPE,
    project_ref: doc.project_ref || PR02_PARAMETERS_TARGET_PROJECT_REF,
    entorno: doc.entorno || 'HOMOLOGACION',
    commit_sha: String(doc.commit_sha).toLowerCase(),
    operaciones_permitidas: Object.freeze(
      doc.operaciones_permitidas
        ? [...doc.operaciones_permitidas]
        : ['LoginCms', 'FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor']
    ),
    limites: Object.freeze(
      doc.limites || {
        loginCmsMax: 1,
        tiposIvaMax: 1,
        condicionIvaReceptorMax: 1,
        totalMax: 3,
      }
    ),
    emitido_en: doc.emitido_en || new Date().toISOString(),
    vence_en: doc.vence_en || new Date(Date.now() + 3600000).toISOString(),
    single_use_nonce:
      doc.single_use_nonce || createHash('sha256').update(randomUUID()).digest('hex').slice(0, 32),
  }

  const canonicalJson = JSON.stringify(canonical)
  const signature = signEd25519(canonicalJson, privateKeyInput)

  return Object.freeze({
    authorization: canonical,
    signature,
  })
}

/**
 * Crea y firma una atestación independiente de adquisición de evidencia oficial P0
 * emitida por una entidad externa de atestación (Attestation Authority) en entorno de pruebas.
 */
export function createSignedTestIndependentAttestation(
  params: {
    processId: string
    executionId?: string
    executionScope?: string
    commitSha: string
    consultadoEn: string
    entorno?: string
    transportType?: string
    executorIdentity?: string
    operacionesWsfe?: readonly string[] | string[]
    ivaRawSha: string
    ivaNormSha: string
    condRawSha: string
    condNormSha: string
    goAuthorizationId: string
    goAuthorizationSha256: string
    requestId?: string
    requestSha256?: string
    manifestSha256?: string
    signerOrigin?: 'TEST_SIGNER' | 'PRODUCTION_ATTESTATION_AUTHORITY'
    issuedAt?: string
    expiresAt?: string
  },
  privateKeyInput: string | crypto.KeyObject
) {
  const issuedAt = params.issuedAt || new Date().toISOString()
  const payload = {
    version: '1.0',
    processId: params.processId,
    executionId: params.executionId || params.processId,
    executionScope: params.executionScope || PR02_P0_SCOPE,
    commitSha: String(params.commitSha).toLowerCase(),
    consultadoEn: params.consultadoEn,
    entorno: params.entorno || 'HOMOLOGACION',
    transportType: params.transportType || 'OFFICIAL',
    executorIdentity: params.executorIdentity || PR02_P0_COLECTOR_IDENTIDAD,
    operacionesWsfe: Object.freeze(
      params.operacionesWsfe
        ? [...params.operacionesWsfe]
        : ['FEParamGetTiposIva', 'FEParamGetCondicionIvaReceptor']
    ),
    ivaRawSha: params.ivaRawSha,
    ivaNormSha: params.ivaNormSha,
    condRawSha: params.condRawSha,
    condNormSha: params.condNormSha,
    goAuthorizationId: params.goAuthorizationId,
    goAuthorizationSha256: params.goAuthorizationSha256,
    ...(params.requestId ? { requestId: params.requestId } : {}),
    ...(params.requestSha256 ? { requestSha256: params.requestSha256 } : {}),
    ...(params.manifestSha256 ? { manifestSha256: params.manifestSha256 } : {}),
    signerOrigin: params.signerOrigin || ATTESTATION_SIGNER_ORIGINS.TEST_SIGNER,
    issuedAt,
    ...(params.expiresAt ? { expiresAt: params.expiresAt } : {}),
    EVIDENCE_INTEGRITY: 'PASS' as const,
    EVIDENCE_CUSTODY_ATTESTED: true,
    ATTESTATION_TRUST_MODEL: ATTESTATION_TRUST_MODELS.INDEPENDENT_ATTESTED,
    TRUSTED_EXECUTION_BOUNDARY: 'VERIFIED' as const,
    ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED: false,
    INDEPENDENT_ATTESTATION_AVAILABLE: true,
    P1_IMPORT_ALLOWED: true,
    trustModel: 'INDEPENDENT_ATTESTED',
    antiReplayGuarantee: ANTI_REPLAY_GUARANTEE_LEVEL,
  }

  const canonicalJson = JSON.stringify(payload)
  const signature = signEd25519(canonicalJson, privateKeyInput)

  return Object.freeze({
    ...payload,
    signature,
    accredited: true,
    provenance: 'VERIFIED',
  })
}

/**
 * Crea y firma una atestación independiente directamente a partir de un
 * `AttestationRequestPackage` en entorno de pruebas (`TEST_SIGNER`).
 */
export function createSignedTestAttestationFromRequest(
  reqPkg: AttestationRequestPackage,
  privateKeyInput: string | crypto.KeyObject,
  overrides: Partial<{
    commitSha: string
    entorno: string
    signerOrigin: 'TEST_SIGNER' | 'PRODUCTION_ATTESTATION_AUTHORITY'
    issuedAt: string
    expiresAt: string
    requestSha256: string
    manifestSha256: string
  }> = {}
) {
  const ivaRaw = reqPkg.rawSoapArtifacts.find((a) => /tiposiva/i.test(a.name))
  const condRaw = reqPkg.rawSoapArtifacts.find((a) => /condicionivareceptor/i.test(a.name))
  const ivaNorm = reqPkg.normalizedArtifacts.find((a) => /tiposiva/i.test(a.name))
  const condNorm = reqPkg.normalizedArtifacts.find((a) => /condicionivareceptor/i.test(a.name))

  return createSignedTestIndependentAttestation(
    {
      processId: reqPkg.processId,
      executionId: reqPkg.processId,
      executionScope: reqPkg.executionScope,
      commitSha: overrides.commitSha || reqPkg.commitSha,
      consultadoEn: reqPkg.consultadoEn,
      entorno: overrides.entorno || reqPkg.environment,
      transportType: 'OFFICIAL',
      executorIdentity: reqPkg.collectorIdentity,
      ivaRawSha: ivaRaw?.sha256 || '',
      ivaNormSha: ivaNorm?.sha256 || '',
      condRawSha: condRaw?.sha256 || '',
      condNormSha: condNorm?.sha256 || '',
      goAuthorizationId: reqPkg.authorizationId,
      goAuthorizationSha256: reqPkg.goAuthorizationDocumentSha256,
      requestId: reqPkg.requestId,
      requestSha256: overrides.requestSha256 || reqPkg.requestSha256,
      manifestSha256: overrides.manifestSha256 || reqPkg.manifestSha256,
      signerOrigin: overrides.signerOrigin || ATTESTATION_SIGNER_ORIGINS.TEST_SIGNER,
      issuedAt: overrides.issuedAt,
      expiresAt: overrides.expiresAt,
    },
    privateKeyInput
  )
}

/**
 * Crea y firma un `AttestationResponse` explícito a partir de un `AttestationRequestPackage`
 * exclusivamente para propósitos de prueba (`TEST_AUTHORITY` / `TEST_SIGNER`).
 */
export function createSignedTestAttestationResponse(
  reqPkg: AttestationRequestPackage,
  privateKeyInput: string | crypto.KeyObject,
  overrides: Partial<{
    schemaVersion: '1.0'
    responseId: string
    attestationId: string
    authorityType: AttestationAuthorityType
    authorityId: string
    keyId: string
    algorithm: AttestationAllowedAlgorithm | string
    requestId: string
    requestSha256: string
    manifestSha256: string
    processId: string
    executionScope: string
    commitSha: string
    environment: 'HOMOLOGACION'
    authorizationId: string
    goAuthorizationDocumentSha256: string
    rawSoapArtifacts: readonly AttestationRequestArtifact[]
    normalizedArtifacts: readonly AttestationRequestArtifact[]
    consultadoEn: string
    issuedAt: string
    expiresAt: string
    signerOrigin: AttestationSignerOrigin
    attestationPayloadSha256: string
    signature: string
  }> = {}
): AttestationResponse {
  const privKeyObj =
    typeof privateKeyInput === 'string'
      ? crypto.createPrivateKey(privateKeyInput)
      : privateKeyInput
  const pubKeyObj = crypto.createPublicKey(privKeyObj)
  const derivedKeyId = computePublicKeyId(pubKeyObj)

  const effectiveResponseId = overrides.responseId || overrides.attestationId || `att-res-${randomUUID()}`

  const draft = {
    schemaVersion: (overrides.schemaVersion || '1.0') as '1.0',
    responseId: effectiveResponseId,
    attestationId: overrides.attestationId || effectiveResponseId,
    authorityType: (overrides.authorityType || ATTESTATION_AUTHORITY_TYPES.TEST_AUTHORITY) as AttestationAuthorityType,
    authorityId: overrides.authorityId || 'test-independent-attestation-authority-v1',
    keyId: overrides.keyId || derivedKeyId,
    algorithm: (overrides.algorithm || 'Ed25519') as AttestationAllowedAlgorithm,
    requestId: overrides.requestId || reqPkg.requestId,
    requestSha256: overrides.requestSha256 || reqPkg.requestSha256,
    manifestSha256: overrides.manifestSha256 || reqPkg.manifestSha256,
    processId: overrides.processId || reqPkg.processId,
    executionScope: overrides.executionScope || reqPkg.executionScope,
    commitSha: String(overrides.commitSha || reqPkg.commitSha).toLowerCase(),
    environment: (overrides.environment || reqPkg.environment) as 'HOMOLOGACION',
    authorizationId: overrides.authorizationId || reqPkg.authorizationId,
    goAuthorizationDocumentSha256:
      overrides.goAuthorizationDocumentSha256 || reqPkg.goAuthorizationDocumentSha256,
    rawSoapArtifacts: overrides.rawSoapArtifacts || reqPkg.rawSoapArtifacts,
    normalizedArtifacts: overrides.normalizedArtifacts || reqPkg.normalizedArtifacts,
    consultadoEn: overrides.consultadoEn || reqPkg.consultadoEn,
    issuedAt: overrides.issuedAt || new Date().toISOString(),
    ...(overrides.expiresAt ? { expiresAt: overrides.expiresAt } : {}),
    signerOrigin: (overrides.signerOrigin || ATTESTATION_SIGNER_ORIGINS.TEST_SIGNER) as AttestationSignerOrigin,
  }

  const canonicalPayload = serializeCanonicalAttestationResponsePayload(draft)
  const attestationPayloadSha256 =
    overrides.attestationPayloadSha256 || computeAttestationResponsePayloadDigest(draft)
  const signature = overrides.signature || signEd25519(canonicalPayload, privKeyObj)

  return Object.freeze({
    ...draft,
    attestationPayloadSha256,
    signature,
  })
}

/**
 * Instancia aislada de `TestIndependentAttestationAuthority` exclusivamente para pruebas.
 * Produce respuestas identificadas explícitamente como `TEST_AUTHORITY` / `TEST_SIGNER`,
 * las cuales resultan en `TEST_ONLY` cuando `allowTestKeys: true` y son rechazadas en modo producción.
 */
export function createTestIndependentAttestationAuthority(options?: {
  authorityId?: string
  keyPair?: KeyPairPem
  issuedAt?: string
}) {
  const keyPair = options?.keyPair || generateEphemeralAttestationKeyPair()
  const authorityId = options?.authorityId || 'test-independent-attestation-authority-v1'
  const keyId = computePublicKeyId(keyPair.publicKey)

  return Object.freeze({
    authorityType: ATTESTATION_AUTHORITY_TYPES.TEST_AUTHORITY,
    signerOrigin: ATTESTATION_SIGNER_ORIGINS.TEST_SIGNER,
    authorityId,
    keyId,
    publicKey: keyPair.publicKey,
    sendAttestationRequest: (reqPkg: AttestationRequestPackage) =>
      createSignedTestAttestationResponse(reqPkg, keyPair.privateKey, {
        authorityId,
        keyId,
        issuedAt: options?.issuedAt,
      }),
    issueResponse: (
      reqPkg: AttestationRequestPackage,
      overrides: Parameters<typeof createSignedTestAttestationResponse>[2] = {}
    ) =>
      createSignedTestAttestationResponse(reqPkg, keyPair.privateKey, {
        authorityId,
        keyId,
        issuedAt: options?.issuedAt,
        ...overrides,
      }),
  })
}

/**
 * Crea un `ExternalAuthoritySigner` de pruebas (`TEST_SIGNER`) respaldado por un par efímero Ed25519.
 */
export function createTestAuthoritySigner(options?: {
  authorityId?: string
  keyPair?: KeyPairPem
  keyId?: string
}) {
  const keyPair = options?.keyPair || generateEphemeralAttestationKeyPair()
  const authorityId = options?.authorityId || 'test-independent-attestation-authority-v1'
  const keyId = options?.keyId || computePublicKeyId(keyPair.publicKey)

  return createExternalAuthoritySigner({
    signerType: 'TEST_SIGNER',
    allowTestKeys: true,
    authorityId,
    keyId,
    publicKeySpki: keyPair.publicKey,
    sign: (canonicalPayload: string) => signEd25519(canonicalPayload, keyPair.privateKey),
  })
}

/**
 * Crea una instancia de servicio de atestación externa de prueba (`POST /attestations`).
 */
export function createTestExternalAttestationService(options?: {
  authorityId?: string
  keyPair?: KeyPairPem
  keyId?: string
}) {
  const signer = createTestAuthoritySigner(options)
  return createExternalAttestationAuthorityService({
    signer,
    authorityId: signer.authorityId || 'test-independent-attestation-authority-v1',
    keyId: signer.keyId || undefined,
    publicKeySpki: signer.publicKeySpki || undefined,
  })
}

/**
 * Limpia el directorio de autorizaciones consumidas para propósitos de aislamiento en tests.
 */
export function clearConsumedAuthorizationsForTesting(dir?: string) {
  const targetDir = dir || path.resolve(process.cwd(), '.fiscal-evidence-pr02', '.consumed-authorizations')
  if (fs.existsSync(targetDir)) {
    try {
      const files = fs.readdirSync(targetDir)
      for (const file of files) {
        if (file.startsWith('consumed-') && file.endsWith('.json')) {
          fs.unlinkSync(path.join(targetDir, file))
        }
      }
    } catch {
      // Ignorar si el directorio o archivo fue eliminado concurrentemente
    }
  }
}

export const SYNTHETIC_TIPOS_IVA_RESPONSE = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body><FEParamGetTiposIvaResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEParamGetTiposIvaResult><ResultGet><IvaTipo><Id>5</Id><Desc>21%</Desc><FchDesde>20100917</FchDesde><FchHasta>NULL</FchHasta></IvaTipo><IvaTipo><Id>4</Id><Desc>10.5%</Desc><FchDesde>20100917</FchDesde><FchHasta>NULL</FchHasta></IvaTipo></ResultGet></FEParamGetTiposIvaResult></FEParamGetTiposIvaResponse></soap:Body></soap:Envelope>`

export const SYNTHETIC_CONDICIONES_IVA_RESPONSE = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body><FEParamGetCondicionIvaReceptorResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEParamGetCondicionIvaReceptorResult><ResultGet><CondicionIvaReceptor><Id>1</Id><Desc>IVA Responsable Inscripto</Desc><Cmp_Clase>A/ALEY/C</Cmp_Clase></CondicionIvaReceptor><CondicionIvaReceptor><Id>5</Id><Desc>Consumidor Final</Desc><Cmp_Clase>B/C</Cmp_Clase></CondicionIvaReceptor></ResultGet></FEParamGetCondicionIvaReceptorResult></FEParamGetCondicionIvaReceptorResponse></soap:Body></soap:Envelope>`

