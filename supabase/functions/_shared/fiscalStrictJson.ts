/** JSON acotado por el llamador. Detecta claves duplicadas también escapadas y
 * anidadas antes de aceptar un DTO; JSON.parse valida el resto de la gramática. */
export function parseFiscalJson(text:string):unknown {
 const invalid=():never=>{throw new Error('FISCAL_JSON_INVALIDO')}
 const result:unknown=JSON.parse(text)
 let index=0
 const whitespace=()=>{while(index<text.length&&/[\t\n\r ]/.test(text[index]))index++}
 function string():string {
  if(text[index]!=='"')return invalid()
  const start=index++
  while(index<text.length){
   const char=text[index++]
   if(char==='\\'){index++;continue}
   if(char==='"')return JSON.parse(text.slice(start,index)) as string
  }
  return invalid()
 }
 function value(depth:number):void {
  if(depth>12)return invalid()
  whitespace()
  if(text[index]==='"'){string();return}
  if(text[index]==='{'){
   index++;whitespace();const keys=new Set<string>()
   if(text[index]==='}'){index++;return}
   while(index<text.length){
    whitespace();const key=string();if(keys.has(key))return invalid();keys.add(key)
    whitespace();if(text[index++]!==':')return invalid();value(depth+1);whitespace()
    const end=text[index++];if(end==='}')return;if(end!==',')return invalid()
   }
   return invalid()
  }
  if(text[index]==='['){
   index++;whitespace();if(text[index]===']'){index++;return}
   while(index<text.length){value(depth+1);whitespace();const end=text[index++];if(end===']')return;if(end!==',')return invalid()}
   return invalid()
  }
  const primitive=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(index))
  if(!primitive)return invalid();index+=primitive[0].length
 }
 value(0);whitespace();if(index!==text.length)return invalid()
 return result
}
