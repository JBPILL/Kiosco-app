import { useEffect,useRef,useState } from 'react'
import { Button } from '../ui/Button'
import type { FiscalCreditClient } from '../../lib/fiscalCreditClient'
import type { FiscalCreditDraftScope } from '../../../supabase/functions/_shared/fiscalCreditDraftAck'
import type { FiscalCreditCommercialApplication } from '../../../supabase/functions/_shared/fiscalCreditCommercialApplication'
import { validateFiscalCreditCommercialApplication } from '../../../supabase/functions/_shared/fiscalCreditCommercialApplication'
import type { SesionCaja } from '../../types/database'
interface Props {client:FiscalCreditClient['commercial'];target:Readonly<FiscalCreditDraftScope>;kioskId:string;amount:string;restocks:boolean;cash:Pick<SesionCaja,'id'|'kiosco_id'|'estado'>|null;disabled?:boolean;onRecorded:()=>void;onPendingChange?:(pending:boolean)=>void}
export function FiscalCreditCommercialPanel(props:Props){const t=props.target;return <CommercialBody key={`${props.kioskId}:${t.saleId}:${t.operationId}:${t.requestId}:${t.sha256}:${props.amount}`} {...props}/>}
function CommercialBody({client,target,kioskId,amount,restocks,cash,disabled=false,onRecorded,onPendingChange}:Props){
 const [initial]=useState(()=>{try{return{pending:client.pending(),blocked:false}}catch{return{pending:null,blocked:true}}})
 const [receipt,setReceipt]=useState<Readonly<FiscalCreditCommercialApplication>|null>(null),[queried,setQueried]=useState(false),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[localBlocked,setLocalBlocked]=useState(initial.blocked),[error,setError]=useState(initial.blocked?'No se pudo leer el pendiente de este equipo. Conservá sus datos y solicitá asistencia.':''),[pending,setPending]=useState<ReturnType<typeof client.pending>>(initial.pending)
 const lock=useRef(false),lifetime=useRef({active:true})
 useEffect(()=>{const guard=lifetime.current;guard.active=true;return()=>{guard.active=false}},[])
 const ownPending=pending?.operationId===target.operationId&&pending.requestId===target.requestId&&pending.sha256===target.sha256
 const validCash=!!cash&&cash.estado==='ABIERTA'&&cash.kiosco_id===kioskId
 async function action(kind:'status'|'apply'|'recover'|'retry'){
  if(lock.current||disabled||localBlocked&&(kind==='apply'||kind==='retry')||kind==='apply'&&(!confirmed||!queried||pending||!validCash)||kind==='retry'&&(!confirmed||!ownPending)||kind==='recover'&&!ownPending)return
  lock.current=true;setBusy(true);setError('');if(kind==='apply'||kind==='retry')setConfirmed(false);const guard=lifetime.current
  try{
   const value=kind==='status'?await client.status(target):kind==='recover'?await client.recover():kind==='retry'?await client.retry():cash?await client.apply(target,cash.id):null
   if(!guard.active)return
   if(value){const checked=validateFiscalCreditCommercialApplication(value,target,value.sesion_caja_id);if(checked.kiosco_id!==kioskId||checked.importe!==amount)throw new Error('SCOPE');setReceipt(checked);setConfirmed(false);onRecorded()}
   else if(kind!=='status')throw new Error('NOT_CONFIRMED')
   setQueried(true)
  }catch{if(guard.active)setError('No se confirmó la operación. No repitas el reintegro ni crees otro caso; consultá o recuperá el pendiente original.')}
  finally{if(guard.active){try{const value=client.pending();setPending(value);setLocalBlocked(false);onPendingChange?.(value!==null)}catch{setLocalBlocked(true);setError('No se pudo leer el pendiente. Conservá sus datos y solicitá asistencia.');onPendingChange?.(true)}lock.current=false;setBusy(false)}}
 }
 return <section className="rounded-lg border p-3 space-y-2" aria-label="Aplicación comercial de la nota de crédito">
  <h5 className="font-bold">Devolución de esta nota de crédito</h5>
  <p>Consultar no registra efectivo ni modifica stock. El servidor debe confirmar el CAE de la NC antes de aplicar la devolución.</p>
  <Button type="button" variant="secondary" disabled={busy||disabled} onClick={()=>{void action('status')}}>Consultar devolución registrada</Button>
  {error&&<p role="alert">{error}</p>}
  {receipt?<div role="status"><p className="font-bold">Devolución registrada: $ {receipt.importe.replace('.',',')}. No repitas el reintegro.</p><p>{receipt.stock.length?'La reposición quedó registrada.':'Sin reposición de stock.'}</p><details><summary>Referencia del registro</summary><p className="break-all">{receipt.id} · Caja {receipt.sesion_caja_id}</p></details></div>:<>
   {queried&&<p role="status">No hay una devolución registrada para este caso. Esto no acredita por sí solo una NC autorizada.</p>}
   {pending&&!ownPending?<p>Hay otra aplicación pendiente en este equipo. Recuperala antes de continuar con este caso.</p>:<>
    {ownPending&&<><p>Aplicación pendiente de confirmación. Se conservarán el caso, el importe y la caja originales.</p><Button type="button" variant="secondary" disabled={busy||disabled} onClick={()=>{void action('recover')}}>Recuperar aplicación pendiente</Button></>}
    {(queried||ownPending)&&<><p>Total solicitado: $ {amount.replace('.',',')}. {restocks?'Incluye la reposición solicitada en este caso.':'Sin reposición solicitada.'}</p>
     {!ownPending&&!validCash&&<p>Abrí una caja de este comercio para solicitar el registro.</p>}
     <label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={busy||disabled||localBlocked} onChange={event=>setConfirmed(event.target.checked)}/>Confirmo que quiero registrar esta devolución una sola vez, después de la verificación de ARCA.</label>
     <Button type="button" disabled={busy||disabled||localBlocked||!confirmed||!ownPending&&!validCash} onClick={()=>{void action(ownPending?'retry':'apply')}}>{ownPending?'Reintentar aplicación original':'Solicitar registro de devolución'}</Button>
    </>}
   </>}
  </>}
 </section>
}
