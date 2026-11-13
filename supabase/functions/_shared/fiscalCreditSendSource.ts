import type { FiscalRepresentation } from './fiscalRepresentation.ts'
import type { FiscalCreditDraft } from './fiscalCreditDraft.ts'
import { validateFiscalCreditRequestRecord } from './fiscalCreditRequest.ts'
import type { FiscalCreditRequestRecord } from './fiscalCreditRequest.ts'
import { fiscalUuid, fiscalSha } from './fiscalReplacement.ts'
import { normalizeFiscalCuit } from './fiscalReconciliation.ts'

export interface FiscalCreditSendBinding {
 version: 1; entorno: 'HOMOLOGACION'; servicio: 'wsfe'; finalidad: 'ENVIO_NC'
 venta_id: string; operacion_origen_id: string; solicitud_id: string; propuesta_sha256: string; preparacion_sha256: string; solicitud_sha256: string
 reserva_id: string; revision_id: string; permiso_id: string; kiosco_id: string; usuario_id: string; actor_auth_id: string
 cuit_emisor: string; punto_venta: number; tipo_comprobante: 3 | 8 | 13; numero: number
 credencial_id: string; certificado_sha256: string; revision_emisor: number; revision_parametros: number; emision_habilitada: false
}
export interface FiscalCreditSendPermission {
 version: 1; estado: 'PERMISO_NC_VERIFICADO'; solicitud_id: string; reserva_id: string; solicitud_sha256: string; preparacion_sha256: string
 revision_id: string; permiso_id: string; actor_auth_id: string; vence_en: string; emision_habilitada: false
}
export interface FiscalCreditSendSource { cuerpo: Readonly<FiscalCreditRequestRecord>; permiso: Readonly<FiscalCreditSendPermission>; binding: Readonly<FiscalCreditSendBinding> }
const fail = (): never => { throw new Error('FISCAL_FUENTE_ENVIO_NC_INVALIDA') }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
 const row = value as Record<string, unknown>
 if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) return fail()
 return row
}
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
/** Forma cerrada de ENVIO_NC, nunca autoridad SQL/TA ni binding de factura. */
export function validateFiscalCreditSendBinding(input: unknown): Readonly<FiscalCreditSendBinding> {
 try {
  const b = object(structuredClone(input), ['version','entorno','servicio','finalidad','venta_id','operacion_origen_id','solicitud_id','propuesta_sha256','preparacion_sha256','solicitud_sha256','reserva_id','revision_id','permiso_id','kiosco_id','usuario_id','actor_auth_id','cuit_emisor','punto_venta','tipo_comprobante','numero','credencial_id','certificado_sha256','revision_emisor','revision_parametros','emision_habilitada'])
  if (b.version !== 1 || b.entorno !== 'HOMOLOGACION' || b.servicio !== 'wsfe' || b.finalidad !== 'ENVIO_NC' || b.emision_habilitada !== false
   || !fiscalUuid(b.venta_id) || !fiscalUuid(b.operacion_origen_id) || !fiscalUuid(b.solicitud_id) || !fiscalUuid(b.reserva_id) || !fiscalUuid(b.revision_id) || !fiscalUuid(b.permiso_id)
   || !fiscalUuid(b.kiosco_id) || !fiscalUuid(b.usuario_id) || !fiscalUuid(b.actor_auth_id) || !fiscalUuid(b.credencial_id)
   || !fiscalSha(b.propuesta_sha256) || !fiscalSha(b.preparacion_sha256) || !fiscalSha(b.solicitud_sha256) || !fiscalSha(b.certificado_sha256)
   || !positive(b.punto_venta) || b.punto_venta > 99998 || !positive(b.numero) || b.numero > 99999999 || !positive(b.revision_emisor) || !positive(b.revision_parametros)
   || b.tipo_comprobante !== 3 && b.tipo_comprobante !== 8 && b.tipo_comprobante !== 13) return fail()
  const cuit = normalizeFiscalCuit(b.cuit_emisor)
  if (cuit !== b.cuit_emisor) return fail()
  return Object.freeze({version:1,entorno:'HOMOLOGACION',servicio:'wsfe',finalidad:'ENVIO_NC',venta_id:b.venta_id,operacion_origen_id:b.operacion_origen_id,solicitud_id:b.solicitud_id,
   propuesta_sha256:b.propuesta_sha256,preparacion_sha256:b.preparacion_sha256,solicitud_sha256:b.solicitud_sha256,reserva_id:b.reserva_id,revision_id:b.revision_id,permiso_id:b.permiso_id,
   kiosco_id:b.kiosco_id,usuario_id:b.usuario_id,actor_auth_id:b.actor_auth_id,cuit_emisor:cuit,punto_venta:b.punto_venta,tipo_comprobante:b.tipo_comprobante,numero:b.numero,
   credencial_id:b.credencial_id,certificado_sha256:b.certificado_sha256,revision_emisor:b.revision_emisor,revision_parametros:b.revision_parametros,emision_habilitada:false})
 } catch { return fail() }
}
/** Reconstruye cuerpo/hash contra fuente original. Vigencia y consumo sólo SQL041/042. */
export async function validateFiscalCreditSendSource(input: unknown, source: Readonly<FiscalRepresentation>, draft: Readonly<FiscalCreditDraft>, actorAuthId: string): Promise<Readonly<FiscalCreditSendSource>> {
 try {
  const raw = object(structuredClone(input), ['cuerpo','permiso','binding']), original = structuredClone(source), proposal = structuredClone(draft)
  const b = validateFiscalCreditSendBinding(raw.binding)
  const p = object(raw.permiso, ['version','estado','solicitud_id','reserva_id','solicitud_sha256','preparacion_sha256','revision_id','permiso_id','actor_auth_id','vence_en','emision_habilitada'])
  if (!fiscalUuid(actorAuthId) || b.actor_auth_id !== actorAuthId || p.actor_auth_id !== actorAuthId || p.version !== 1 || p.estado !== 'PERMISO_NC_VERIFICADO' || p.emision_habilitada !== false
   || typeof p.vence_en !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(p.vence_en) || !Number.isFinite(Date.parse(p.vence_en))) return fail()
  for (const key of ['solicitud_id','reserva_id','solicitud_sha256','preparacion_sha256','revision_id','permiso_id'] as const) if (p[key] !== b[key]) return fail()
  const body = await validateFiscalCreditRequestRecord(raw.cuerpo, original, proposal), d = body.datos, r = d.solicitud
  const prepared = object(raw.cuerpo, ['preparacion','reserva','cuerpo']).preparacion
  if (!prepared || typeof prepared !== 'object' || Array.isArray(prepared)) return fail()
  const packet = prepared as Record<string, unknown>
  // Contexto ya validado por validateFiscalCreditRequestRecord; extraer sólo revisiones explícitas.
  const ctx = packet.contexto
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return fail()
  const context = ctx as Record<string, unknown>
  if (b.venta_id !== d.venta_id || b.operacion_origen_id !== d.operacion_origen_id || b.solicitud_id !== d.solicitud_id || b.propuesta_sha256 !== d.propuesta_sha256
   || b.preparacion_sha256 !== d.preparacion_sha256 || b.solicitud_sha256 !== body.sha256 || b.reserva_id !== d.reserva_id || b.cuit_emisor !== r.cuitEmisor
   || b.punto_venta !== r.puntoVenta || b.tipo_comprobante !== r.tipoComprobante || b.numero !== r.numero || b.revision_emisor !== context.revision_emisor || b.revision_parametros !== context.revision_parametros) return fail()
  const permission: FiscalCreditSendPermission = {version:1,estado:'PERMISO_NC_VERIFICADO',solicitud_id:b.solicitud_id,reserva_id:b.reserva_id,solicitud_sha256:b.solicitud_sha256,preparacion_sha256:b.preparacion_sha256,revision_id:b.revision_id,permiso_id:b.permiso_id,actor_auth_id:actorAuthId,vence_en:p.vence_en,emision_habilitada:false}
  return Object.freeze({cuerpo:body,permiso:Object.freeze(permission),binding:b})
 } catch { return fail() }
}
