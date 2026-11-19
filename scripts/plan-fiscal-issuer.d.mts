export interface InactiveIssuerProposal {
  version: 1; projectRef: string; mode: string; kioskId: string; ownerAuthId: string;
  cuitEmisor: string; puntoVenta: number; credentialId: string; certificateSha256: string;
  revision: 1; enabled: false; custodyPlanSha256: string; custodyEvidenceSha256: string;
  custodyMetadataObservedAt: string; liveTargetPreflightRequired: true;
  createdAt: string; expiresAt: string; sqlExecuted: false; representationVerified: false;
  voucherIssuanceAccepted: false; fiscalDataSelected: false; planSha256: string; sqlSha256: string;
}
export function planInactiveFiscalIssuer(input: unknown): {manifest: InactiveIssuerProposal; sql: string}
