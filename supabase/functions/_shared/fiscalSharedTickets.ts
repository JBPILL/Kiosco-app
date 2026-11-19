import type { FiscalRpc } from './fiscalPersistence.ts'
import { encryptFiscalTicket, decryptFiscalTicket, validateFiscalTicketKey } from './fiscalTicketCipher.ts'
import type { FiscalTicketCipherContext } from './fiscalTicketCipher.ts'
import type { WsaaTicketEnvelope, WsaaTicketLoader } from './fiscalTicketCache.ts'
import type { FiscalWorkerBinding } from './fiscalWorkerAuthorization.ts'
import type { GuardedWsaaTicketLoader } from './fiscalWsaa.ts'

export interface FiscalTicketKeys {
  active:()=>Promise<{id:string;key:CryptoKey}>
  read:(id:string)=>Promise<CryptoKey>
}
const fail=():never=>{throw new Error('FISCAL_TICKET_COMPARTIDO_NO_CONFIRMADO')}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
function envelope(b:Readonly<FiscalWorkerBinding>,ta:{token:string;sign:string;expiresAt:number}):WsaaTicketEnvelope {
  return Object.freeze(Object.defineProperties({entorno:'HOMOLOGACION',servicio:'wsfe',cuitEmisor:b.cuit_emisor,
    credencialId:b.credencial_id,certificadoSha256:b.certificado_sha256,expiresAt:ta.expiresAt},{
    token:{value:ta.token,enumerable:false},sign:{value:ta.sign,enumerable:false},
  })) as WsaaTicketEnvelope
}
/** Fuente para la caché local, después del gate Auth/tenant. SQL comparte sólo
 * sobres cifrados. Ante renovación incierta no libera/reintenta por timeout.
 * Custodia real de clave de cifrado y certificado/CMS todavía debe provisionarse. */
export function createSharedFiscalTicketLoader(db:FiscalRpc,keys:FiscalTicketKeys,wsaa:GuardedWsaaTicketLoader):WsaaTicketLoader {
  return async(binding,signal)=>{
    let cancelPrepared:(()=>Promise<void>)|undefined,sendAttempted=false
    try {
      if(signal.aborted)return fail()
      const id=crypto.randomUUID(),args={p_operacion_id:binding.operacion_id,p_credencial_id:binding.credencial_id,
        p_huella:binding.certificado_sha256,p_revision:binding.revision}
      const context:FiscalTicketCipherContext={projectRef:'acoyfwwmhaeruciyedri',entorno:'HOMOLOGACION',servicio:'wsfe',certificadoSha256:binding.certificado_sha256}
      async function call(name:string,params:Record<string,unknown>):Promise<Record<string,unknown>> {
        const result=await db.rpc(name,params)
        if(result.error||!result.data||typeof result.data!=='object'||Array.isArray(result.data))return fail()
        return result.data as Record<string,unknown>
      }
      const grant=await call('solicitar_ta_homologacion',{...args,p_intento_id:id})
      if(grant.estado==='DISPONIBLE'&&grant.nuevo_intento===false){
        const cipher=grant.cifrado as Record<string,unknown>|null
        if(!cipher||!uuid(cipher.keyId))return fail()
        const key=await keys.read(cipher.keyId)
        return envelope(binding,await decryptFiscalTicket(cipher,context,key,cipher.keyId))
      }
      if(grant.estado!=='RENOVAR'||grant.nuevo_intento!==true||grant.intento_id!==id
        ||!Number.isSafeInteger(grant.revision)||Number(grant.revision)<1)return fail()
      const lease={...args,p_intento_id:id,p_generacion:grant.revision}
      cancelPrepared=async()=>{await call('cancelar_preparacion_ta_homologacion',lease)}
      if(signal.aborted)return fail()
      const key=await keys.active()
      validateFiscalTicketKey(context,key.key,key.id)
      if(signal.aborted)return fail()
      let sendAuthorized=false
      const ta=await wsaa(binding,signal,async()=>{
        if(sendAttempted||signal.aborted)return fail()
        // Se conserva incertidumbre incluso si se pierde el ACK de esta RPC.
        sendAttempted=true
        const ack=await call('iniciar_envio_ta_homologacion',lease)
        if(ack.estado!=='ENVIO_INCIERTO'||ack.nuevo_envio!==true||ack.intento_id!==id||ack.revision!==grant.revision)return fail()
        sendAuthorized=true
      })
      if(!sendAuthorized||ta.entorno!==binding.entorno||ta.servicio!==binding.servicio||ta.cuitEmisor!==binding.cuit_emisor
        ||ta.credencialId!==binding.credencial_id||ta.certificadoSha256!==binding.certificado_sha256)return fail()
      // Si llegó TA válido después de abortar al consumidor, conservar el sobre
      // evita perderlo y volver a pedir uno. No vuelve a llamar a WSAA.
      const cipher=await encryptFiscalTicket(ta,context,key.key,key.id)
      const saved=await call('confirmar_ta_homologacion',{...args,p_intento_id:id,p_generacion:grant.revision,p_cifrado:cipher})
      if(saved.estado!=='DISPONIBLE'||saved.intento_id!==id||saved.revision!==grant.revision
        ||typeof saved.cifrado_sha256!=='string'||!/^[0-9a-f]{64}$/.test(saved.cifrado_sha256))return fail()
      return envelope(binding,ta)
    }catch{
      // Sólo una preparación que no solicitó permiso de envío puede liberarse.
      // SQL decide por CAS; no se cancela una solicitud que pudo llegar a WSAA.
      if(cancelPrepared&&!sendAttempted)await cancelPrepared().catch(()=>{})
      return fail()
    }
  }
}
