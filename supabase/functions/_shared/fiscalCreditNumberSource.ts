import { fiscalUuid, fiscalSha } from './fiscalReplacement.ts'
import type { FiscalRepresentation } from './fiscalRepresentation.ts'
import type { FiscalCreditDraft } from './fiscalCreditDraft.ts'
import { validateFiscalCreditPreparationRecord } from './fiscalCreditPreparation.ts'
import type { FiscalCreditPreparationRecord } from './fiscalCreditPreparation.ts'
import { normalizeFiscalCuit } from './fiscalReconciliation.ts'

/** Deliberadamente distinto de FiscalWorkerBinding: no contiene operacion_id de factura. */
export interface FiscalCreditNumberBinding {
  version: 1; entorno: 'HOMOLOGACION'; servicio: 'wsfe'; finalidad: 'NUMERACION_NC'
  venta_id: string; operacion_origen_id: string; solicitud_id: string; propuesta_sha256: string; preparacion_sha256: string
  kiosco_id: string; usuario_id: string; actor_auth_id: string; cuit_emisor: string; punto_venta: number; tipo_comprobante: 3 | 8 | 13
  credencial_id: string; certificado_sha256: string; revision_emisor: number; revision_parametros: number; emision_habilitada: false
}
export interface FiscalCreditNumberSource { preparacion: Readonly<FiscalCreditPreparationRecord>; binding: Readonly<FiscalCreditNumberBinding> }
const fail = (): never => { throw new Error('FISCAL_FUENTE_NUMERACION_NC_INVALIDA') }
/** Sólo forma de metadata privada; SQL039 verifica propiedad/autoridad actuales. */
export function validateFiscalCreditNumberBinding(input: unknown): Readonly<FiscalCreditNumberBinding> {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail()
    const b = input as Record<string, unknown>, keys = ['version', 'entorno', 'servicio', 'finalidad', 'venta_id', 'operacion_origen_id', 'solicitud_id', 'propuesta_sha256', 'preparacion_sha256', 'kiosco_id', 'usuario_id', 'actor_auth_id', 'cuit_emisor', 'punto_venta', 'tipo_comprobante', 'credencial_id', 'certificado_sha256', 'revision_emisor', 'revision_parametros', 'emision_habilitada']
    const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    if (Object.keys(b).length !== keys.length || keys.some(key => !Object.hasOwn(b, key)) || b.version !== 1 || b.entorno !== 'HOMOLOGACION' || b.servicio !== 'wsfe'
      || b.finalidad !== 'NUMERACION_NC' || b.emision_habilitada !== false || !fiscalUuid(b.venta_id) || !fiscalUuid(b.operacion_origen_id) || !fiscalUuid(b.solicitud_id)
      || !fiscalUuid(b.kiosco_id) || !fiscalUuid(b.usuario_id) || !fiscalUuid(b.actor_auth_id) || !fiscalUuid(b.credencial_id)
      || !fiscalSha(b.propuesta_sha256) || !fiscalSha(b.preparacion_sha256) || !fiscalSha(b.certificado_sha256)
      || !positive(b.punto_venta) || b.punto_venta > 99998 || !positive(b.revision_emisor) || !positive(b.revision_parametros)
      || b.tipo_comprobante !== 3 && b.tipo_comprobante !== 8 && b.tipo_comprobante !== 13) return fail()
    return Object.freeze({ version: 1, entorno: 'HOMOLOGACION', servicio: 'wsfe', finalidad: 'NUMERACION_NC', venta_id: b.venta_id, operacion_origen_id: b.operacion_origen_id,
      solicitud_id: b.solicitud_id, propuesta_sha256: b.propuesta_sha256, preparacion_sha256: b.preparacion_sha256, kiosco_id: b.kiosco_id, usuario_id: b.usuario_id,
      actor_auth_id: b.actor_auth_id, cuit_emisor: normalizeFiscalCuit(b.cuit_emisor), punto_venta: b.punto_venta, tipo_comprobante: b.tipo_comprobante,
      credencial_id: b.credencial_id, certificado_sha256: b.certificado_sha256, revision_emisor: b.revision_emisor, revision_parametros: b.revision_parametros, emision_habilitada: false })
  } catch { return fail() }
}
/** Forma/enlace de metadata privada038, no JWT, permiso de TA ni vigencia futura. */
export async function validateFiscalCreditNumberSource(input: unknown, source: Readonly<FiscalRepresentation>, draft: Readonly<FiscalCreditDraft>, actorAuthId: string, preparationSha: string): Promise<Readonly<FiscalCreditNumberSource>> {
  try {
    const raw: unknown = structuredClone(input), original = structuredClone(source), proposal = structuredClone(draft)
    if (!fiscalUuid(actorAuthId) || !fiscalSha(preparationSha) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return fail()
    const value = raw as Record<string, unknown>
    if (Object.keys(value).length !== 2 || !Object.hasOwn(value, 'preparacion') || !Object.hasOwn(value, 'binding') || !value.binding || typeof value.binding !== 'object' || Array.isArray(value.binding)) return fail()
    const b = value.binding as Record<string, unknown>, keys = ['version', 'entorno', 'servicio', 'finalidad', 'venta_id', 'operacion_origen_id', 'solicitud_id', 'propuesta_sha256', 'preparacion_sha256', 'kiosco_id', 'usuario_id', 'actor_auth_id', 'cuit_emisor', 'punto_venta', 'tipo_comprobante', 'credencial_id', 'certificado_sha256', 'revision_emisor', 'revision_parametros', 'emision_habilitada']
    if (Object.keys(b).length !== keys.length || keys.some(key => !Object.hasOwn(b, key)) || b.version !== 1 || b.entorno !== 'HOMOLOGACION'
      || b.servicio !== 'wsfe' || b.finalidad !== 'NUMERACION_NC' || b.emision_habilitada !== false || b.actor_auth_id !== actorAuthId
      || !fiscalUuid(b.kiosco_id) || !fiscalUuid(b.usuario_id) || !fiscalUuid(b.credencial_id) || !fiscalSha(b.certificado_sha256)) return fail()
    const prepared = await validateFiscalCreditPreparationRecord(value.preparacion, original, proposal), data = prepared.preparacion.datos
    if (prepared.estado !== 'DATOS_NC_PREPARADOS' || prepared.preparacion.sha256 !== preparationSha || b.preparacion_sha256 !== preparationSha
      || b.venta_id !== data.venta_id || b.operacion_origen_id !== data.operacion_origen_id || b.solicitud_id !== data.solicitud_id || b.propuesta_sha256 !== data.propuesta_sha256
      || b.cuit_emisor !== data.datos.cuitEmisor || b.punto_venta !== data.datos.puntoVenta || b.tipo_comprobante !== data.datos.tipoComprobante
      || b.revision_emisor !== data.revision_emisor || b.revision_parametros !== data.revision_parametros) return fail()
    const binding: FiscalCreditNumberBinding = { version: 1, entorno: 'HOMOLOGACION', servicio: 'wsfe', finalidad: 'NUMERACION_NC',
      venta_id: data.venta_id, operacion_origen_id: data.operacion_origen_id, solicitud_id: data.solicitud_id, propuesta_sha256: data.propuesta_sha256,
      preparacion_sha256: preparationSha, kiosco_id: b.kiosco_id, usuario_id: b.usuario_id, actor_auth_id: actorAuthId,
      cuit_emisor: data.datos.cuitEmisor, punto_venta: data.datos.puntoVenta, tipo_comprobante: data.datos.tipoComprobante,
      credencial_id: b.credencial_id, certificado_sha256: b.certificado_sha256, revision_emisor: data.revision_emisor, revision_parametros: data.revision_parametros, emision_habilitada: false }
    return Object.freeze({ preparacion: prepared, binding: Object.freeze(binding) })
  } catch { return fail() }
}
