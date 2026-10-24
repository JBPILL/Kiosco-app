import { validateFiscalCreditDraftProposal } from './fiscalCreditDraft.ts'
import type { FiscalCreditDraft } from './fiscalCreditDraft.ts'
import type { FiscalRepresentation } from './fiscalRepresentation.ts'
import { fiscalSha } from './fiscalReplacement.ts'

export interface FiscalCreditContext {
  version: 1; entorno: 'HOMOLOGACION'; venta_id: string; operacion_origen_id: string; solicitud_id: string; propuesta_sha256: string
  checkout_sha256: string; fuente_comercial_sha256: string; unidades_sha256: string; cuit_emisor: string
  punto_venta: number; revision_emisor: number; revision_parametros: number; tipo_nota_credito: 3 | 8 | 13
  condiciones: readonly Readonly<{ id: number; descripcion: string; comprobantes: readonly number[] }>[]
  alicuotas: readonly Readonly<{ id: number; descripcion: string }>[]; emision_habilitada: false
}
const fail = (): never => { throw new Error('FISCAL_CONTEXTO_NC_NO_CONFIRMADO') }
function object(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail()
  const value = input as Record<string, unknown>
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) return fail()
  return value
}
function integer(value: unknown, maximum = 2147483647): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > maximum) return fail()
  return value
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || [...value].length > 120 || [...value].some(character => {
    const code = character.codePointAt(0)!
    return code < 32 || code >= 127 && code <= 159 || code >= 0xd800 && code <= 0xdfff
  })) return fail()
  return value
}
/** Contexto de preparación, nunca un permiso ni acreditación independiente del catálogo remoto. */
export async function validateFiscalCreditContext(input: unknown, source: Readonly<FiscalRepresentation>, draft: Readonly<FiscalCreditDraft>): Promise<Readonly<FiscalCreditContext>> {
  try {
    const original = structuredClone(source), proposal = structuredClone(draft)
    const value = object(structuredClone(input), ['version', 'entorno', 'venta_id', 'operacion_origen_id', 'solicitud_id', 'propuesta_sha256', 'checkout_sha256', 'fuente_comercial_sha256', 'unidades_sha256', 'cuit_emisor', 'punto_venta', 'revision_emisor', 'revision_parametros', 'tipo_nota_credito', 'condiciones', 'alicuotas', 'emision_habilitada'])
    const checked = await validateFiscalCreditDraftProposal(original, { canonico: proposal.canonico, sha256: proposal.sha256 })
    if (value.version !== 1 || value.entorno !== 'HOMOLOGACION' || value.venta_id !== checked.datos.origen.venta_id
      || value.operacion_origen_id !== checked.datos.origen.operacion_id || value.solicitud_id !== checked.datos.solicitud_id || value.propuesta_sha256 !== checked.sha256
      || value.cuit_emisor !== checked.datos.origen.cuit || value.tipo_nota_credito !== checked.datos.tipo_nota_credito || value.emision_habilitada !== false
      || !fiscalSha(value.checkout_sha256) || !fiscalSha(value.fuente_comercial_sha256) || !fiscalSha(value.unidades_sha256)
      || !Array.isArray(value.condiciones) || value.condiciones.length < 1 || value.condiciones.length > 100
      || !Array.isArray(value.alicuotas) || value.alicuotas.length > 100) return fail()
    let previous = 0
    const condiciones = value.condiciones.map(input => {
      const row = object(input, ['id', 'descripcion', 'comprobantes']), id = integer(row.id)
      if (id <= previous || !Array.isArray(row.comprobantes) || row.comprobantes.length < 1 || row.comprobantes.length > 3
        || row.comprobantes.some(id => id !== 3 && id !== 8 && id !== 13) || new Set(row.comprobantes).size !== row.comprobantes.length
        || !row.comprobantes.includes(checked.datos.tipo_nota_credito)) return fail()
      previous = id
      return Object.freeze({ id, descripcion: text(row.descripcion), comprobantes: Object.freeze(row.comprobantes.map(id => integer(id))) })
    })
    previous = 0
    const alicuotas = value.alicuotas.map(input => {
      const row = object(input, ['id', 'descripcion']), id = integer(row.id)
      if (id <= previous) return fail()
      previous = id
      return Object.freeze({ id, descripcion: text(row.descripcion) })
    })
    if (!condiciones.some(row => row.id === checked.datos.condicion_iva_receptor) || checked.datos.iva.some(row => !alicuotas.some(rate => rate.id === row.id))) return fail()
    return Object.freeze({ version: 1, entorno: 'HOMOLOGACION', venta_id: checked.datos.origen.venta_id, operacion_origen_id: checked.datos.origen.operacion_id,
      solicitud_id: checked.datos.solicitud_id, propuesta_sha256: checked.sha256, checkout_sha256: value.checkout_sha256,
      fuente_comercial_sha256: value.fuente_comercial_sha256, unidades_sha256: value.unidades_sha256, cuit_emisor: checked.datos.origen.cuit,
      punto_venta: integer(value.punto_venta, 99998), revision_emisor: integer(value.revision_emisor), revision_parametros: integer(value.revision_parametros),
      tipo_nota_credito: checked.datos.tipo_nota_credito, condiciones: Object.freeze(condiciones), alicuotas: Object.freeze(alicuotas), emision_habilitada: false })
  } catch { return fail() }
}
