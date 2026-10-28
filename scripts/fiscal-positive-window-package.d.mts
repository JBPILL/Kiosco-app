export const POSITIVE_WINDOW_SCOPE: 'PRIMERA_VENTANA_POSITIVA_SIN_EMISION'
export interface PositiveWindowPackage {
  version: 1; projectRef: string; scope: string; config: Record<string, unknown>
  dataPlanSha256: string; activationSha256: string; closureSha256: string; verificationSha256: string; readOnlySqlSha256: string
  historySha256: string | null; commercialSha256: string | null; baselinePolicy: string; credentialId: string; taKeyId: string; secretNames: string[]
  runtimeFiles: Record<string, string>; requiresFreshPreflight: true; requiresExplicitGo: true; requiresExclusiveOperator: true
  automaticApproval: false; emissionEnabled: false; packageSha256: string
}
export function positiveWindowRuntimeFiles(): Record<string, string>
export function buildPositiveWindowPackage(input: { config: unknown; historySha256: string | null; commercialSha256: string | null; taKeyId: string }): Promise<Readonly<PositiveWindowPackage>>
export function validatePositiveWindowPackage(value: unknown, approvedHash: string, options?: { now?: number; execute?: boolean }): Promise<Readonly<PositiveWindowPackage>>
