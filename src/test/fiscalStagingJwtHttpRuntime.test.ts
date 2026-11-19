// @vitest-environment node
import { expect, it } from 'vitest'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'

const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'"
const external = 'SYNTHETIC_EXTERNAL_BODY_NEVER_PRINT'

it.skipIf(process.platform !== 'win32').each(['pwsh', 'powershell'])('%s real loopback HTTP errors have bounded private bodies', async runtime => {
  const root = mkdtempSync(join(tmpdir(), 'kiosko-http-test-'))
  if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('kiosko-http-test-')) throw Error('Unsafe test cleanup')
  const requests: string[] = []
  const server = createServer((req, res) => {
    const path = req.url ?? ''
    requests.push(path)
    const body = path === '/boundary' ? 'é'.repeat(2048)
      : path === '/large' ? 'é'.repeat(2049)
      : path === '/invalid' ? external
      : JSON.stringify({ code: '42501', private: external })
    const status = path === '/boundary' ? 200 : path === '/large' || path === '/invalid' ? 403 : Number(path.slice(1))
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(body)
  })
  try {
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
    const address = server.address()
    if (!address || typeof address === 'string') throw Error('Loopback listener missing')
    const report = join(root, 'report.json')
    const runner = join(root, 'runner.ps1')
    writeFileSync(runner, '\uFEFF' + `
      $ErrorActionPreference='Stop'
      $ast=[Management.Automation.Language.Parser]::ParseFile(${quote(resolve('scripts/comprobar-jwt-fiscal-staging.ps1'))},[ref]$null,[ref]$null)
      $names=@('ConvertTo-BoundedAccessText','Read-BoundedAccessStream','Get-AccessFailureContent','Invoke-AccessProbe','ConvertFrom-RestoreResponse')
      foreach($fn in $ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]},$false)) {
        if($fn.Name -cin $names){Invoke-Expression $fn.Extent.Text}
      }
      $target='http://127.0.0.1:${address.port}';$origin='http://127.0.0.1';$publicKey='SYNTHETIC_KEY';$token='SYNTHETIC_JWT'
      $observations=New-Object Collections.Generic.List[object]
      try { Invoke-WebRequest -UseBasicParsing -Uri ($target+'/403') -MaximumRedirection 0 | Out-Null;throw 'Missing HTTP error' }
      catch {
        $httpResponseType=$_.Exception.Response.GetType().FullName
        $legacyMethodPresent=$null -ne $_.Exception.Response.PSObject.Methods['GetResponseStream']
        $errorDetailsPresent=$null -ne $_.ErrorDetails.Message
      }
      foreach($status in @(401,403,404,409)) {
        $reply=Invoke-AccessProbe ('/'+$status)
        $data=ConvertFrom-RestoreResponse $reply.Content
        if($reply.Status -ne $status -or $data.code -cne '42501'){throw 'Unexpected safe result'}
        $observations.Add(@{status=$reply.Status;codeConfirmed=$true})
      }
      $boundary=Invoke-AccessProbe '/boundary'
      if([Text.Encoding]::UTF8.GetByteCount($boundary.Content) -ne 4096){throw 'Boundary mismatch'}
      $tooLarge=$false
      try { Invoke-AccessProbe '/large' | Out-Null } catch { $tooLarge=$_.Exception.Message -ceq 'ACCESS_RESPONSE_TOO_LARGE' }
      if(-not $tooLarge){throw 'Oversized body accepted'}
      $parseRejected=$false
      try { $invalid=Invoke-AccessProbe '/invalid';ConvertFrom-RestoreResponse $invalid.Content | Out-Null }
      catch { $parseRejected=$_.Exception.Message -ceq 'RESTORE_HTTP_RESPONSE_PARSE_FAILED' }
      if(-not $parseRejected){throw 'Invalid JSON accepted'}
      [IO.File]::WriteAllText(${quote(report)},(@{runtime=$PSVersionTable.PSVersion.ToString();responseType=$httpResponseType;legacyMethodPresent=$legacyMethodPresent;errorDetailsPresent=$errorDetailsPresent;statuses=@($observations.ToArray());boundaryBytes=4096;oversizeRejected=$tooLarge;invalidJsonRejected=$parseRejected}|ConvertTo-Json -Depth 5))
      Write-Host 'LOCAL_HTTP_RUNTIME_PASS external_network=false credentials=false'
    `, 'utf8')
    const result = await new Promise<{ status: number | null; output: string }>((done, fail) => {
      const child = spawn(runtime, ['-NoProfile', '-File', runner], { windowsHide: true, timeout: 45000 })
      let output = ''
      child.stdout.on('data', data => { output += String(data) })
      child.stderr.on('data', data => { output += String(data) })
      child.on('error', fail)
      child.on('close', status => done({ status, output }))
    })
    expect(result.status, result.output).toBe(0)
    expect(result.output).toContain('LOCAL_HTTP_RUNTIME_PASS')
    for (const sensitive of [external, 'SYNTHETIC_JWT', 'SYNTHETIC_KEY']) expect(result.output).not.toContain(sensitive)
    const evidence = JSON.parse(readFileSync(report, 'utf8'))
    expect(evidence.statuses.map((x: { status: number }) => x.status)).toEqual([401, 403, 404, 409])
    expect(evidence).toMatchObject({ boundaryBytes: 4096, oversizeRejected: true, invalidJsonRejected: true })
    if (runtime === 'pwsh') {
      expect(evidence.responseType).toBe('System.Net.Http.HttpResponseMessage')
      expect(evidence.legacyMethodPresent).toBe(false)
      expect(evidence.errorDetailsPresent).toBe(true)
      expect(evidence.runtime).toMatch(/^7\./)
    } else expect(evidence.legacyMethodPresent).toBe(true)
    expect(requests).toEqual(['/403', '/401', '/403', '/404', '/409', '/boundary', '/large', '/invalid'])
  } finally {
    server.closeAllConnections()
    await new Promise<void>(done => server.close(() => done()))
    rmSync(root, { recursive: true, force: true })
  }
}, 60000)
