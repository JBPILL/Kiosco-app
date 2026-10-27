// @vitest-environment node
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

function cleanup(root:string):void {
 const target=resolve(root)
 if(dirname(target)!==resolve(tmpdir())||!basename(target).startsWith('kiosko-edge-package-test-'))throw Error('Unexpected temporary package target')
 rmSync(target,{recursive:true,force:true})
}
it.each(['existing-output','non-commit-ref','missing-commit','runtime-drift'])('empaquetador rechaza %s sin sobrescribir ni producir un candidato',mode=>{
 const root=mkdtempSync(join(tmpdir(),'kiosko-edge-package-test-'))
 try {
  const destination=join(root,'package')
  if(mode==='existing-output'){mkdirSync(destination);writeFileSync(join(destination,'index.ts'),'SYNTHETIC_PREVIOUS_PACKAGE')}
  const commit=mode==='non-commit-ref'?'HEAD':mode==='missing-commit'?'0'.repeat(40):'bac8ac13cf07f8f38a8748e2e5f77d1c7a2b6e34'
  const result=spawnSync(process.execPath,[resolve('scripts/preparar-edge-fiscal-staging.mjs'),'--source-commit',commit,'--output',destination],{encoding:'utf8',timeout:10000})
  expect(result.status).not.toBe(0)
  if(mode==='existing-output')expect(readFileSync(join(destination,'index.ts'),'utf8')).toBe('SYNTHETIC_PREVIOUS_PACKAGE')
  else expect(existsSync(destination)).toBe(false)
  expect(existsSync(join(destination,'manifest.json'))).toBe(false)
 } finally {cleanup(root)}
})
