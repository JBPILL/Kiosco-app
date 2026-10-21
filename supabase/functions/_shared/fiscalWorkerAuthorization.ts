import type { FiscalRpc } from './fiscalPersistence.ts'

export interface FiscalWorkerBinding {
  version: 1
  entorno: 'HOMOLOGACION'
  servicio: 'wsfe'
  operacion_id: string
  kiosco_id: string
  usuario_id: string
  cuit_emisor: string
  punto_venta: number
  credencial_id: string
  certificado_sha256: string
  revision: number
}
/** Cliente privado configurado por el servidor. getUser debe verificar el JWT
 * contra Auth; nunca sustituirlo por decodificar claims del request. */
export interface FiscalAuthClient extends FiscalRpc {
  auth: { getUser(token: string): Promise<{data:{user:{id:string}|null};error:unknown}> }
}
const denied = (): never => {throw new Error('FISCAL_CONSULTA_NO_AUTORIZADA')}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
/** Revalida en DB antes de tocar custodia/TA. Metadatos privados, no respuesta UI.
 * No concede autorización de emisión ni acredita un punto de venta ante ARCA. */
export async function authorizeFiscalWorker(
  admin: FiscalAuthClient, bearerToken: string, operationId: string,
): Promise<Readonly<FiscalWorkerBinding>> {
  if(!uuid(operationId)||typeof bearerToken!=='string'||bearerToken.length>16384||!/^\S+$/.test(bearerToken))return denied()
  try {
    const auth=await admin.auth.getUser(bearerToken)
    if(auth.error||!uuid(auth.data.user?.id))return denied()
    const result=await admin.rpc('autorizar_consulta_fiscal_homologacion',{
      p_actor_auth_id:auth.data.user.id,p_operacion_id:operationId,
    })
    if(result.error||!result.data||typeof result.data!=='object'||Array.isArray(result.data))return denied()
    const b=result.data as Record<string,unknown>
    const fields=['version','entorno','servicio','operacion_id','kiosco_id','usuario_id','cuit_emisor','punto_venta','credencial_id','certificado_sha256','revision']
    if(Object.keys(b).length!==fields.length||Object.keys(b).some(key=>!fields.includes(key))
      ||b.version!==1||b.entorno!=='HOMOLOGACION'||b.servicio!=='wsfe'||b.operacion_id!==operationId
      ||!uuid(b.kiosco_id)||!uuid(b.usuario_id)||!uuid(b.credencial_id)
      ||typeof b.cuit_emisor!=='string'||!/^\d{11}$/.test(b.cuit_emisor)
      ||!Number.isSafeInteger(b.punto_venta)||Number(b.punto_venta)<1||Number(b.punto_venta)>99999
      ||typeof b.certificado_sha256!=='string'||!/^[0-9a-f]{64}$/.test(b.certificado_sha256)
      ||!Number.isSafeInteger(b.revision)||Number(b.revision)<1)return denied()
    return Object.freeze({...b}) as unknown as Readonly<FiscalWorkerBinding>
  } catch {return denied()}
}
