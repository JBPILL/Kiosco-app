import { useEffect,useRef,useState } from 'react'
import { Button } from '../ui/Button'
import type { FiscalPresentationContext } from '../../../supabase/functions/_shared/fiscalPresentationContext'
import type { FiscalPresentationFacts } from '../../../supabase/functions/_shared/fiscalPresentation'
import { prepareFiscalPresentationFacts } from '../../../supabase/functions/_shared/fiscalPresentation'
interface Props {context:FiscalPresentationContext;onSave:(facts:FiscalPresentationFacts)=>Promise<void>;disabled?:boolean}
const inputStyle='w-full rounded-lg border p-2 bg-transparent'
export function FiscalPresentationForm({context,onSave,disabled}:Props){
 const [name,setName]=useState(''),[address,setAddress]=useState(''),[iibb,setIibb]=useState(''),[date,setDate]=useState('')
 const [receiver,setReceiver]=useState(''),[receiverAddress,setReceiverAddress]=useState(''),[tax,setTax]=useState('')
 const [descriptions,setDescriptions]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const inFlight=useRef(false),mounted=useRef(true)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 async function save(event:React.FormEvent){
  event.preventDefault();if(disabled||inFlight.current)return
  inFlight.current=true;setBusy(true);setError('')
  try{
   const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date)
   if(!match||!/^(0|[1-9]\d{0,9})([.,]\d{1,2})?$/.test(tax))throw new Error()
   const [whole,fraction='']=tax.replace(',','.').split('.')
   const facts:FiscalPresentationFacts={version:1,emisor:{razon_social:name,domicilio_comercial:address,ingresos_brutos:iibb,inicio_actividades:match[3]+match[2]+match[1]},receptor:{nombre:receiver,domicilio:receiverAddress},lineas:context.lineas.map(x=>({detalle_id:x.detalle_id,descripcion:descriptions[x.detalle_id]??''})),otros_impuestos_nacionales_indirectos:whole+'.'+fraction.padEnd(2,'0')}
   await prepareFiscalPresentationFacts(facts);await onSave(facts)
  }catch{if(mounted.current)setError('No se confirmaron los datos. Revisá los campos, la fecha dd/mm/aaaa y los importes; si ya guardaste, consultá el estado antes de cambiarlos.')}
  finally{inFlight.current=false;if(mounted.current)setBusy(false)}
 }
 const text=(label:string,value:string,set:(v:string)=>void,max:number,placeholder?:string)=><label className="block text-sm font-medium">{label}<input className={inputStyle} required maxLength={max} value={value} placeholder={placeholder} disabled={disabled||busy} onChange={e=>set(e.target.value)}/></label>
 return <form aria-label="Datos históricos del comprobante" className="space-y-4" onSubmit={save}>
  <p>Completá los datos que deben conservarse en este comprobante. No se toman de la configuración actual. Guardarlos no aprueba ni emite una factura.</p>
  <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-3"><legend className="font-bold">Emisor</legend>
   {text('Razón social del emisor',name,setName,160)}{text('Domicilio comercial',address,setAddress,240)}
   {text('Inscripción en Ingresos Brutos',iibb,setIibb,40)}{text('Inicio de actividades',date,setDate,10,'dd/mm/aaaa')}
  </fieldset>
  <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-3"><legend className="font-bold">Receptor</legend>
   {text('Nombre o razón social del receptor',receiver,setReceiver,160)}{text('Domicilio del receptor',receiverAddress,setReceiverAddress,240)}
  </fieldset>
  <fieldset className="space-y-3"><legend className="font-bold">Detalle de la venta original</legend>
   {context.lineas.map((line,index)=><div key={line.detalle_id} className="rounded-lg border p-3 space-y-1">
    {text(`Descripción del artículo ${index+1}`,descriptions[line.detalle_id]??'',value=>setDescriptions(prev=>({...prev,[line.detalle_id]:value})),200)}
    <p className="text-sm">Cantidad: {line.cantidad.replace(/\.000$/,'').replace('.',',')} · Precio unitario: $ {line.precio_unitario.replace('.',',')} · Subtotal: $ {line.subtotal.replace('.',',')}</p>
   </div>)}
  </fieldset>
  {text('Otros impuestos nacionales indirectos contenidos',tax,setTax,14,'0,00')}
  <p className="text-sm">Declaración explícita para la representación. No suma otro importe al total ni reemplaza el desglose fiscal; escribí cero si corresponde.</p>
  <Button type="submit" fullWidth disabled={disabled} loading={busy}>Guardar datos para revisar</Button>
  {error&&<p role="alert">{error}</p>}
 </form>
}
