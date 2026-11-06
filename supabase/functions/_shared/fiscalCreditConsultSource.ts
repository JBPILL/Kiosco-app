import type { FiscalRepresentation } from './fiscalRepresentation.ts'
import type { FiscalCreditDraft } from './fiscalCreditDraft.ts'
import { validateFiscalCreditRequestRecord } from './fiscalCreditRequest.ts'
import type { FiscalCreditRequestRecord } from './fiscalCreditRequest.ts'
import { fiscalUuid, fiscalSha } from './fiscalReplacement.ts'
import { normalizeFiscalCuit } from './fiscalReconciliation.ts'

export interface FiscalCreditConsultBinding {
 version: 1; entorno: 'HOMOLOGACION'; servicio: 'wsfe'; finalidad: 'CONSULTA_NC'
 venta_id: string; operacion_origen_id: string; solicitud_id: string; propuesta_sha256: string; preparacion_sha256: string; solicitud_sha256: string
 intento_id:string; reserva_id: string; revision_id: string; permiso_id: string; kiosco_id: string; usuario_id: string; actor_auth_id: string
 cuit_emisor: string; punto_venta: number; tipo_comprobante: 3 | 8 | 13; numero: number
 credencial_id: string; certificado_sha256: string; revision_emisor: number; revision_parametros: number; emision_habilitada: false
}
export interface FiscalCreditConsultIntent {
 version:1; estado:'ENVIO_INCIERTO'; solicitud_id:string; operacion_origen_id:string; intento_id:string; permiso_id:string; revision_id:string; reserva_id:string
 propuesta_sha256:string; preparacion_sha256:string; solicitud_sha256:string; actor_auth_id:string; nuevo_envio:false; emision_habilitada:false
}
export interface FiscalCreditConsultSource { cuerpo:Readonly<FiscalCreditRequestRecord>; intencion:Readonly<FiscalCreditConsultIntent>; binding:Readonly<FiscalCreditConsultBinding> }
const fail = (): never => { throw new Error('FISCAL_FUENTE_CONSULTA_NC_INVALIDA') }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
 const row = value as Record<string, unknown>
 if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) return fail()
 return row
}
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
/** Forma cerrada de CONSULTA_NC, nunca autoridad SQL/TA ni binding de factura. */
export function validateFiscalCreditConsultBinding(input: unknown): Readonly<FiscalCreditConsultBinding> {
 try {
  const b = object(structuredClone(input), ['version','entorno','servicio','finalidad','venta_id','operacion_origen_id','solicitud_id','propuesta_sha256','preparacion_sha256','solicitud_sha256','intento_id','reserva_id','revision_id','permiso_id','kiosco_id','usuario_id','actor_auth_id','cuit_emisor','punto_venta','tipo_comprobante','numero','credencial_id','certificado_sha256','revision_emisor','revision_parametros','emision_habilitada'])
  if (b.version !== 1 || b.entorno !== 'HOMOLOGACION' || b.servicio !== 'wsfe' || b.finalidad !== 'CONSULTA_NC' || b.emision_habilitada !== false
   || !fiscalUuid(b.intento_id) || !fiscalUuid(b.venta_id) || !fiscalUuid(b.operacion_origen_id) || !fiscalUuid(b.solicitud_id) || !fiscalUuid(b.reserva_id) || !fiscalUuid(b.revision_id) || !fiscalUuid(b.permiso_id)
   || !fiscalUuid(b.kiosco_id) || !fiscalUuid(b.usuario_id) || !fiscalUuid(b.actor_auth_id) || !fiscalUuid(b.credencial_id)
   || !fiscalSha(b.propuesta_sha256) || !fiscalSha(b.preparacion_sha256) || !fiscalSha(b.solicitud_sha256) || !fiscalSha(b.certificado_sha256)
   || !positive(b.punto_venta) || b.punto_venta > 99998 || !positive(b.numero) || b.numero > 99999999 || !positive(b.revision_emisor) || !positive(b.revision_parametros)
   || b.tipo_comprobante !== 3 && b.tipo_comprobante !== 8 && b.tipo_comprobante !== 13) return fail()
  const cuit = normalizeFiscalCuit(b.cuit_emisor)
  if (cuit !== b.cuit_emisor) return fail()
  return Object.freeze({version:1,entorno:'HOMOLOGACION',servicio:'wsfe',finalidad:'CONSULTA_NC',venta_id:b.venta_id,operacion_origen_id:b.operacion_origen_id,solicitud_id:b.solicitud_id,
   propuesta_sha256:b.propuesta_sha256,preparacion_sha256:b.preparacion_sha256,solicitud_sha256:b.solicitud_sha256,intento_id:b.intento_id,reserva_id:b.reserva_id,revision_id:b.revision_id,permiso_id:b.permiso_id,
   kiosco_id:b.kiosco_id,usuario_id:b.usuario_id,actor_auth_id:b.actor_auth_id,cuit_emisor:cuit,punto_venta:b.punto_venta,tipo_comprobante:b.tipo_comprobante,numero:b.numero,
   credencial_id:b.credencial_id,certificado_sha256:b.certificado_sha256,revision_emisor:b.revision_emisor,revision_parametros:b.revision_parametros,emision_habilitada:false})
 } catch { return fail() }
}
/** Reconstruye cuerpo/hash contra fuente original. No acredita custodia actual: SQL045 debe revalidar antes de claves/red. */
export async function validateFiscalCreditConsultSource(input: unknown, source: Readonly<FiscalRepresentation>, draft: Readonly<FiscalCreditDraft>, actorAuthId: string): Promise<Readonly<FiscalCreditConsultSource>> {
 try {
  const raw = object(structuredClone(input), ['cuerpo','intencion','binding']), original = structuredClone(source), proposal = structuredClone(draft)
  const b = validateFiscalCreditConsultBinding(raw.binding)
  const p=object(raw.intencion,['version','estado','solicitud_id','operacion_origen_id','intento_id','permiso_id','revision_id','reserva_id','propuesta_sha256','preparacion_sha256','solicitud_sha256','actor_auth_id','nuevo_envio','emision_habilitada'])
  if(!fiscalUuid(actorAuthId)||b.actor_auth_id!==actorAuthId||p.actor_auth_id!==actorAuthId||p.version!==1||p.estado!=='ENVIO_INCIERTO'||p.nuevo_envio!==false||p.emision_habilitada!==false) return fail()
  for(const key of ['solicitud_id','operacion_origen_id','intento_id','permiso_id','revision_id','reserva_id','propuesta_sha256','preparacion_sha256','solicitud_sha256'] as const)if(p[key]!==b[key])return fail()
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
  const intention:FiscalCreditConsultIntent={version:1,estado:'ENVIO_INCIERTO',solicitud_id:b.solicitud_id,operacion_origen_id:b.operacion_origen_id,intento_id:b.intento_id,permiso_id:b.permiso_id,revision_id:b.revision_id,reserva_id:b.reserva_id,propuesta_sha256:b.propuesta_sha256,preparacion_sha256:b.preparacion_sha256,solicitud_sha256:b.solicitud_sha256,actor_auth_id:actorAuthId,nuevo_envio:false,emision_habilitada:false}
  return Object.freeze({cuerpo:body,intencion:Object.freeze(intention),binding:b})
 } catch { return fail() }
}
