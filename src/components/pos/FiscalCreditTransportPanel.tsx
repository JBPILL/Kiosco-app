import { useEffect,useRef,useState } from 'react'
import { Button } from '../ui/Button'
import type { FiscalCreditClient } from '../../lib/fiscalCreditClient'
import type { FiscalCreditDraftScope } from '../../../supabase/functions/_shared/fiscalCreditDraftAck'
import type { FiscalCreditOwnerReview } from '../../../supabase/functions/_shared/fiscalCreditOwnerReview'
import type { FiscalCreditTransportStatus } from '../../../supabase/functions/_shared/fiscalCreditTransportStatus'
import { validateFiscalCreditTransportStatus } from '../../../supabase/functions/_shared/fiscalCreditTransportStatus'
import { envioNotasCreditoHomologacionActivo,conciliacionNotasCreditoHomologacionActiva } from '../../lib/pilotExpansion'
interface Props {scope:FiscalCreditDraftScope;client:FiscalCreditClient['transport'];review:Readonly<FiscalCreditOwnerReview>|null;onConflict?:()=>void}
const labels={SIN_INTENCION:'Sin intención de envío registrada',ENVIO_INCIERTO:'Envío sin confirmación de ARCA',RECHAZO_RECIBIDO:'ARCA informó un rechazo',CONFLICTO_NC:'Conflicto fiscal: aplicación bloqueada',CAE_CONFIRMADO:'CAE confirmado por consulta: aplicación comercial pendiente'}
export function FiscalCreditTransportPanel(props:Props){
 return <TransportBody key={`${props.scope.saleId}:${props.scope.operationId}:${props.scope.requestId}:${props.scope.sha256}`} {...props}/>
}
function TransportBody({scope,client,review,onConflict}:Props){
 const sendEnabled=envioNotasCreditoHomologacionActivo(),queryEnabled=conciliacionNotasCreditoHomologacionActiva()
 const [status,setStatus]=useState<Readonly<FiscalCreditTransportStatus>|null>(null),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false),[error,setError]=useState('')
 const [pending,setPending]=useState(()=>{try{return client.pending()}catch{return undefined}})
 const alive=useRef(true),running=useRef(false)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 if(!sendEnabled&&!queryEnabled)return null
 async function action(kind:'status'|'recover'|'send'|'query'|'retry'){
  if(running.current)return
  running.current=true;setBusy(true);setError('')
  const captured={...scope},approval=review?.aprobacion,bodySha=review?.cuerpo.sha256
  try{
   let raw:unknown
   if(kind==='status')raw=await client.status(captured)
   else if(kind==='recover')raw=await client.recover()
   else if(kind==='query'){if(!queryEnabled)throw new Error('GATE');raw=await client.consult(captured)}
   else {
    if(!confirmed)throw new Error('CONFIRMATION')
    setConfirmed(false)
    if(kind==='send'){
     if(!sendEnabled||!approval||!bodySha)throw new Error('REVIEW')
     raw=await client.send(captured,bodySha,approval.id)
    }else{
     const original=client.pending()
     if(!original||original.kind==='ENVIAR'&&!sendEnabled||original.kind==='CONSULTAR'&&!queryEnabled)throw new Error('GATE')
     if(original.requestId!==captured.requestId||original.operationId!==captured.operationId||original.proposalSha!==captured.sha256)throw new Error('SCOPE')
     if(approval&&bodySha!==original.bodySha)throw new Error('BODY')
     raw=await client.retry(original.kind==='ENVIAR'?approval?.id:undefined)
    }
   }
   const checked=validateFiscalCreditTransportStatus(raw,captured,bodySha)
   if(alive.current){setStatus(checked);if(checked.estado==='CONFLICTO_NC')onConflict?.()}
  }catch{if(alive.current){setStatus(null);setError('No se confirmó el estado. Conservá el caso y recuperá el intento original. No crees otra NC ni reutilices la numeración.')}}
  finally{running.current=false;if(alive.current){setBusy(false);try{setPending(client.pending())}catch{setPending(undefined)}}}
 }
 const samePending=pending&&pending.requestId===scope.requestId&&pending.operationId===scope.operationId&&pending.proposalSha===scope.sha256
 const fresh=sendEnabled&&status?.estado==='SIN_INTENCION'&&!!review?.aprobacion&&pending===null
 return <section aria-label="Envío y conciliación de nota de crédito" className="rounded-lg border p-3 space-y-3">
  <h4 className="font-bold">Envío y recuperación · Homologación</h4>
  <p>Enviar, consultar ARCA y aplicar la devolución son pasos distintos. Una respuesta de envío no acredita CAE.</p>
  <Button type="button" variant="secondary" disabled={busy} onClick={()=>{void action('status')}}>Consultar estado guardado</Button>
  {error&&<p role="alert">{error}</p>}
  {pending===undefined&&<p role="alert">No se pudo leer el pendiente de este equipo. Las acciones quedan bloqueadas.</p>}
  {pending&&<p role="status">Hay un intento guardado. Recuperá su estado antes de iniciar otra operación.</p>}
  {samePending&&<Button type="button" variant="secondary" disabled={busy} onClick={()=>{void action('recover')}}>Recuperar intento original</Button>}
  {status&&<div role="status"><p className="font-bold">{labels[status.estado]}</p>
   {status.incidencia&&<p>Incidencia de conciliación: {status.incidencia}. Conservá el caso para revisión.</p>}
   {status.codigos.length>0&&<p>Códigos informados: {status.codigos.join(', ')}</p>}
   {status.estado==='CAE_CONFIRMADO'&&<p>CAE {status.cae} · Vencimiento {status.vencimiento?.slice(6,8)}/{status.vencimiento?.slice(4,6)}/{status.vencimiento?.slice(0,4)}. Esto no confirma entrega de efectivo ni reposición de stock.</p>}
   {(status.estado==='RECHAZO_RECIBIDO'||status.estado==='CONFLICTO_NC')&&<p>Requiere revisión fiscal. No se habilita reenvío automático ni liberación de numeración.</p>}
  </div>}
  {queryEnabled&&status&&status.estado!=='SIN_INTENCION'&&pending===null&&<Button type="button" variant="secondary" disabled={busy} onClick={()=>{void action('query')}}>Consultar comprobante en ARCA</Button>}
  {(fresh||samePending)&&<label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo la acción sobre este mismo caso y cuerpo fiscal.</label>}
  {fresh&&<Button type="button" disabled={busy||!confirmed} onClick={()=>{void action('send')}}>Enviar NC revisada en homologación</Button>}
  {samePending&&((pending.kind==='ENVIAR'&&sendEnabled)||(pending.kind==='CONSULTAR'&&queryEnabled))&&<Button type="button" disabled={busy||!confirmed} onClick={()=>{void action('retry')}}>Reintentar identidad original</Button>}
 </section>
}
