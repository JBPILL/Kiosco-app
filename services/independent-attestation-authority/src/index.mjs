// @ts-check
export {
  CONTRACT_VERSION,
  SCHEMA_VERSION,
  PR02_P0_SCOPE,
  PR02_P0_COLECTOR_IDENTIDAD,
  MAX_JSON_NESTING_DEPTH,
  ATTESTATION_REQUEST_ALLOWED_KEYS,
  safeParseStrictJson,
  assertNoPrototypePollution,
  serializeCanonicalAttestationRequest,
  computeAttestationRequestDigest,
  serializeCanonicalAttestationResponsePayload,
  computeAttestationResponsePayloadDigest,
  validateAttestationRequestStrict,
} from './contract.mjs'

export {
  AttestationSigningProvider,
  TestSigningProvider,
  ProductionKmsSigningProvider,
  SUPPORTED_SIGNING_ALGORITHM,
} from './signing-providers.mjs'

export { ServiceAntiReplayGuard } from './service-anti-replay.mjs'

export {
  SERVICE_ENVIRONMENTS,
  ALLOWED_EXECUTION_SCOPES,
  ALLOWED_ENVIRONMENTS,
  FORBIDDEN_SCOPE_TOKENS,
  assertServiceEnvironmentIsolation,
  validateAttestationPolicy,
} from './attestation-policy.mjs'

export { IndependentAttestationAuthorityService } from './authority-service.mjs'

export { IndependentAttestationHttpServer } from './http-server.mjs'

export { createConfiguredAuthorityFromEnv } from './server.mjs'
