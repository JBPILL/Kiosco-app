// LOCAL PGlite compatibility overlay; no server adapter or remote SQL entry point.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { createHash,randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
const root=resolve(import.meta.dirname,'../..')
const guards={
 proteger_privilegios_usuario:{file:'003_profile_integrity.sql',hash:'f93b163db2331a8ab2a47fd0c993d9d329ffb56232d245448bec60aac9f55dac'},
 proteger_costo_producto:{file:'004_private_product_costs.sql',hash:'cfb7ed2d01db0795c44f718b5c4c7f726609e1b5c71191487e2e1fdc54db0318'},
}
const sha=text=>createHash('sha256').update(text).digest('hex')
function tokens(source){
 const result=[]
 for(const [text] of source.matchAll(/'(?:''|[^'])*'|--[^\n]*|\/\*[\s\S]*?\*\/|[a-zA-Z_][a-zA-Z_0-9]*|::|<>|!=|<=|>=|[^\s]/g)){
  if(text.startsWith('--')||text.startsWith('/*'))continue
  if(text.startsWith("'")&&result.at(-2)==='raise'&&result.at(-1)==='exception'){
   if(text.includes('%'))throw Error('UNREVIEWED_RAISE_FORMAT')
   result.push("'REVIEWED_MESSAGE'")
  }else result.push(text.startsWith("'")?text:text.toLowerCase())
 }
 return JSON.stringify(result)
}
export function reviewedGuardSql(fixture){
 const expected=guards[fixture?.name]
 if(!expected||typeof fixture.body!=='string'||sha(fixture.body)!==expected.hash)throw Error('LOCAL_GUARD_FIXTURE_NOT_REVIEWED')
 const source=readFileSync(resolve(root,'supabase/bootstrap/steps',expected.file),'utf8').replaceAll('\r\n','\n')
 const tail=source.split('CREATE OR REPLACE FUNCTION public.'+fixture.name+'()')[1]
 const body=tail?.match(/AS \$\$([\s\S]*?)\$\$;/)?.[1]
 if(!body||sha(body)!==fixture.baselineBodySha256||tokens(body)!==tokens(fixture.body)||fixture.body.includes('$restore_fixture_guard$'))throw Error('LOCAL_GUARD_LOGIC_DIFFERENCE')
 return `CREATE OR REPLACE FUNCTION public.${fixture.name}() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $restore_fixture_guard$${fixture.body}$restore_fixture_guard$;`
}
export async function installLocalRestoreCompatibility(db){
 if(!(db instanceof PGlite))throw Error('LOCAL_PGLITE_REQUIRED')
 for(const name of ['001_commercial_subscription.sql','002_commercial_write_gate.sql'])await db.exec(readFileSync(resolve(root,'supabase/bootstrap/commercial',name),'utf8'))
 const fixture=JSON.parse(readFileSync(resolve(root,'scripts/backup/restore-dependency-guard-fixtures.json'),'utf8'))
 if(fixture.functions.length!==2||new Set(fixture.functions.map(row=>row.name)).size!==2)throw Error('LOCAL_GUARD_FIXTURE_NOT_REVIEWED')
 for(const row of fixture.functions)await db.exec(reviewedGuardSql(row))
}
export async function seedLocalRestoreSubscription(db,kioskId){
 if(!(db instanceof PGlite))throw Error('LOCAL_PGLITE_REQUIRED')
 const id=randomUUID()
 await db.query('INSERT INTO planes(id,nombre,precio_mensual,max_usuarios) VALUES($1,$2,0,3)',[id,'LOCAL SYNTHETIC PLAN'])
 await db.query("INSERT INTO suscripciones(kiosco_id,plan_id,fecha_inicio,fecha_vencimiento,estado) VALUES($1,$2,'2000-01-01','2100-12-31','ACTIVA')",[kioskId,id])
}
