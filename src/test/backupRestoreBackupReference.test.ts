// @vitest-environment node
import {afterEach,beforeEach,expect,it} from 'vitest'
import fs from 'node:fs'
import {tmpdir} from 'node:os'
import {join,dirname,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {verifyRestoreBackupReference} from '../../scripts/backup/restore-backup-reference.mjs'
import {RESTORE_PRESERVATION_TABLES} from '../../scripts/backup/restore-preservation.mjs'
const sha=(s:string)=>createHash('sha256').update(s).digest('hex')
let root:string,folder:string,toc:string,calls:string[][]
const now=Date.parse('2026-11-01T12:00:00.000Z')
const reference=()=>({directory:'pre-restore-acceptance-synthetic12345',archive:'synthetic.dump',archiveHash:sha('synthetic archive'),rolesHash:sha('CREATE ROLE synthetic;'),contextHash:'',createdAt:new Date(now-1000).toISOString(),clientImageId:'sha256:'+'a'.repeat(64)})
let r:ReturnType<typeof reference>
beforeEach(()=>{
 root=fs.mkdtempSync(join(tmpdir(),'restore-backup-reference-'));r=reference();folder=join(root,r.directory);fs.mkdirSync(folder);calls=[]
 const context={status:'BACKUP_ARCHIVE_VERIFIED_NOT_RESTORED',project_ref:'acoyfwwmhaeruciyedri',requested_stage:'BEFORE_ISOLATED_RESTORE_ACCEPTANCE',created_at_utc:r.createdAt,sha256:r.archiveHash.toUpperCase(),archive:r.archive,roles_passwords_included:false,storage_objects_included:false,restore_executed:false,owner_only_acl:true,client_image_id:r.clientImageId,backup_restore_contracts_presence_proven:true}
 const text=JSON.stringify(context);r.contextHash=sha(text);fs.writeFileSync(join(folder,'staging-backup-context.json'),text)
 for(const [name,body,hash] of [[r.archive,'synthetic archive',r.archiveHash],['roles-sin-passwords.sql','CREATE ROLE synthetic;',r.rolesHash]]){
 fs.writeFileSync(join(folder,name),body);fs.writeFileSync(join(folder,name+'.sha256'),hash.toUpperCase()+'  '+name+'\r\n')
 }
 const source=fs.readFileSync('scripts/respaldar-staging-privado.ps1','utf8')
 const fiscal=source.match(/\$stagingFiscalTables = @'\r?\n([\s\S]*?)\r?\n'@/)![1].trim().split(/\r?\n/)
 toc='Dumped from database version: 17.11\nDumped by pg_dump version: 17.11\n'+[...new Set([...fiscal,...RESTORE_PRESERVATION_TABLES])].flatMap(t=>['TABLE public '+t+' postgres','TABLE DATA public '+t+' postgres']).join('\n')
 for(const signature of ['restaurar_contacto_backup(uuid, uuid, text, uuid, jsonb)','restaurar_producto_backup(uuid, uuid, uuid, jsonb)','restaurar_lote_backup(uuid, uuid, uuid, jsonb)','capacidades_restauracion_backup(uuid)'])toc+='\nFUNCTION public '+signature+' postgres\nACL public FUNCTION '+signature+' postgres'
})
afterEach(()=>{if(dirname(root)!==resolve(tmpdir())||!root.includes('restore-backup-reference-'))throw Error('Unsafe cleanup');fs.rmSync(root,{recursive:true,force:true})})
const deps=()=>({root,now,checkDirectory:async()=>{},runCommand:async(_command:string,args:string[])=>{calls.push(args);return args[0]==='context'?JSON.stringify('npipe:////./pipe/dockerDesktopLinuxEngine'):args[0]==='image'?r.clientImageId:toc}})
it('verifies uppercase manifests, exact contracts and isolated cached Docker command',async()=>{
 expect(await verifyRestoreBackupReference(r,deps())).toMatchObject({status:'PRIVATE_BACKUP_REFERENCE_VERIFIED',physicalRestore:false,storageIncluded:false})
 expect(calls).toHaveLength(3);expect(calls[2]).toEqual(expect.arrayContaining(['--pull=never','--network','none','--read-only','no-new-privileges']))
})
it.each(['hash','context','manifest','table','function','acl','version','password','hardlink','network','image'])('rejects %s without exposing private content',async mode=>{
 const d=deps()
 if(mode==='hash')r.archiveHash='0'.repeat(64)
 if(mode==='context')r.contextHash='0'.repeat(64)
 if(mode==='manifest')fs.writeFileSync(join(folder,r.archive+'.sha256'),'invalid private body')
 if(mode==='table')toc=toc.replace('TABLE DATA public ','MISSING public ')
 if(mode==='function')toc=toc.replace('FUNCTION public restaurar_lote_backup','MISSING public restaurar_lote_backup')
 if(mode==='acl')toc=toc.replace('ACL public FUNCTION capacidades','MISSING public FUNCTION capacidades')
 if(mode==='version')toc=toc.replace('database version: 17.11','database version: 16.1')
 if(mode==='password'){const text="ALTER ROLE synthetic PASSWORD 'PRIVATE_SENTINEL';";fs.writeFileSync(join(folder,'roles-sin-passwords.sql'),text);r.rolesHash=sha(text)}
 if(mode==='hardlink')fs.linkSync(join(folder,r.archive),join(folder,'linked.dump'))
 if(mode==='network')d.runCommand=async()=>JSON.stringify('tcp://remote:2375')
 if(mode==='image')d.runCommand=async(_command,args)=>args[0]==='context'?JSON.stringify('unix:///var/run/docker.sock'):'sha256:'+'0'.repeat(64)
 await expect(verifyRestoreBackupReference(r,d)).rejects.toThrow(/^RESTORE_BACKUP_REFERENCE_NOT_CONFIRMED$/)
})
