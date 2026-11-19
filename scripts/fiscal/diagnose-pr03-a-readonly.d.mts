export interface Pr03aDiagnosticRaw {
  transaction_read_only: string
  observed_at: string
  private_acl: boolean
  expected_issuer_present: boolean
  expected_issuer_enabled: boolean
  unexpected_enabled_issuers: number
  pos_present: boolean
  pos_receipt_type_match: boolean
  pos_configuration_match: boolean
  catalog_rev2_expired: boolean
  catalog_rev3_exists: boolean
}

export interface Pr03aDiagnosticResult {
  custodyConfigPresent: boolean
  expectedIssuerPresent: boolean
  expectedIssuerEnabled: boolean
  unexpectedEnabledIssuers: number
  posPresent: boolean
  posReceiptTypeMatch: boolean
  posConfigurationMatch: boolean
  catalogRev2Expired: boolean
  catalogRev3Exists: boolean
  status: 'PASS'
}

export const PR03_A_READONLY_SQL: string
export function verifyPr03aDiagnostic(raw: unknown): Pr03aDiagnosticResult
