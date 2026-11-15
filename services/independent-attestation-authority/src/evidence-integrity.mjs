// @ts-check

export const EVIDENCE_INTEGRITY_LEVELS = Object.freeze({
  LEVEL_1_DIGEST_ONLY: 'LEVEL_1_DIGEST_ONLY',
  LEVEL_2A_SUBMITTED_CONTENT: 'LEVEL_2A_SUBMITTED_CONTENT',
  LEVEL_2B_INDEPENDENT_OBSERVED: 'LEVEL_2B_INDEPENDENT_OBSERVED',
})

export const FORBIDDEN_CLIENT_EVIDENCE_ELEVATION_FIELDS = Object.freeze([
  'evidenceLevel',
  'evidenceIntegrityLevel',
  'evidenceAttestationLevel',
  'rawSoapVerified',
  'arcaOriginVerified',
  'normalizedTablesRecomputed',
  'trustedEvidenceLevel',
  'forceEvidenceLevel',
  'provenanceClass',
  'ARCA_ORIGIN_DIRECTLY_CRYPTOGRAPHICALLY_VERIFIED',
])

/**
 * Impide que el cliente intente autodeclarar o elevar el nivel de integridad de evidencia.
 * @param {Record<string, any>} requestPkg
 */
export function assertNoClientEvidenceElevation(requestPkg) {
  if (!requestPkg || typeof requestPkg !== 'object') return

  for (const field of FORBIDDEN_CLIENT_EVIDENCE_ELEVATION_FIELDS) {
    if (requestPkg[field] !== undefined) {
      throw new Error(
        `EVIDENCE_LEVEL_ELEVATION_REJECTED: El cliente no puede declarar ni elevar '${field}'; el nivel de evidencia lo determina exclusivamente la autoridad`
      )
    }
  }
}

/**
 * Interfaz base tipada para evaluadores de integridad de evidencia (Nivel 1 / futuro 2A / futuro 2B).
 */
export class EvidenceIntegrityEvaluator {
  get level() {
    throw new Error('NOT_IMPLEMENTED')
  }

  /**
   * @param {Record<string, any>} _requestPkg
   * @returns {Promise<{
   *   evidenceLevel: 'LEVEL_1_DIGEST_ONLY' | 'LEVEL_2A_SUBMITTED_CONTENT' | 'LEVEL_2B_INDEPENDENT_OBSERVED',
   *   inspectedMode: string,
   *   rawSoapVerified: boolean,
   *   normalizedTablesRecomputed: boolean,
   *   arcaOriginVerified: boolean,
   *   provenanceClass: string
   * }>}
   */
  async inspect(_requestPkg) {
    throw new Error('NOT_IMPLEMENTED')
  }
}

/**
 * Evaluador Nivel 1 (actual): verifica únicamente presencia/formato de digests SHA-256 enviados
 * en el paquete de solicitud. Nunca afirma haber verificado bytes SOAP ni procedencia ARCA.
 */
export class Level1DigestOnlyEvidenceEvaluator extends EvidenceIntegrityEvaluator {
  get level() {
    return EVIDENCE_INTEGRITY_LEVELS.LEVEL_1_DIGEST_ONLY
  }

  /**
   * @param {Record<string, any>} requestPkg
   */
  async inspect(requestPkg) {
    assertNoClientEvidenceElevation(requestPkg)

    return Object.freeze({
      evidenceLevel: EVIDENCE_INTEGRITY_LEVELS.LEVEL_1_DIGEST_ONLY,
      inspectedMode: 'SHA256_DIGESTS_ONLY',
      rawSoapVerified: false,
      normalizedTablesRecomputed: false,
      arcaOriginVerified: false,
      provenanceClass: 'CLIENT_SUBMITTED_DIGESTS_UNVERIFIED_ORIGIN',
    })
  }
}

/**
 * Stub tipado fail-closed para futura validación de Nivel 2A (artefactos XML/JSON enviados).
 * No implementado ni activo en EXT-REAL-04.
 */
export class Level2ASubmittedContentEvaluatorStub extends EvidenceIntegrityEvaluator {
  get level() {
    return EVIDENCE_INTEGRITY_LEVELS.LEVEL_2A_SUBMITTED_CONTENT
  }

  /**
   * @param {Record<string, any>} _requestPkg
   */
  async inspect(_requestPkg) {
    throw new Error(
      'EVIDENCE_LEVEL_2A_NOT_IMPLEMENTED: La validación de contenido XML/JSON (Nivel 2A) no está implementada en EXT-REAL-04'
    )
  }
}

/**
 * Stub tipado fail-closed para futura observación independiente de Nivel 2B (proxy/WORM).
 * No implementado ni activo en EXT-REAL-04.
 */
export class Level2BIndependentObservedEvaluatorStub extends EvidenceIntegrityEvaluator {
  get level() {
    return EVIDENCE_INTEGRITY_LEVELS.LEVEL_2B_INDEPENDENT_OBSERVED
  }

  /**
   * @param {Record<string, any>} _requestPkg
   */
  async inspect(_requestPkg) {
    throw new Error(
      'EVIDENCE_LEVEL_2B_NOT_IMPLEMENTED: La observación independiente de evidencia (Nivel 2B) no está implementada en EXT-REAL-04'
    )
  }
}
