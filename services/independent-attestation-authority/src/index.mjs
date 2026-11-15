// @ts-check
export {
  CONTRACT_VERSION,
  SCHEMA_VERSION,
  PR02_P0_SCOPE,
  PR02_P0_COLECTOR_IDENTIDAD,
  MAX_JSON_NESTING_DEPTH,
  ATTESTATION_REQUEST_ALLOWED_KEYS,
  ATTESTATION_RESPONSE_ALLOWED_KEYS_V1_0,
  ATTESTATION_RESPONSE_ALLOWED_KEYS_V1_1,
  safeParseStrictJson,
  assertNoPrototypePollution,
  serializeCanonicalAttestationRequest,
  computeAttestationRequestDigest,
  serializeCanonicalAttestationResponsePayload,
  computeAttestationResponsePayloadDigest,
  validateAttestationRequestStrict,
  verifyServiceAttestationResponse,
} from './contract.mjs'

export {
  GO_GRANT_SCHEMA_VERSION,
  GO_SIGNATURE_DOMAIN_SEPARATOR,
  DEFAULT_MAX_GO_GRANT_TTL_MS,
  GO_GRANT_ALLOWED_KEYS,
  computeEd25519SpkiKeyId,
  parseStrictGoAuthorizationGrant,
  serializeCanonicalGoGrantPayload,
  buildDomainSeparatedGoGrantSigningBytes,
  computeGoGrantDigest,
  verifyGoAuthorizationGrant,
  TestOnlyGoAuthorityIssuer,
} from './go-authorization.mjs'

export {
  CLIENT_AUTH_MODES,
  OIDC_ALLOWED_ALGORITHMS,
  normalizeClientAuthVerifier,
  assertNormalizedAuthenticatedClient,
  createSimulatedClientAuthVerifier,
  createOidcJwtClientAuthVerifier,
  createMtlsClientAuthVerifier,
} from './client-auth.mjs'

export {
  EVIDENCE_INTEGRITY_LEVELS,
  FORBIDDEN_CLIENT_EVIDENCE_ELEVATION_FIELDS,
  assertNoClientEvidenceElevation,
  EvidenceIntegrityEvaluator,
  Level1DigestOnlyEvidenceEvaluator,
  Level2ASubmittedContentEvaluatorStub,
  Level2BIndependentObservedEvaluatorStub,
} from './evidence-integrity.mjs'

export {
  AttestationSigningProvider,
  TestSigningProvider,
  ProductionKmsSigningProvider,
  AwsKmsSigningProvider,
  GcpKmsSigningProvider,
  SUPPORTED_SIGNING_ALGORITHM,
  EXTERNAL_SIGNING_PROVIDER_KINDS,
  PROVIDER_REAL_WORLD_TESTED,
} from './signing-providers.mjs'

export {
  ANTI_REPLAY_ENTRY_STATES,
  ServiceAntiReplayGuard,
} from './service-anti-replay.mjs'

export {
  DEFAULT_RESERVATION_LEASE_TTL_MS,
  DISTRIBUTED_RESERVATION_STATES,
  ALLOWED_RESERVATION_TRANSITIONS,
  REQUIRED_DISTRIBUTED_STORE_METHODS,
  normalizeEffectiveNowMs,
  computeDistributedIdempotencyKey,
  normalizeReservationInput,
  assertValidReservationTransition,
  assertDistributedStoreContract,
  DistributedAntiReplayStore,
  ReferenceInProcessDistributedStore,
  SharedFileCoordinatorDistributedStore,
} from './distributed-anti-replay.mjs'

export {
  POSTGRESQL_PRODUCTION_READY,
  POSTGRESQL_REAL_INTEGRATION_TESTED,
  ALLOWED_POSTGRES_ISOLATION_LEVELS,
  buildPostgresAntiReplaySqlStatements,
  PostgresDistributedAntiReplayStore,
} from './postgres-anti-replay-adapter.mjs'

export {
  AWS_DYNAMODB_REAL_TESTED,
  DYNAMODB_PRODUCTION_READY,
  DYNAMODB_KEY_PREFIXES,
  DYNAMODB_TABLE_DESIGN,
  buildDynamoDbReserveTransactItems,
  DynamoDbDistributedAntiReplayStore,
} from './dynamodb-anti-replay-adapter.mjs'

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

export {
  createConfiguredAuthorityFromEnv,
  createGracefulShutdownHandler,
} from './server.mjs'

export {
  isRealIntegrationEnabled,
  isRealIntegrationDryRun,
  assertRealIntegrationEnabled,
  assertDedicatedPostgresUrl,
  assertSafeEndpointUrl,
  classifyNetworkHost,
  normalizeNetworkHostname,
  resolveKmsEnvConfig,
  createControlledPostgresStoreFromEnv,
  createControlledDynamoDbStoreFromEnv,
  createControlledKmsProviderFromEnv,
} from './real-integration.mjs'

export {
  PREFLIGHT_STATUSES,
  INTEGRATION_PHASES,
  INTEGRATION_PHASE_ORDER,
  MATURITY_STATES,
  DEFAULT_MATURITY_FLAGS,
  redactSensitiveConfigText,
  buildSafeConfigurationFingerprint,
  validateInfrastructureConfiguration,
  runInfrastructurePreflight,
  evaluateIntegrationPhaseGate,
  evaluateMaturityState,
  assertMaturityPromotionAllowed,
  runControlledRealIntegrationDryRun,
} from './infrastructure-preflight.mjs'

export {
  CONNECTIVITY_READINESS_STAGES,
  CONNECTIVITY_STAGE_ORDER,
  CONNECTIVITY_AUTHORIZATION_STATUSES,
  POSTGRES_CONNECTIVITY_STATES,
  MTLS_CONNECTIVITY_STATES,
  DYNAMODB_ERROR_CATEGORIES,
  evaluateExternalConnectivityAuthorization,
  assertExternalConnectivityAuthorized,
  runControlledPostgresConnectivityCheck,
  classifyDynamoDbConnectivityError,
  runControlledDynamoDbConnectivityCheck,
  runControlledKmsConnectivityCheck,
  runControlledOidcConnectivityCheck,
  runControlledMtlsConnectivityCheck,
  runControlledExternalConnectivitySuite,
} from './external-connectivity.mjs'
