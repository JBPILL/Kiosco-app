import type { acquirePreparationSession } from './fiscal-preparation-session.mjs'
type ConnectedPrivateClient = Parameters<typeof acquirePreparationSession>[0] & { end(): Promise<void> }
// Private JS connector is used from the runtime entrypoint; no browser API.
export function connectPositiveWindowPostgres(input: { password: string; rootCertificate: string }, options?: {
  Client?: new (options: Record<string, unknown>) => ConnectedPrivateClient & { connect(): Promise<void> }
}): Promise<Readonly<{ client: ConnectedPrivateClient; observer: ConnectedPrivateClient; dispose(): Promise<void> }>>
