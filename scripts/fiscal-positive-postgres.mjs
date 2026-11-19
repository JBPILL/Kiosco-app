// Only the explicitly invoked private operator may call this connector.
// Never reads .env, credentials files, connection URLs or process arguments.
import pg from 'pg'
const host = 'aws-1-sa-east-1.pooler.supabase.com'
export async function connectPositiveWindowPostgres({ password, rootCertificate }, { Client = pg.Client } = {}) {
  if (typeof password !== 'string' || !password || password.length > 4096
    || typeof rootCertificate !== 'string' || rootCertificate.length > 65536
    || !rootCertificate.includes('-----BEGIN CERTIFICATE-----') || !rootCertificate.includes('-----END CERTIFICATE-----')
    || rootCertificate.includes('PRIVATE KEY') || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw Error('WINDOW_POSTGRES_INPUT_REJECTED')
  const clients = []
  try {
    for (const role of ['writer','observer']) {
      const client = new Client({ host, port: 5432, database: 'postgres', user: 'postgres.acoyfwwmhaeruciyedri', password,
        ssl: { rejectUnauthorized: true, ca: rootCertificate, servername: host },
        application_name: 'kioskopos-positive-window-'+role, connectionTimeoutMillis: 10000,
        query_timeout: 20000, statement_timeout: 15000, idle_in_transaction_session_timeout: 20000 })
      clients.push(client)
      client.on('error', () => { /* Connection diagnostics are never printed or persisted. Lease checks fail closed. */ })
      await client.connect()
    }
    let disposed = false
    return Object.freeze({ client: clients[0], observer: clients[1],
      async dispose() {
        if (disposed) return
        disposed = true
        const results = await Promise.allSettled(clients.map(client => client.end()))
        if (results.some(result => result.status === 'rejected')) throw Error('WINDOW_POSTGRES_CLOSE_NOT_CONFIRMED')
      } })
  } catch {
    await Promise.allSettled(clients.map(client => client.end()))
    throw Error('WINDOW_POSTGRES_CONNECTION_NOT_CONFIRMED')
  }
}
