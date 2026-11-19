export interface FiscalReconciliationAck {
  version: 1
  operacion_id: string
  numero: number
  estado: 'AUTORIZADA' | 'PENDIENTE_CONCILIACION'
  solicitud_sha256: string
  revision: 1 | 2
  emision_habilitada: false
  cae?: string
  vencimiento?: string
  procesado_en?: string | null
}
const fail = (): never => { throw new Error('FISCAL_PERSISTENCIA_NO_CONFIRMADA') }
function record(value: unknown): Record<string,unknown> {
  if(!value || typeof value!=='object' || Array.isArray(value))return fail()
  return value as Record<string,unknown>
}
function uuid(value: unknown): value is string {
  return typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{8}$/.test(value)) return false
  const y=Number(value.slice(0,4)),m=Number(value.slice(4,6)),d=Number(value.slice(6,8))
  const days=[31,y%4===0&&(y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31]
  return y>0 && m>0 && m<=12 && d>0 && d<=days[m-1]
}
export function validateFiscalReconciliationAck(value: unknown, op: string, sha?: string): FiscalReconciliationAck {
  const obj=record(value)
  if(!uuid(op) || obj.version!==1 || obj.operacion_id!==op || obj.emision_habilitada!==false
    || !Number.isSafeInteger(obj.numero) || Number(obj.numero)<1 || Number(obj.numero)>99999999
    || typeof obj.solicitud_sha256!=='string' || !/^[0-9a-f]{64}$/.test(obj.solicitud_sha256)
    || (sha!==undefined && sha!==obj.solicitud_sha256))return fail()
  const fields=['version','operacion_id','numero','estado','solicitud_sha256','revision','emision_habilitada']
  if(obj.estado==='AUTORIZADA') {
    fields.push('cae','vencimiento','procesado_en')
    if(obj.revision!==2 || typeof obj.cae!=='string' || !/^[0-9]{14}$/.test(obj.cae) || /^0+$/.test(obj.cae)
      || !validDate(obj.vencimiento)
      || (obj.procesado_en!==null && (typeof obj.procesado_en!=='string' || !/^[0-9]{14}$/.test(obj.procesado_en) || !validDate(obj.procesado_en.slice(0,8)) || Number(obj.procesado_en.slice(8,10))>23 || Number(obj.procesado_en.slice(10,12))>59 || Number(obj.procesado_en.slice(12,14))>59)))return fail()
  } else if(obj.estado!=='PENDIENTE_CONCILIACION' || obj.revision!==1)return fail()
  if(Object.keys(obj).some(key=>!fields.includes(key)))return fail()
  return Object.freeze({...obj}) as unknown as FiscalReconciliationAck
}
