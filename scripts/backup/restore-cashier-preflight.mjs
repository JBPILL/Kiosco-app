// Preflight session check for CASHIER role; secrets through stdin, never argv or files.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { loginRestoreHttpClient } from './restore-acceptance-http.mjs'

export const CASHIER_AUTH_ID = '7cc03499-a91f-4d9b-b1b8-0c37b9d3dfea'
export const CASHIER_EMAIL = 'prueba2@example.test'

export async function runCashierSessionPreflight(credentials, request) {
  if (typeof request !== 'function') throw Error('CASHIER_PREFLIGHT_REQUEST_REQUIRED')
  const { publicKey, email, password } = credentials ?? {}
  if (typeof email !== 'string' || email.trim().toLowerCase() !== CASHIER_EMAIL) {
    throw Error('CASHIER_EMAIL_MISMATCH')
  }
  const client = await loginRestoreHttpClient({
    publicKey,
    email: email.trim().toLowerCase(),
    password,
    authId: CASHIER_AUTH_ID,
    role: 'CASHIER',
    allowMutations: false
  }, request)

  await client.logoutLocal()
  return 'CASHIER_SESSION_PREFLIGHT = PASS'
}

const isEntryFile = () => {
  try {
    return Boolean(process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)))
  } catch {
    return false
  }
}

if (isEntryFile()) {
  let text = '', credentials
  try {
    if (process.platform !== 'win32') throw Error('Windows')
    for await (const part of process.stdin) {
      text += part
      if (Buffer.byteLength(text) > 65536) throw Error('Input')
    }
    credentials = JSON.parse(text)
    text = ''
    const result = await runCashierSessionPreflight(credentials, globalThis.fetch)
    console.log(result)
  } catch {
    process.exitCode = 1
  } finally {
    credentials = null
    text = ''
  }
}
