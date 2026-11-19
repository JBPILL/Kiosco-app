import { describe, it, expect } from 'vitest'
import { PR03_A_READONLY_SQL, verifyPr03aDiagnostic } from '../../scripts/fiscal/diagnose-pr03-a-readonly.mjs'

describe('PR03-A Read-only Diagnostic', () => {
  it('SQL contains required transaction isolation and rollback', () => {
    expect(PR03_A_READONLY_SQL).toContain('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    expect(PR03_A_READONLY_SQL).toContain('ROLLBACK')
    expect(PR03_A_READONLY_SQL).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\s+public\./)
  })

  it('validates a compliant read-only diagnostic output', () => {
    const raw = {
      transaction_read_only: 'on',
      observed_at: new Date().toISOString(),
      private_acl: true,
      expected_issuer_present: true,
      expected_issuer_enabled: false,
      unexpected_enabled_issuers: 0,
      pos_present: true,
      pos_receipt_type_match: true,
      pos_configuration_match: true,
      catalog_rev2_expired: true,
      catalog_rev3_exists: false,
    }
    const result = verifyPr03aDiagnostic(raw)
    expect(result.status).toBe('PASS')
    expect(result.custodyConfigPresent).toBe(true)
    expect(result.expectedIssuerPresent).toBe(true)
    expect(result.expectedIssuerEnabled).toBe(false)
    expect(result.unexpectedEnabledIssuers).toBe(0)
    expect(result.posPresent).toBe(true)
    expect(result.posReceiptTypeMatch).toBe(true)
    expect(result.posConfigurationMatch).toBe(true)
    expect(result.catalogRev2Expired).toBe(true)
    expect(result.catalogRev3Exists).toBe(false)
  })

  it('rejects if transaction is not read-only', () => {
    expect(() => verifyPr03aDiagnostic({
      transaction_read_only: 'off',
      private_acl: true,
      expected_issuer_present: true,
      expected_issuer_enabled: false,
      unexpected_enabled_issuers: 0,
      pos_present: true,
      pos_receipt_type_match: true,
      pos_configuration_match: true,
    })).toThrow('PR03_A_NOT_READ_ONLY')
  })

  it('rejects if issuer is enabled outside of an authorized window', () => {
    expect(() => verifyPr03aDiagnostic({
      transaction_read_only: 'on',
      private_acl: true,
      expected_issuer_present: true,
      expected_issuer_enabled: true,
      unexpected_enabled_issuers: 1,
      pos_present: true,
      pos_receipt_type_match: true,
      pos_configuration_match: true,
    })).toThrow('PR03_A_ISSUER_UNEXPECTEDLY_ENABLED')
  })

  it('rejects if POS is not configured', () => {
    expect(() => verifyPr03aDiagnostic({
      transaction_read_only: 'on',
      private_acl: true,
      expected_issuer_present: true,
      expected_issuer_enabled: false,
      unexpected_enabled_issuers: 0,
      pos_present: false,
      pos_receipt_type_match: true,
      pos_configuration_match: false,
    })).toThrow('PR03_A_POS_NOT_FOUND')
  })
})
