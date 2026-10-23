import { parseFiscalJson } from './fiscalStrictJson.ts'

export interface FiscalPresentationFacts {
 version:1
 emisor:{razon_social:string;domicilio_comercial:string;ingresos_brutos:string;inicio_actividades:string}
 receptor:{nombre:string;domicilio:string}
 lineas:readonly {detalle_id:string;descripcion:string}[]
 otros_impuestos_nacionales_indirectos:string
}
export interface FiscalPresentationProposal {canonico:string;sha256:string}
export interface FiscalPresentationAck {
 operacion_id:string;venta_id:string;solicitud_sha256:string;presentacion_sha256:string
 estado:'DATOS_REPRESENTACION_GUARDADOS';emision_habilitada:false
}
export interface FiscalPresentationRecord extends FiscalPresentationAck {canonico:string;datos:Readonly<FiscalPresentationFacts>}
const fail=():never=>{throw new Error('FISCAL_PRESENTACION_NO_CONFIRMADA')}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const sha=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)
function object(input:unknown,keys:string[]):Record<string,unknown>{
 if(!input||typeof input!=='object'||Array.isArray(input))return fail()
 const v=input as Record<string,unknown>
 if(Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))return fail()
 return v
}
function text(v:unknown,max:number):string{
 if(typeof v!=='string'||!v.trim()||[...v].length>max
  ||[...v].some(c=>{const n=c.codePointAt(0)!;return n<32||(n>=127&&n<=159)||(n>=0xd800&&n<=0xdfff)}))return fail()
 return v
}
function date(v:unknown):string{
 if(typeof v!=='string'||!/^\d{8}$/.test(v))return fail()
 const y=Number(v.slice(0,4)),m=Number(v.slice(4,6)),d=Number(v.slice(6,8))
 const days=[31,y%4===0&&(y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31]
 if(y<1||m<1||m>12||d<1||d>days[m-1])return fail()
 return v
}
function canonical(v:unknown):string{
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']'
 if(v&&typeof v==='object')return '{'+Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}'
 return JSON.stringify(v)
}
/** Datos explícitos, sin importar configuración actual ni inventar impuestos. */
export async function prepareFiscalPresentationFacts(input:unknown):Promise<Readonly<FiscalPresentationProposal>&{datos:Readonly<FiscalPresentationFacts>}>{
 const v=object(input,['version','emisor','receptor','lineas','otros_impuestos_nacionales_indirectos'])
 const e=object(v.emisor,['razon_social','domicilio_comercial','ingresos_brutos','inicio_actividades']),r=object(v.receptor,['nombre','domicilio'])
 if(v.version!==1||!Array.isArray(v.lineas)||!v.lineas.length||v.lineas.length>200
  ||typeof v.otros_impuestos_nacionales_indirectos!=='string'||!/^(0|[1-9]\d{0,9})\.\d{2}$/.test(v.otros_impuestos_nacionales_indirectos))return fail()
 const lineas=v.lineas.map(input=>{const line=object(input,['detalle_id','descripcion']);if(!uuid(line.detalle_id))return fail();return Object.freeze({detalle_id:line.detalle_id.toLowerCase(),descripcion:text(line.descripcion,200)})}).sort((a,b)=>a.detalle_id<b.detalle_id?-1:a.detalle_id>b.detalle_id?1:0)
 if(new Set(lineas.map(l=>l.detalle_id)).size!==lineas.length)return fail()
 const datos:FiscalPresentationFacts={version:1,emisor:Object.freeze({razon_social:text(e.razon_social,160),domicilio_comercial:text(e.domicilio_comercial,240),ingresos_brutos:text(e.ingresos_brutos,40),inicio_actividades:date(e.inicio_actividades)}),receptor:Object.freeze({nombre:text(r.nombre,160),domicilio:text(r.domicilio,240)}),lineas:Object.freeze(lineas),otros_impuestos_nacionales_indirectos:v.otros_impuestos_nacionales_indirectos}
 const canonico=canonical(datos),bytes=new TextEncoder().encode(canonico)
 if(bytes.length>60000)return fail()
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),sha256=[...digest].map(x=>x.toString(16).padStart(2,'0')).join('')
 return Object.freeze({canonico,sha256,datos:Object.freeze(datos)})
}
export async function validateFiscalPresentationProposal(input:unknown):Promise<Readonly<FiscalPresentationProposal>>{
 const v=object(input,['canonico','sha256'])
 if(typeof v.canonico!=='string'||new TextEncoder().encode(v.canonico).length>60000||!sha(v.sha256))return fail()
 const prepared=await prepareFiscalPresentationFacts(parseFiscalJson(v.canonico))
 if(prepared.canonico!==v.canonico||prepared.sha256!==v.sha256)return fail()
 return Object.freeze({canonico:prepared.canonico,sha256:prepared.sha256})
}
export async function validateFiscalPresentationRecord(input:unknown,sale:string,operation:string):Promise<Readonly<FiscalPresentationRecord>>{
 const v=object(input,['operacion_id','venta_id','solicitud_sha256','presentacion_sha256','estado','emision_habilitada','canonico'])
 if(!uuid(sale)||!uuid(operation)||v.operacion_id!==operation||v.venta_id!==sale||!sha(v.solicitud_sha256)||!sha(v.presentacion_sha256)
  ||v.estado!=='DATOS_REPRESENTACION_GUARDADOS'||v.emision_habilitada!==false)return fail()
 const proposal=await validateFiscalPresentationProposal({canonico:v.canonico,sha256:v.presentacion_sha256})
 const prepared=await prepareFiscalPresentationFacts(parseFiscalJson(proposal.canonico))
 return Object.freeze({operacion_id:operation,venta_id:sale,solicitud_sha256:v.solicitud_sha256,presentacion_sha256:proposal.sha256,estado:'DATOS_REPRESENTACION_GUARDADOS',emision_habilitada:false,canonico:proposal.canonico,datos:prepared.datos})
}
