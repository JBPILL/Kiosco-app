/** Subconjunto explícito de DN simple usado por el certificado de ensayo.
 * Rechaza escapes/RDN multivaluados/atributos repetidos; no los interpreta
 * aproximadamente. Comparación caseIgnore de valores ASCII y espacios. */
const aliases:Record<string,string>={CN:'CN','2.5.4.3':'CN',O:'O','2.5.4.10':'O',OU:'OU','2.5.4.11':'OU',
  C:'C','2.5.4.6':'C',SERIALNUMBER:'SERIALNUMBER','2.5.4.5':'SERIALNUMBER'}
function invalid():never{throw new Error('FISCAL_WSAA_IDENTIDAD_INVALIDA')}
export function normalizeWsaaDnFields(fields:readonly (readonly [string,string])[]):string {
  if(fields.length<1||fields.length>8)return invalid()
  const seen=new Set<string>(),normalized:[string,string][]=[]
  for(const [name,raw] of fields){
    const key=aliases[name.trim().toUpperCase()]
    if(!key||seen.has(key)||typeof raw!=='string'||raw.length>256||!/^[\x20-\x7E]+$/.test(raw)||/[,=+"\\<>;]/.test(raw))return invalid()
    const value=raw.trim().replace(/ +/g,' ').toLowerCase()
    if(!value)return invalid()
    seen.add(key);normalized.push([key,value])
  }
  return JSON.stringify(normalized.sort(([a],[b])=>a<b?-1:a>b?1:0))
}
export function normalizeWsaaDn(text:string):string {
  if(typeof text!=='string'||text.length>2048)return invalid()
  return normalizeWsaaDnFields(text.split(',').map(part=>{
    const index=part.indexOf('=');if(index<1)return invalid()
    return [part.slice(0,index),part.slice(index+1)] as const
  }))
}
