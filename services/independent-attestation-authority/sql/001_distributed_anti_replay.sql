-- =============================================================================
-- Independent Attestation Authority — Distributed Anti-Replay PostgreSQL Schema
-- =============================================================================
-- NOTE: This schema belongs EXCLUSIVELY to the standalone
--       `services/independent-attestation-authority` microservice database.
--       It is NOT a POS/Supabase application migration and MUST NOT be applied
--       to the commercial KioskoPOS database.
-- =============================================================================

CREATE TABLE IF NOT EXISTS attestation_distributed_anti_replay (
  idempotency_key   TEXT        NOT NULL,
  request_id        TEXT        PRIMARY KEY,
  request_sha256    TEXT        NOT NULL,
  authorization_id  TEXT        NULL,
  attestation_id    TEXT        NOT NULL,
  state             TEXT        NOT NULL
    CHECK (state IN ('RESERVED', 'CONSUMED', 'FAILED', 'EXPIRED')),
  owner_node_id     TEXT        NOT NULL,
  reservation_token TEXT        NOT NULL,
  kms_attempted     BOOLEAN     NOT NULL DEFAULT FALSE,
  reserved_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at       TIMESTAMPTZ NULL,
  failed_at         TIMESTAMPTZ NULL,
  expired_at        TIMESTAMPTZ NULL,
  failure_reason    TEXT        NULL,
  response_digest   TEXT        NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uniqueness on the logical idempotency key (authorizationId, requestId, requestSha256)
CREATE UNIQUE INDEX IF NOT EXISTS uq_attestation_replay_idempotency_key
  ON attestation_distributed_anti_replay (idempotency_key);

-- Strict uniqueness on request payload digest
CREATE UNIQUE INDEX IF NOT EXISTS uq_attestation_replay_request_sha256
  ON attestation_distributed_anti_replay (request_sha256);

-- Strict uniqueness on pre-assigned attestation response ID
CREATE UNIQUE INDEX IF NOT EXISTS uq_attestation_replay_attestation_id
  ON attestation_distributed_anti_replay (attestation_id);

-- Partial strict unique index enforcing single-use GO authorizationId when present
CREATE UNIQUE INDEX IF NOT EXISTS uq_attestation_replay_authorization_id
  ON attestation_distributed_anti_replay (authorization_id)
  WHERE authorization_id IS NOT NULL;

-- Operational index for monitoring abandoned RESERVED rows eligible for lease expiration
CREATE INDEX IF NOT EXISTS idx_attestation_replay_state_lease
  ON attestation_distributed_anti_replay (state, lease_expires_at);

-- =============================================================================
-- Documented Atomic Transaction Flow (Pre-Sign Mutual Exclusion):
-- =============================================================================
--   BEGIN;
--   INSERT INTO attestation_distributed_anti_replay (
--     idempotency_key, request_id, request_sha256, authorization_id,
--     attestation_id, state, owner_node_id, reservation_token,
--     kms_attempted, reserved_at, lease_expires_at, updated_at
--   ) VALUES ($1, $2, $3, $4, $5, 'RESERVED', $6, $7, FALSE, $8, $9, $8)
--   ON CONFLICT DO NOTHING
--   RETURNING request_id, attestation_id, idempotency_key, state, owner_node_id,
--             reservation_token, lease_expires_at;
--   COMMIT;
--
--   * If RETURNING yields 0 rows -> conflict on PK/UNIQUE constraints -> fail closed (409).
--   * Commit transition (only while state='RESERVED' AND owner matches AND lease active):
--       UPDATE attestation_distributed_anti_replay
--       SET state = 'CONSUMED', kms_attempted = TRUE, consumed_at = $5,
--           response_digest = $6, updated_at = $5
--       WHERE request_id = $1 AND attestation_id = $2 AND state = 'RESERVED'
--         AND owner_node_id = $3 AND reservation_token = $4
--         AND lease_expires_at > $5
--       RETURNING request_id, state, consumed_at;
-- =============================================================================
