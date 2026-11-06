// Private local archive verification, not restoration. No DB connection/passwords.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { RESTORE_PRESERVATION_TABLES } from './restore-preservation.mjs'
const fail=()=>{throw Error('RESTORE_BACKUP_REFERENCE_NOT_CONFIRMED')}
const sha=value=>createHash('sha256').update(value).digest('hex')
const source=fs.readFileSync(new URL('../respaldar-staging-privado.ps1',import.meta.url),'utf8')
const fiscal=source.match(/\$stagingFiscalTables = @'\r?\n([\s\S]*?)\r?\n'@/)?.[1].trim().split(/\r?\n/)
if(fiscal?.length!==41||fiscal.some(name=>!/^[_a-z]+$/.test(name)))fail()
const signatures={restaurar_contacto_backup:['uuid','uuid','text','uuid','jsonb'],restaurar_producto_backup:['uuid','uuid','uuid','jsonb'],restaurar_lote_backup:['uuid','uuid','uuid','jsonb'],capacidades_restauracion_backup:['uuid']}
function regular(file,max=Infinity){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size<=0||s.size>max)fail()}
function run(command,args){
 const result=spawnSync(command,args,{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:8388608})
 if(result.status!==0||result.error)fail()
 return result.stdout.trim()
}
function privateDirectory(directory){
 if(process.platform!=='win32')fail()
 const output=run('pwsh',['-NoProfile','-NonInteractive','-File',path.resolve(import.meta.dirname,'verify-restore-backup-private.ps1'),'-Path',directory])
 if(output!=='RESTORE_BACKUP_PRIVATE=true')fail()
}
async function fileHash(file){const h=createHash('sha256');for await(const part of fs.createReadStream(file))h.update(part);return h.digest('hex')}
export async function verifyRestoreBackupReference(reference,{root=path.join(process.env.USERPROFILE??'','KioskoPOS-Privado','Backups','Staging'),checkDirectory=privateDirectory,runCommand=run,now=Date.now()}={}){
 try{
  const r=reference,age=now-Date.parse(r?.createdAt)
  if(!r||!/^pre-restore-acceptance-[a-zA-Z0-9-]{10,100}$/.test(r.directory)||!/^[a-zA-Z0-9_-]+\.dump$/.test(r.archive)||![r.archiveHash,r.contextHash,r.rolesHash].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))||!/^sha256:[a-f0-9]{64}$/.test(r.clientImageId)||!Number.isFinite(age)||age<0||age>86400000||process.env.DOCKER_HOST||process.env.DOCKER_TLS_VERIFY||process.env.DOCKER_CERT_PATH)fail()
  const directory=path.resolve(root,r.directory)
  if(path.dirname(directory)!==path.resolve(root)||/[\r\n,]/.test(directory))fail()
  await checkDirectory(directory)
  const archive=path.join(directory,r.archive),roles=path.join(directory,'roles-sin-passwords.sql'),contextFile=path.join(directory,'staging-backup-context.json')
  regular(archive);regular(roles,8388608);regular(contextFile,65536)
  const contextBytes=fs.readFileSync(contextFile),context=JSON.parse(contextBytes.toString('utf8')),roleText=fs.readFileSync(roles,'utf8')
  if(sha(contextBytes)!==r.contextHash||sha(fs.readFileSync(roles))!==r.rolesHash||await fileHash(archive)!==r.archiveHash||/\b(?:CREATE|ALTER)\s+ROLE\b[^;]*\bPASSWORD\b/i.test(roleText))fail()
  if(context.status!=='BACKUP_ARCHIVE_VERIFIED_NOT_RESTORED'||context.project_ref!=='acoyfwwmhaeruciyedri'||context.requested_stage!=='BEFORE_ISOLATED_RESTORE_ACCEPTANCE'||context.created_at_utc!==r.createdAt||typeof context.sha256!=='string'||context.sha256.toLowerCase()!==r.archiveHash||context.archive!==r.archive||context.roles_passwords_included!==false||context.storage_objects_included!==false||context.restore_executed!==false||context.owner_only_acl!==true||context.client_image_id!==r.clientImageId||context.backup_restore_contracts_presence_proven!==true)fail()
  for(const [file,expected] of [[archive,r.archiveHash],[roles,r.rolesHash]]){
   regular(file+'.sha256',4096)
   const parts=fs.readFileSync(file+'.sha256','ascii').trim().split('  ')
   if(parts.length!==2||parts[0].toLowerCase()!==expected||parts[1]!==path.basename(file))fail()
  }
  const endpoint=JSON.parse(await runCommand('docker',['context','inspect','--format','{{json .Endpoints.docker.Host}}']))
  if(!['npipe:////./pipe/dockerDesktopLinuxEngine','npipe:////./pipe/docker_engine','unix:///var/run/docker.sock'].includes(endpoint))fail()
  if(await runCommand('docker',['image','inspect','--format','{{.Id}}',r.clientImageId])!==r.clientImageId)fail()
  const toc=await runCommand('docker',['run','--rm','--pull=never','--network','none','--read-only','--security-opt','no-new-privileges','--mount','type=bind,src='+archive+',dst=/backup/input.dump,readonly',r.clientImageId,'pg_restore','--list','/backup/input.dump'])
  if(!/Dumped from database version: 17\./.test(toc)||!/Dumped by pg_dump version: 17\./.test(toc))fail()
  for(const table of new Set([...fiscal,...RESTORE_PRESERVATION_TABLES]))for(const entry of ['TABLE public ','TABLE DATA public '])if(!new RegExp('\\b'+entry+table+'(?:\\s|$)','m').test(toc))fail()
  for(const [name,types] of Object.entries(signatures)){
   const pattern=name+'\\('+types.map(type=>'(?:[a-z_]+\\s+)?'+type).join(',\\s*')+'\\)'
   for(const entry of ['FUNCTION public ','ACL public FUNCTION '])if(toc.split(/\r?\n/).filter(line=>new RegExp('\\b'+entry+pattern+'(?:\\s|$)').test(line)).length!==1)fail()
  }
  return Object.freeze({status:'PRIVATE_BACKUP_REFERENCE_VERIFIED',archiveHash:r.archiveHash,contextHash:r.contextHash,rolesHash:r.rolesHash,physicalRestore:false,storageIncluded:false})
 }catch{fail()}
}
