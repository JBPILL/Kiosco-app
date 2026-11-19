import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import { fiscalUuid, fiscalSha, validateFiscalReplacement, validateFiscalReplacementProposal } from './fiscalReplacement.ts'
import type { FiscalReplacement } from './fiscalReplacement.ts'
const fail = (): never => { throw new Error('FISCAL_SUSTITUCION_NO_CONFIRMADA') }
async function actor(admin: FiscalAuthClient, token: string, sale: string, op: string): Promise<string> {
  if (!fiscalUuid(sale) || !fiscalUuid(op) || typeof token !== 'string' || token.length > 16384 || !/^\S+$/.test(token)) return fail()
  const auth = await admin.auth.getUser(token), id = auth.data.user?.id
  if (auth.error || !fiscalUuid(id)) return fail()
  return id
}
async function read(admin: FiscalAuthClient, id: string, sale: string, op: string): Promise<Readonly<FiscalReplacement> | null> {
  const response = await admin.rpc('consultar_sustitucion_fiscal_homologacion', { p_actor_auth_id: id, p_venta_id: sale, p_operacion_id: op })
  if (response.error) return fail()
  return response.data === null ? null : validateFiscalReplacement(response.data, sale, op)
}
export async function loadFiscalReplacement(admin: FiscalAuthClient, token: string, sale: string, op: string): Promise<Readonly<FiscalReplacement> | null> {
  try { return await read(admin, await actor(admin, token, sale, op), sale, op) } catch { return fail() }
}
/** Sin TA/red fiscal. Un ACK de escritura nunca sustituye la lectura durable. */
export async function replaceFiscalPreparation(admin: FiscalAuthClient, token: string, sale: string, op: string, successor: string, previousHash: string, proposal: unknown): Promise<Readonly<FiscalReplacement>> {
  try {
    if (!fiscalUuid(successor) || successor === op || !fiscalSha(previousHash)) return fail()
    const value = await validateFiscalReplacementProposal(proposal, sale)
    const id = await actor(admin, token, sale, op)
    try { await admin.rpc('sustituir_reserva_fiscal_homologacion', { p_actor_auth_id: id, p_venta_id: sale, p_operacion_id: op,
      p_sucesora_id: successor, p_anterior_sha: previousHash, p_canonico: value.canonico, p_sha: value.sha256 }) } catch { /* Leer el mismo cierre tras respuesta perdida. */ }
    const result = await read(admin, id, sale, op)
    if (!result || result.sucesora_id !== successor || result.anterior_sha256 !== previousHash || result.preparacion_sha256 !== value.sha256) return fail()
    return result
  } catch { return fail() }
}
