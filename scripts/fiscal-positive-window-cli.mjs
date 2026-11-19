// Private operator entrypoint. Public files only in --prepare/--draft;
// execution credentials only through a bounded stdin pipe, never argv/env/files.
import { readFileSync, lstatSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { buildPositiveWindowPackage, validatePositiveWindowPackage } from './fiscal-positive-window-package.mjs'
import { executePrivateWindowPacket } from './fiscal-positive-window-private.mjs'
let bytes,packet
function publicJson(path){
  if(typeof path!=='string'||!path.endsWith('.json'))throw Error('PUBLIC_JSON_REQUIRED')
  const stat=lstatSync(path)
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>196608)throw Error('PUBLIC_JSON_REQUIRED')
  return JSON.parse(readFileSync(path,'utf8'))
}
try{
  if(Number(process.versions.node.split('.')[0])<24||process.env.NODE_OPTIONS||process.env.NODE_PATH||process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw Error('RUNTIME_POLICY')
  if(process.argv.length===6&&process.argv[2]==='--draft'){
    const raw=publicJson(process.argv[3]),references=publicJson(process.argv[4]),{snapshotPath,...settings}=raw
    if(!references||Object.keys(references).sort().join(',')!=='commercialSha256,historySha256,taKeyId')throw Error('EXACT_PUBLIC_REFERENCES_REQUIRED')
    if(typeof snapshotPath!=='string'||!snapshotPath.endsWith('.json'))throw Error('SNAPSHOT')
    const stat=lstatSync(snapshotPath)
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)throw Error('SNAPSHOT')
    const config={...settings,snapshotText:readFileSync(snapshotPath,'utf8'),now:new Date().toISOString()}
    const proposal=await buildPositiveWindowPackage({config,...references})
    const folder=resolve(process.argv[5]);mkdirSync(folder)
    writeFileSync(join(folder,'package.json'),JSON.stringify(proposal,null,2)+'\n',{flag:'wx'})
    console.log('WINDOW_PUBLIC_PACKAGE_PREPARED hash='+proposal.packageSha256+' remote_executed=false emission=false')
  }else if(process.argv.length===4&&process.argv[2]==='--prepare'){
    const proposal=publicJson(process.argv[3]);await validatePositiveWindowPackage(proposal,proposal.packageSha256)
    console.log('WINDOW_OPERATOR_PREPARED private_read=false network=0 emission=false')
  }else{
    if(process.argv.length!==3||process.argv[2]!=='--execute'||process.stdin.isTTY)throw Error('STDIN_REQUIRED')
    const chunks=[];let size=0
    try{
      for await(const chunk of process.stdin){size+=chunk.length;if(size>524288)throw Error('PACKET_SIZE');chunks.push(chunk)}
      bytes=Buffer.concat(chunks);packet=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes))
    }finally{for(const chunk of chunks)chunk.fill(0)}
    const output=await executePrivateWindowPacket(packet)
    console.log(output);if(!output.startsWith('WINDOW_OPERATOR_PASS '))process.exitCode=1
  }
}catch{console.log('WINDOW_OPERATOR_NOT_CONFIRMED stage=ENTRY cleanup_confirmed=false reconcile=true');process.exitCode=1}
finally{bytes?.fill(0);if(packet?.credentials)for(const key of Object.keys(packet.credentials))packet.credentials[key]='';packet=null}
