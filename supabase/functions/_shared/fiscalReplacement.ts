import { parseFiscalJson } from './fiscalStrictJson.ts'
import { freezeFiscalRequest } from './fiscalReconciliation.ts'
import { verifyFiscalEmissionRequest } from './fiscalEmissionContract.ts'

export interface FiscalReplacementProposal { canonico: string; sha256: string }
export interface FiscalReplacement {
  operacion_id: string; sucesora_id: string; venta_id: string
  anterior_sha256: string; preparacion_sha256: string; sucesora_sha256: string
  numero: number; estado: 'SUSTITUIDA'; emision_habilitada: false
}
export const fiscalUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
export const fiscalSha = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)
const fail = (): never => { throw new Error('FISCAL_SUSTITUCION_NO_CONFIRMADA') }
function object(input: unknown, keys: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail()
  const value = input as Record<string, unknown>
  if (Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) return fail()
  return value
}
/** Forma/hash público. Snapshot, catálogo, emisor y serie se acreditan en SQL 018;
 * no se construye un contexto ficticio ni se reserva el número estructural. */
export async function validateFiscalReplacementProposal(input: unknown, sale: string): Promise<Readonly<FiscalReplacementProposal>> {
  const v = object(input, ['canonico', 'sha256'])
  if (!fiscalUuid(sale) || typeof v.canonico !== 'string' || new TextEncoder().encode(v.canonico).length > 60000 || !fiscalSha(v.sha256)) return fail()
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v.canonico)))
  if ([...bytes].map(b => b.toString(16).padStart(2, '0')).join('') !== v.sha256) return fail()
  const root = object(parseFiscalJson(v.canonico), ['version', 'venta_id', 'condicionEmisor', 'revision_parametros', 'datos'])
  if (root.version !== 1 || root.venta_id !== sale || !['MONOTRIBUTO', 'EXENTO', 'RESPONSABLE_INSCRIPTO'].includes(String(root.condicionEmisor))
    || !Number.isSafeInteger(root.revision_parametros) || Number(root.revision_parametros) < 1) return fail()
  const data = root.datos
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.hasOwn(data, 'numero')) return fail()
  const frozen = await freezeFiscalRequest({ ...data, numero: 1 })
  await verifyFiscalEmissionRequest(frozen)
  const { numero: _structuralOnly, ...body } = frozen.solicitud
  if (JSON.stringify({ version: 1, venta_id: sale, condicionEmisor: root.condicionEmisor, revision_parametros: root.revision_parametros, datos: body }) !== v.canonico) return fail()
  return Object.freeze({ canonico: v.canonico, sha256: v.sha256 })
}
export function validateFiscalReplacement(input: unknown, sale: string, operation: string): Readonly<FiscalReplacement> {
  const v = object(input, ['operacion_id', 'sucesora_id', 'venta_id', 'anterior_sha256', 'preparacion_sha256', 'sucesora_sha256', 'numero', 'estado', 'emision_habilitada'])
  if (!fiscalUuid(sale) || !fiscalUuid(operation) || v.venta_id !== sale || v.operacion_id !== operation
    || !fiscalUuid(v.sucesora_id) || v.sucesora_id === operation || ![v.anterior_sha256, v.preparacion_sha256, v.sucesora_sha256].every(fiscalSha)
    || !Number.isSafeInteger(v.numero) || Number(v.numero) < 1 || Number(v.numero) > 99999999 || v.estado !== 'SUSTITUIDA' || v.emision_habilitada !== false) return fail()
  return Object.freeze({ ...v }) as unknown as Readonly<FiscalReplacement>
}
