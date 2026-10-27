// Private stdin only. No network, filesystem inputs, exports or provisioning.
import { createPrivateFiscalCustody } from '../../supabase/functions/_shared/fiscalPrivateCustody.ts'
import { prepareWsaaRequest } from '../../supabase/functions/_shared/fiscalWsaaCms.ts'
import { normalizeFiscalCuit } from '../../supabase/functions/_shared/fiscalReconciliation.ts'

let inputBytes, input, secrets
let networkAttempts = 0
globalThis.fetch = async () => { networkAttempts++; throw Error('LOCAL_NETWORK_FORBIDDEN') }
try {
  if (process.argv.length !== 2) throw Error('INPUT_INVALID')
  const chunks = []
  let length = 0
  for await (const chunk of process.stdin) {
    length += chunk.length
    if (length > 220000) throw Error('INPUT_INVALID')
    chunks.push(chunk)
  }
  inputBytes = Buffer.concat(chunks)
  for (const chunk of chunks) chunk.fill(0)
  input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(inputBytes))
  const fields = ['certificate', 'encryptedKey', 'password', 'certificateSha256', 'cuit']
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== fields.length
    || fields.some(name => typeof input[name] !== 'string') || Object.keys(input).some(name => !fields.includes(name))
    || input.certificate.length > 100000 || input.encryptedKey.length > 100000 || input.password.length > 1024
    || !/^[0-9a-f]{64}$/.test(input.certificateSha256) || normalizeFiscalCuit(input.cuit) !== input.cuit) throw Error('INPUT_INVALID')
  if (input.password.length < 16) throw Error('PASSWORD_POLICY_NOT_MET')
  const credential = crypto.randomUUID()
  const prefix = 'ARCA_HOMO_CREDENTIAL_' + credential.replaceAll('-', '').toUpperCase()
  secrets = { SUPABASE_URL: 'https://acoyfwwmhaeruciyedri.supabase.co', [prefix + '_REVISION']: '1',
    [prefix + '_CERT_PEM']: input.certificate, [prefix + '_KEY_PEM']: input.encryptedKey, [prefix + '_PASSWORD']: input.password }
  const binding = { version: 1, entorno: 'HOMOLOGACION', servicio: 'wsfe', operacion_id: crypto.randomUUID(),
    kiosco_id: crypto.randomUUID(), usuario_id: crypto.randomUUID(), cuit_emisor: input.cuit, punto_venta: 2,
    credencial_id: credential, certificado_sha256: input.certificateSha256, revision: 1 }
  const material = await createPrivateFiscalCustody(name => secrets[name])(binding, new AbortController().signal)
  const cms = await prepareWsaaRequest(material, { credentialId: credential, certificateSha256: input.certificateSha256 })
  const subject = JSON.parse(cms.destination)
  if (!Array.isArray(subject) || subject.filter(pair => Array.isArray(pair) && pair[0] === 'SERIALNUMBER' && pair[1] === 'cuit ' + input.cuit).length !== 1
    || material.privateKey.extractable || networkAttempts !== 0) throw Error('IDENTITY_OR_NETWORK_INVALID')
  // Do not serialize signer, CMS, DN, credential IDs, PEMs or password.
  process.stdout.write(JSON.stringify({ status: 'CUSTODY_LOCAL_PASS', nonexportable: true, cmsVerified: true, subjectCuitMatches: true, networkAttempts: 0, secretsProvisioned: false }) + '\n')
} catch (error) {
  const code = error instanceof Error && error.message === 'PASSWORD_POLICY_NOT_MET' ? 'PASSWORD_POLICY_NOT_MET' : 'CUSTODY_LOCAL_NOT_CONFIRMED'
  process.stdout.write(JSON.stringify({ status: 'CUSTODY_LOCAL_FAIL', code, networkAttempts, secretsProvisioned: false }) + '\n')
  process.exitCode = 1
} finally {
  inputBytes?.fill(0)
  if (input && typeof input === 'object') { input.password = ''; input.encryptedKey = '' }
  if (secrets) for (const name of Object.keys(secrets)) secrets[name] = ''
  // Immutable JS strings cannot be guaranteed zeroized; process exits immediately.
}
