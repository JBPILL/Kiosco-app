// Fresh local journal only. No credentials, login, HTTP, PostgreSQL or mutations.
import { createRestoreJournal, PLAN_HASH, inspectRestoreJournal } from './restore-acceptance-engine.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
let input = '', stage = 'INPUT'
try {
  if (process.platform !== 'win32' || process.argv.slice(2).join(' ') !== '--prepare' || process.env.NODE_OPTIONS || process.env.NODE_PATH || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw Error('Runtime')
  for await (const chunk of process.stdin) {
    input += chunk
    if (Buffer.byteLength(input, 'utf8') > 4096) throw Error('Input')
  }
  const packet = JSON.parse(input)
  if (Object.keys(packet).sort().join(',') !== 'actors,directory,planHash' || packet.planHash !== PLAN_HASH || typeof packet.directory !== 'string') throw Error('Packet')
  stage = 'DIRECTORY'
  const root = path.join(process.env.USERPROFILE, 'KioskoPOS-Privado', 'Restauracion-Staging')
  const directory = path.resolve(packet.directory)
  if (path.dirname(directory).toLowerCase() !== root.toLowerCase()) throw Error('Scope')
  const checker = path.resolve(import.meta.dirname, 'verify-private-restore-directory.ps1')
  const check = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', checker, '-Path', directory], { encoding: 'utf8', windowsHide: true, timeout: 15000 })
  if (check.status !== 0 || check.stdout !== 'RESTORE_DIRECTORY_PRIVATE=true') throw Error('Directory')
  if (fs.readdirSync(directory).length !== 0) throw Error('Fresh directory required')
  stage = 'JOURNAL'
  const journal = createRestoreJournal(path.join(directory, 'journal.jsonl'), packet.actors)
  if (inspectRestoreJournal(journal).cursor !== 0) throw Error('Journal')
  console.log('RESTORE_PRIVATE_PREPARATION_PASS journal=true auth=false network=false mutation=false')
} catch {
  console.log('RESTORE_PRIVATE_PREPARATION_NOT_CONFIRMED stage=' + stage + ' retry=false')
  process.exitCode = 1
} finally { input = '' }
