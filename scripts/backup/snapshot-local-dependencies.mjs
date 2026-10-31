// Explicit LOCAL PGlite snapshot. No server, network, credentials or real Auth.
import { PGlite } from '@electric-sql/pglite'
import { installLocalRestoreCompatibility,seedLocalRestoreSubscription } from './restore-dependency-baseline.mjs'
import { readFileSync,readdirSync,existsSync,writeFileSync } from 'node:fs'
import { resolve,join } from 'node:path'
const args=process.argv.slice(2),root=resolve(import.meta.dirname,'../..')
if(args.length!==2||args[0]!=='--evidence'||!args[1].endsWith('.json')||existsSync(resolve(args[1])))throw Error('FRESH_LOCAL_EVIDENCE_REQUIRED')
const file=resolve(args[1]),db=new PGlite()
let stage='BOOTSTRAP',report
try {
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.role',true),'')$$;`)
 const base=join(root,'supabase/bootstrap')
 for(const path of [join(base,'001_domain.sql'),join(base,'002_identity_helpers.sql'),...readdirSync(join(base,'steps')).sort().map(n=>join(base,'steps',n)),join(base,'900_final_security.sql')])await db.exec(readFileSync(path,'utf8'))
 await installLocalRestoreCompatibility(db)
 for(const n of ['001_contacts_restore.sql','002_inventory_restore.sql','003_restore_capability.sql'])await db.exec(readFileSync(join(root,'supabase/pilot-backup',n),'utf8'))
 await db.exec(`INSERT INTO auth.users VALUES('0e90b9a7-36d2-4762-ab1a-4982996cf9aa');
 INSERT INTO kioscos(id,nombre) VALUES('b7254826-c767-4098-94b8-71013c12021d','LOCAL SYNTHETIC METADATA');
 INSERT INTO usuarios(auth_user_id,kiosco_id,nombre,rol) VALUES('0e90b9a7-36d2-4762-ab1a-4982996cf9aa','b7254826-c767-4098-94b8-71013c12021d','LOCAL SYNTHETIC OWNER','DUEÑO');`)
 await seedLocalRestoreSubscription(db,'b7254826-c767-4098-94b8-71013c12021d')
 stage='READ_ONLY_METADATA'
 const query=readFileSync(join(root,'scripts/backup/restore-dependency-metadata.sql'),'utf8')
 const results=await db.exec(query),metadata=results.find(r=>r.rows.length>0)?.rows[0]?.evidence
 if(!metadata||metadata.read_only!=='on'||metadata.identity_fuse!==true)throw Error('LOCAL_METADATA_NOT_CONFIRMED')
 report={status:'PASS',environment:'LOCAL_PGLITE_SYNTHETIC',realAuth:false,network:false,metadata}
} catch {report={status:'NOT_CONFIRMED',stage,environment:'LOCAL_PGLITE_SYNTHETIC',realAuth:false,network:false};process.exitCode=1}
finally {await db.close()}
writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({status:report.status,stage,tables:report.metadata?.tables?.length,functions:report.metadata?.functions?.length,triggers:report.metadata?.triggers?.length,network:false}))
