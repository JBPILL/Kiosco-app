// @vitest-environment node
import { expect, it } from 'vitest'
import { parseFiscalJson } from '../../supabase/functions/_shared/fiscalStrictJson'
it.each(['{"a":1,"a":2}','{"a":1,"\\u0061":2}','{"entrada":{"datos":{"iva":0,"iva":1}}}','[{"x":1,"x":2}]'])('rechaza duplicados en cualquier nivel: %s',text=>{
 expect(()=>parseFiscalJson(text)).toThrow()
})
it('acepta objetos anidados y texto con comillas/dos puntos sin contarlo como clave',()=>{
 const input={entrada:{datos:{observacion:'Texto "IVA": \\ valor',lines:[{a:1},{a:2}],value:null,number:-2.5e8,active:true}}}
 expect(parseFiscalJson(JSON.stringify(input))).toEqual(input)
})
it.each(['{"x":1,}','[1,]','{bad}', 'null true', '', '"\\x"'])('rechaza gramática JSON inválida %s',text=>{
 expect(()=>parseFiscalJson(text)).toThrow()
})
it('limita la profundidad incluso con un cuerpo de pocos bytes',()=>{
 expect(()=>parseFiscalJson('['.repeat(20)+'0'+']'.repeat(20))).toThrow()
})
