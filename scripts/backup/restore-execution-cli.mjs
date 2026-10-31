// Interactive PowerShell supplies secrets through stdin; never argv or files.
import fs from 'node:fs'
import { validateRestoreExecutionPackage } from './restore-execution-package.mjs'
import { executePrivateRestorePacket } from './restore-private-executor.mjs'
let text=''
try{
 const args=process.argv.slice(2)
 if(args.length===2&&args[0]==='--prepare'){
  const file=fs.lstatSync(args[1])
  if(!file.isFile()||file.isSymbolicLink()||file.nlink!==1||file.size>131072)throw Error('Package')
  const packet=JSON.parse(fs.readFileSync(args[1],'utf8'))
  validateRestoreExecutionPackage(packet,packet.packageHash)
  console.log('RESTORE_PACKAGE_PREPARED scope='+packet.scope+' execution=false')
 }else if(args.length===1&&args[0]==='--execute'){
  if(process.platform!=='win32')throw Error('Windows')
  for await(const part of process.stdin){text+=part;if(Buffer.byteLength(text)>196608)throw Error('Input')}
  const result=await executePrivateRestorePacket(JSON.parse(text))
  console.log(result)
  if(!result.startsWith('RESTORE_CAPTURE_PASS ')&&!result.startsWith('RESTORE_ROLE_PASS '))process.exitCode=1
 }else throw Error('Mode')
}catch{console.log('RESTORE_OPERATOR_NOT_CONFIRMED stage=ENTRY retry=false');process.exitCode=1}
finally{text=''}
