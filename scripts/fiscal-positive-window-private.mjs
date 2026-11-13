// Private packet execution. Caller supplies credentials through stdin only.
import { spawnSync } from 'node:child_process'
import { resolve, dirname, relative, isAbsolute, basename } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { validatePositiveWindowPackage, POSITIVE_WINDOW_SCOPE } from './fiscal-positive-window-package.mjs'
import { connectPositiveWindowPostgres } from './fiscal-positive-postgres.mjs'
import { createPositiveWindowDatabase } from './fiscal-positive-window-database.mjs'
import { createPreparationManagement } from './fiscal-preparation-management.mjs'
import { authenticatePrivateOwner } from './fiscal-private-owner-session.mjs'
import { executePositiveWindow } from './fiscal-positive-window-operator.mjs'
const fail=()=>{throw Error('PRIVATE_WINDOW_OPERATOR_NOT_CONFIRMED')}
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',')
async function privateDirectory(path){
  const allowed=resolve(homedir(),'KioskoPOS-Privado/ARCA-Ventanas'),part=relative(allowed,dirname(path))
  if(!isAbsolute(path)||!part||part.startsWith('..')||isAbsolute(part)||basename(path)!=='journal.jsonl')return fail()
  const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./comprobar-directorio-ventana-privada.ps1',import.meta.url)),'-Path',dirname(path)],
    {encoding:'utf8',timeout:10000,windowsHide:true})
  if(result.error||result.status!==0||result.stdout!=='WINDOW_DIRECTORY_PRIVATE=true'||result.stderr)return fail()
}
export async function executePrivateWindowPacket(packet,dependencies={}){
  let connections,stage='PACKET',output
  try{
    if(process.env.NODE_OPTIONS||process.env.NODE_PATH||process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0'
      ||!exact(packet,['packageText','approvedPackageHash','authorizedScope','exclusiveWriteConfirmed','journalPath','rootCertificate','credentials'])
      ||packet.authorizedScope!==POSITIVE_WINDOW_SCOPE||packet.exclusiveWriteConfirmed!==true
      ||!exact(packet.credentials,['publicKey','email','password','postgresPassword','managementToken'])
      ||Object.values(packet.credentials).some(value=>typeof value!=='string'||!value||value.length>16384))return fail()
    if(typeof packet.packageText!=='string'||Buffer.byteLength(packet.packageText)>196608)return fail()
    const reviewed=await validatePositiveWindowPackage(JSON.parse(packet.packageText),packet.approvedPackageHash,{now:(dependencies.now??Date.now)(),execute:true})
    stage='DIRECTORY'
    await(dependencies.checkDirectory??privateDirectory)(packet.journalPath)
    stage='CONNECT'
    connections=await(dependencies.connect??connectPositiveWindowPostgres)({password:packet.credentials.postgresPassword,rootCertificate:packet.rootCertificate})
    const database=await(dependencies.database??createPositiveWindowDatabase)({client:connections.client,observer:connections.observer,
      config:reviewed.config,historySha256:reviewed.historySha256,commercialSha256:reviewed.commercialSha256,now:dependencies.now??Date.now})
    const management=(dependencies.management??createPreparationManagement)({token:packet.credentials.managementToken,credentialId:reviewed.credentialId,taKeyId:reviewed.taKeyId})
    stage='WINDOW'
    const result=await(dependencies.execute??executePositiveWindow)({config:reviewed.config,approvedHash:reviewed.dataPlanSha256,
      authorizedScope:packet.authorizedScope,journalPath:packet.journalPath},{client:connections.client,now:dependencies.now??Date.now,db:database,management,
      authenticateOwner:requests=>(dependencies.authenticate??authenticatePrivateOwner)({publicKey:packet.credentials.publicKey,email:packet.credentials.email,
        password:packet.credentials.password,expectedOwnerAuthId:reviewed.config.ownerAuthId,expectedKioskId:reviewed.config.kioskId},{approvedRequests:requests}),
      dispose:connections.dispose})
    // Publish only a fixed stage enum, never exception messages or remote data.
    const failureStage=['PREFLIGHT','MANAGEMENT','AUTH','OPEN','FLAGS','DATA','BODY','RELOAD','CLOSE','LOGOUT','FINAL_PROBE','SESSION'].includes(result.failures?.[0])
      ?result.failures[0]:'WINDOW'
    output=result.passed?'WINDOW_OPERATOR_PASS flags_closed=true sql_closed=true logout_local=true backend503=true emission=false cae=0'
      :'WINDOW_OPERATOR_NOT_CONFIRMED stage='+failureStage+' cleanup_confirmed='+result.cleanupConfirmed+' reconcile=true'
  }catch{output='WINDOW_OPERATOR_NOT_CONFIRMED stage='+stage+' cleanup_confirmed=false reconcile=true'}
  finally{
    if(connections)await connections.dispose().catch(()=>{output='WINDOW_OPERATOR_NOT_CONFIRMED stage=DISPOSE cleanup_confirmed=false reconcile=true'})
    if(packet?.credentials&&typeof packet.credentials==='object')for(const key of Object.keys(packet.credentials))packet.credentials[key]=''
  }
  return output
}
