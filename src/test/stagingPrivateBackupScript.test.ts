// @vitest-environment node
import { it,expect } from 'vitest'
import { mkdirSync,mkdtempSync,writeFileSync,readFileSync,readdirSync,existsSync,rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve,join,dirname,basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const script=resolve('scripts/respaldar-staging-privado.ps1'),quote=(s:string)=>"'"+s.replaceAll("'","''")+"'"
const synthetic='Synthetic:Password\\123'
const fiscalTables=[...new Set(readdirSync('supabase/pilot-fiscal').filter(name=>/^\d{3}_/.test(name)&&Number(name.slice(0,3))<=53).flatMap(name=>[...readFileSync(join('supabase/pilot-fiscal',name),'utf8').matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+)/g)].map(match=>match[1])))].sort()
function cleanup(root:string){
 const target=resolve(root)
 if(dirname(target)!==resolve(tmpdir())||!basename(target).startsWith('kiosko-staging-backup-test-'))throw Error('Unsafe cleanup')
 rmSync(target,{recursive:true,force:true})
}
function run(mode:string){
 const root=mkdtempSync(join(tmpdir(),'kiosko-staging-backup-test-'))
 try{
  mkdirSync(join(root,'Downloads'))
  if(mode!=='missing-ca')writeFileSync(join(root,'Downloads','prod-ca-2021.crt'),mode==='invalid-ca'?'invalid':readFileSync(resolve('src/test/fixtures/supabase-root-2021.crt')))
  const runner=join(root,'runner.ps1'),record=join(root,'record.json')
  writeFileSync(runner,'\uFEFF'+`
   $env:USERPROFILE=${quote(root)}
   $env:PGHOST='before-host';$env:PGPASSWORD='before-password';$env:PGSERVICE='before-service'
   $global:events=New-Object Collections.Generic.List[object]
   function global:Read-Host { param($Prompt,[switch]$AsSecureString);if(-not $AsSecureString){throw 'Not secure'};$secure=New-Object Security.SecureString;foreach($c in ${quote(synthetic)}.ToCharArray()){$secure.AppendChar($c)};$secure.MakeReadOnly();$secure }
   function global:docker {
    $a=@($args | ForEach-Object{[string]$_});$stdin=(@($input)-join "\n").TrimEnd([char]13,[char]10)
    $global:LASTEXITCODE=0
    if($a[0] -eq 'image'){if(${quote(mode)} -eq 'image-missing'){$global:LASTEXITCODE=1;return};'sha256:'+('a'*64);return}
    if($a -contains '--network'){'pg_dump (PostgreSQL) 17.11';'pg_restore (PostgreSQL) 17.11';'pg_dumpall (PostgreSQL) 17.11';return}
    $mount=$a[([array]::IndexOf($a,'--mount')+1)];if($mount -notmatch '^type=bind,source=(.+),target=/backup$'){throw 'Mount'};$folder=$Matches[1]
    if($a -contains '--list'){
     foreach($t in @('kioscos','usuarios','productos','ventas','detalles_venta','devoluciones_parciales_atomicas','piloto_operaciones_capacidades')){if(${quote(mode)} -ne 'missing-table' -or $t -ne 'ventas'){'1; 0 1 TABLE DATA public '+$t+' postgres'}}
     if(${quote(mode)} -like 'fiscal-*'){
      foreach($t in @(${fiscalTables.map(quote).join(',')})){if(${quote(mode)} -ne 'fiscal-missing-table' -or $t -ne 'fiscal_ta_homologacion'){'1; 0 1 TABLE DATA public '+$t+' postgres'}}
      if(${quote(mode)} -ne 'fiscal-missing-function'){'2; 0 1 FUNCTION public preparar_operacion_fiscal_homologacion(uuid, uuid, uuid, jsonb) postgres'}
      if(${quote(mode)} -eq 'fiscal-bare-acl'){'3; 0 1 ACL public FUNCTION preparar_operacion_fiscal_homologacion(uuid, uuid, uuid, jsonb) postgres'}
      elseif(${quote(mode)} -eq 'fiscal-wrong-signature'){'3; 0 1 ACL public FUNCTION preparar_operacion_fiscal_homologacion(p_operacion_id uuid, p_kiosco_id uuid, p_venta_id text, p_contexto jsonb) postgres'}
      elseif(${quote(mode)} -ne 'fiscal-missing-acl'){'3; 0 1 ACL public FUNCTION preparar_operacion_fiscal_homologacion(p_operacion_id uuid, p_kiosco_id uuid, p_venta_id uuid, p_contexto jsonb) postgres'}
     };return
    }
    $tool=if($a -contains 'pg_dumpall'){'pg_dumpall'}else{'pg_dump'}
    $expected='aws-1-sa-east-1.pooler.supabase.com:5432:postgres:postgres.acoyfwwmhaeruciyedri:'+${quote(synthetic.replaceAll('\\','\\\\').replaceAll(':','\\:'))}
    $global:events.Add(@{tool=$tool;stdin_ok=($stdin -ceq $expected);secret_in_args=(($a -join ' ').Contains(${quote(synthetic)}));password_env_in_args=(($a -join ' ') -match 'PGPASSWORD');tls=($a -contains 'PGSSLMODE=verify-full');ca_readonly=($a -contains 'PGSSLROOTCERT=/supabase-root.crt' -and @($a | Where-Object{$_ -like '*target=/supabase-root.crt,readonly'}).Count -eq 1);no_pull=($a -contains '--pull=never');roles_no_passwords=($a -contains '--no-role-passwords')})
    if(${quote(mode)} -eq 'tls-fail'){$global:LASTEXITCODE=1;Write-Error ('SSL error: certificate verify failed '+${quote(synthetic)});return}
    if(${quote(mode)} -eq 'auth-fail'){$global:LASTEXITCODE=1;Write-Error ('password authentication failed '+${quote(synthetic)});return}
    if(${quote(mode)} -eq 'dump-fail' -and $tool -eq 'pg_dump'){$global:LASTEXITCODE=1;return}
    if(${quote(mode)} -eq 'roles-fail' -and $tool -eq 'pg_dumpall'){$global:LASTEXITCODE=1;return}
    $file=($a | Where-Object{ $_ -like '--file=*' }).Substring(7).Substring('/backup/'.Length)
    [IO.File]::WriteAllText((Join-Path $folder $file),$(if($tool -eq 'pg_dump'){'archive-fixture'}else{'CREATE ROLE synthetic NOLOGIN;'}))
   }
   & ${quote(script)} ${mode==='prepare'||mode==='fiscal-prepare'?'-Preparar':''} ${mode.startsWith('fiscal-')?'-FiscalInstalado053':''}
   $code=$LASTEXITCODE
   $envOk=$env:PGHOST -ceq 'before-host' -and $env:PGPASSWORD -ceq 'before-password' -and $env:PGSERVICE -ceq 'before-service'
   [IO.File]::WriteAllText(${quote(record)},(@{events=@($global:events.ToArray());env_ok=$envOk;error_command=$error[0].Exception.CommandName}|ConvertTo-Json -Depth 5))
   exit $code
  `,'utf8')
  const result=spawnSync('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File',runner],{encoding:'utf8',timeout:60000})
  const dir=join(root,'KioskoPOS-Privado','Backups','Staging'),folders=existsSync(dir)?readdirSync(dir):[],destination=folders.length===1?join(dir,folders[0]):null
  const files=destination?readdirSync(destination):[]
  const context=destination&&files.includes('staging-backup-context.json')?JSON.parse(readFileSync(join(destination,'staging-backup-context.json'),'utf8')):null
  const report=existsSync(record)?JSON.parse(readFileSync(record,'utf8')):null
  const dump=files.find(f=>f.endsWith('.dump'))
  const manifest=destination&&dump?readFileSync(join(destination,dump+'.sha256'),'utf8'):null
  return {status:result.status,output:result.stdout+result.stderr,files,context,report,manifest,dump}
 }finally{cleanup(root)}
}
it.skipIf(process.platform!=='win32')('preparación no pide contraseña ni crea respaldo',()=>{const r=run('prepare');expect(r.status,r.output).toBe(0);expect(r.files).toEqual([]);expect(r.report.events).toEqual([]);expect(r.output).not.toContain(synthetic)},60000)
it.skipIf(process.platform!=='win32')('respaldo privado conserva entorno, usa stdin y no otorga éxito de restauración',()=>{
 const r=run('ok');expect(r.status,r.output+JSON.stringify(r.report)).toBe(0);expect(r.report.env_ok).toBe(true);expect(r.report.events).toHaveLength(2)
 for(const e of r.report.events)expect(e).toMatchObject({stdin_ok:true,secret_in_args:false,password_env_in_args:false,tls:true,ca_readonly:true,no_pull:true})
 expect(r.report.events[1].roles_no_passwords).toBe(true);expect(r.context).toMatchObject({status:'BACKUP_ARCHIVE_VERIFIED_NOT_RESTORED',project_ref:'acoyfwwmhaeruciyedri',restore_executed:false,roles_passwords_included:false,storage_objects_included:false,owner_only_acl:true})
 expect(r.manifest).toBe(createHash('sha256').update('archive-fixture').digest('hex').toUpperCase()+'  '+r.dump+'\r\n');expect(r.output).not.toContain(synthetic)
},60000)
it.skipIf(process.platform!=='win32').each(['image-missing','dump-fail','roles-fail','missing-table','missing-ca','invalid-ca'])('fallo %s no publica contexto confirmado ni expone contraseña',mode=>{const r=run(mode);expect(r.status).toBe(1);expect(r.context).toBeNull();expect(r.output).not.toContain(synthetic);if(r.report)expect(r.report.env_ok).toBe(true)},60000)

it.skipIf(process.platform!=='win32').each([['tls-fail','TLS_CERTIFICADO'],['auth-fail','AUTENTICACION']])('diagnóstico %s clasifica stderr sin publicar secretos', (mode,code)=>{
 const r=run(mode);expect(r.status).toBe(1);expect(r.context).toBeNull();expect(r.output).toContain('['+code+']');expect(r.output).not.toContain(synthetic)
},60000)

it.skipIf(process.platform!=='win32')('modo previo054 comprueba tablas fiscales y ACL sin afirmar restauración ni equivalencia',()=>{
 expect(fiscalTables).toHaveLength(41)
 const r=run('fiscal-ok');expect(r.status,r.output).toBe(0)
 expect(r.context).toMatchObject({requested_stage:'BEFORE_SQL054',fiscal_toc_tables_verified:fiscalTables,legacy_function_and_acl_toc_verified:true,fiscal_schema_equivalence_proven:false,restore_executed:false})
 expect(r.report.env_ok).toBe(true);expect(r.output).not.toContain(synthetic)
},60000)
it.skipIf(process.platform!=='win32')('preflight fiscal no solicita secreto ni exporta',()=>{
 const r=run('fiscal-prepare');expect(r.status,r.output).toBe(0)
 expect(r.files).toEqual([]);expect(r.report.events).toEqual([]);expect(r.output).toContain('41 tablas fiscales')
},60000)
it.skipIf(process.platform!=='win32')('acepta también ACL de identidad sin nombres de argumentos',()=>{
 const r=run('fiscal-bare-acl');expect(r.status,r.output).toBe(0);expect(r.context.legacy_function_and_acl_toc_verified).toBe(true)
},60000)
it.skipIf(process.platform!=='win32')('no confunde otra sobrecarga con la ACL requerida',()=>{
 const r=run('fiscal-wrong-signature');expect(r.status,r.output).toBe(1);expect(r.context).toBeNull();expect(r.output).toContain('[INDICE_FISCAL_ACL]')
},60000)
it.skipIf(process.platform!=='win32').each(['fiscal-missing-table','fiscal-missing-function','fiscal-missing-acl'])('modo054 falla cerrado ante %s',mode=>{
 const r=run(mode);expect(r.status,r.output).toBe(1);expect(r.context).toBeNull()
 expect(r.output).not.toContain(synthetic);expect(r.report.env_ok).toBe(true)
},60000)
