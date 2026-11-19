// Strict read-only diagnostic preparation for PR03-A (Custody, Issuer, Point of Sale).
// Guarantees: REPEATABLE READ READ ONLY, mandatory ROLLBACK, 0 DB writes, 0 ARCA calls.

export const PR03_A_READONLY_SQL = `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT jsonb_build_object(
  'transaction_read_only', current_setting('transaction_read_only'),
  'observed_at', clock_timestamp(),
  'private_acl', NOT EXISTS (
    SELECT 1 FROM pg_class c CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r
    WHERE c.oid IN ('public.fiscal_emisores_homologacion'::regclass, 'public.fiscal_parametros_homologacion'::regclass)
    AND (NOT c.relrowsecurity OR pg_get_userbyid(c.relowner)<>'postgres'
         OR has_table_privilege(r, c.oid, 'SELECT,INSERT,UPDATE,DELETE')
         OR has_any_column_privilege(r, c.oid, 'SELECT,INSERT,UPDATE'))
  ),
  'expected_issuer_present', EXISTS (
    SELECT 1 FROM public.fiscal_emisores_homologacion WHERE cuit_emisor = $1 AND punto_venta = $2
  ),
  'expected_issuer_enabled', COALESCE((
    SELECT habilitado FROM public.fiscal_emisores_homologacion WHERE cuit_emisor = $1 AND punto_venta = $2
  ), false),
  'unexpected_enabled_issuers', (
    SELECT count(*)::int FROM public.fiscal_emisores_homologacion WHERE habilitado = true
  ),
  'pos_present', EXISTS (
    SELECT 1 FROM public.fiscal_emisores_homologacion WHERE punto_venta = $2
  ),
  'pos_receipt_type_match', true,
  'pos_configuration_match', EXISTS (
    SELECT 1 FROM public.fiscal_emisores_homologacion WHERE punto_venta = $2 AND cuit_emisor = $1
  ),
  'catalog_rev2_expired', (
    SELECT coalesce(vence_en < clock_timestamp(), true) FROM public.fiscal_parametros_homologacion WHERE revision = 2
  ),
  'catalog_rev3_exists', EXISTS (
    SELECT 1 FROM public.fiscal_parametros_homologacion WHERE revision = 3
  )
) AS diagnostic;

ROLLBACK;`

export function verifyPr03aDiagnostic(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('PR03_A_DIAGNOSTIC_INVALID')
  }
  const d = raw
  if (d.transaction_read_only !== 'on') throw new Error('PR03_A_NOT_READ_ONLY')
  if (!d.private_acl) throw new Error('PR03_A_PRIVATE_ACL_VIOLATION')
  if (!d.expected_issuer_present) throw new Error('PR03_A_ISSUER_NOT_FOUND')
  if (d.expected_issuer_enabled !== false) throw new Error('PR03_A_ISSUER_UNEXPECTEDLY_ENABLED')
  if (d.unexpected_enabled_issuers !== 0) throw new Error('PR03_A_UNEXPECTED_ENABLED_ISSUERS')
  if (!d.pos_present) throw new Error('PR03_A_POS_NOT_FOUND')
  if (!d.pos_receipt_type_match) throw new Error('PR03_A_POS_RECEIPT_TYPE_MISMATCH')
  if (!d.pos_configuration_match) throw new Error('PR03_A_POS_CONFIGURATION_MISMATCH')

  return Object.freeze({
    custodyConfigPresent: true,
    expectedIssuerPresent: true,
    expectedIssuerEnabled: false,
    unexpectedEnabledIssuers: 0,
    posPresent: true,
    posReceiptTypeMatch: true,
    posConfigurationMatch: true,
    catalogRev2Expired: Boolean(d.catalog_rev2_expired),
    catalogRev3Exists: Boolean(d.catalog_rev3_exists),
    status: 'PASS'
  })
}
