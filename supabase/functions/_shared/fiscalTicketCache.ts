import type { FiscalWorkerBinding } from './fiscalWorkerAuthorization.ts'

export interface PrivateWsaaTicket { readonly token:string; readonly sign:string; readonly expiresAt:number }
export interface WsaaTicketEnvelope extends PrivateWsaaTicket {
  entorno:'HOMOLOGACION'; servicio:'wsfe'; cuitEmisor:string; credencialId:string; certificadoSha256:string
}
export type WsaaTicketLoader=(binding:Readonly<FiscalWorkerBinding>,signal:AbortSignal)=>Promise<WsaaTicketEnvelope>
interface Entry { ticket?:PrivateWsaaTicket; pending?:Promise<PrivateWsaaTicket>; expiresAt:number }
const fail=():never=>{throw new Error('FISCAL_TICKET_NO_DISPONIBLE')}
const uuid=(value:unknown):boolean=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
/** Una instancia por proceso/proyecto; no guarda en DB, disco, browser ni logs.
 * Exclusión sólo en este proceso. Varios workers requieren coordinación privada
 * de renovación adicional antes de habilitar el servicio hospedado. */
export function createFiscalTicketCache(options: {now?:()=>number;timeoutMs?:number;capacity?:number} = {}): {
  get:(binding:Readonly<FiscalWorkerBinding>,load:WsaaTicketLoader)=>Promise<PrivateWsaaTicket>
} {
  const now=options.now??Date.now,timeoutMs=options.timeoutMs??15000,capacity=options.capacity??32
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>40000||!Number.isSafeInteger(capacity)||capacity<1||capacity>128)return fail()
  const entries=new Map<string,Entry>()
  return {async get(binding,load){
    const b=Object.freeze({...binding}),time=now()
    if(!Number.isSafeInteger(time)||b.version!==1||b.entorno!=='HOMOLOGACION'||b.servicio!=='wsfe'
      ||typeof b.certificado_sha256!=='string'||!/^[0-9a-f]{64}$/.test(b.certificado_sha256)
      ||!uuid(b.credencial_id)||!uuid(b.kiosco_id)
      ||typeof b.cuit_emisor!=='string'||!/^\d{11}$/.test(b.cuit_emisor)
      ||!Number.isSafeInteger(b.revision)||b.revision<1||!Number.isSafeInteger(b.punto_venta)||b.punto_venta<1||b.punto_venta>99999)return fail()
    const key=JSON.stringify([b.kiosco_id,b.entorno,b.servicio,b.cuit_emisor,b.punto_venta,b.credencial_id,b.certificado_sha256,b.revision])
    const existing=entries.get(key)
    if(existing?.pending)return existing.pending
    if(existing?.ticket&&existing.expiresAt>time+60000)return existing.ticket
    for(const [id,entry] of entries)if(!entry.pending&&entry.expiresAt<=time+60000)entries.delete(id)
    if(entries.size>=capacity)return fail()
    const entry:Entry={expiresAt:0},controller=new AbortController()
    entries.set(key,entry)
    let timedOut=false,timer:ReturnType<typeof setTimeout>|undefined
    const source=Promise.resolve().then(()=>load(b,controller.signal))
    const validated=source.then(value=>{
      if(timedOut)return fail()
      const current=now()
      if(value.entorno!==b.entorno||value.servicio!==b.servicio||value.cuitEmisor!==b.cuit_emisor
        ||value.credencialId!==b.credencial_id||value.certificadoSha256!==b.certificado_sha256
        ||!Number.isSafeInteger(current)||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<=current+60000
        ||typeof value.token!=='string'||typeof value.sign!=='string'
        ||!value.token.length||!value.sign.length||value.token.length>262144||value.sign.length>262144
        ||!/^[\x09\x0A\x0D\x20-\x7E]+$/.test(value.token)||!/^[\x09\x0A\x0D\x20-\x7E]+$/.test(value.sign))return fail()
      // Evita filtración accidental con JSON.stringify/spread/console habituales.
      // No sustituye custodia ni permite devolver este objeto al navegador.
      const ticket=Object.defineProperties({expiresAt:value.expiresAt},{
        token:{value:value.token,enumerable:false},sign:{value:value.sign,enumerable:false},
        toString:{value:()=> '[Ticket WSAA privado]',enumerable:false},
      }) as PrivateWsaaTicket
      entry.ticket=Object.freeze(ticket);entry.expiresAt=ticket.expiresAt
      return entry.ticket
    })
    const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{
      timedOut=true;controller.abort();reject(new Error('FISCAL_TICKET_NO_DISPONIBLE'))
    },timeoutMs)})
    entry.pending=Promise.race([validated,timeout]).then(ticket=>{
      if(timer)clearTimeout(timer);delete entry.pending;return ticket
    },()=>{
      if(timer)clearTimeout(timer)
      // Una fuente que ignora abort sigue ocupando la ranura: no solapar WSAA.
      if(!timedOut&&entries.get(key)===entry)entries.delete(key)
      return fail()
    })
    void source.finally(()=>{if(timedOut&&entries.get(key)===entry)entries.delete(key)}).catch(()=>{})
    return entry.pending
  }}
}
