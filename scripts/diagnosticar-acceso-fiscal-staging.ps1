#requires -Version 7.4
# GET-only diagnostic: no window, originals, SQL, flags, Owner login or ARCA.
$ErrorActionPreference='Stop'
$secure=$null;$pointer=[IntPtr]::Zero;$token=$null;$payload=$null;$process=$null
try {
 if(-not $IsWindows -or [Console]::IsInputRedirected -or $env:NODE_OPTIONS -or $env:NODE_PATH -or $env:NODE_TLS_REJECT_UNAUTHORIZED -ceq '0'){throw 'Runtime'}
 $node=@(Get-Command node -CommandType Application -ErrorAction Stop)[0].Source
 Write-Host 'Solo GET de metadata en Staging acoyfwwmhaeruciyedri. Sin apertura, SQL, flags, originales ni ARCA.'
 $secure=Read-Host 'PAT scoped de Supabase para este Staging (solo aqui, nunca en el chat)' -AsSecureString
 $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 $token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
 $payload=@{token=$token}|ConvertTo-Json -Compress
 $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$node
 $start.ArgumentList.Add((Join-Path $PSScriptRoot 'diagnose-fiscal-management-readonly.mjs'));$start.ArgumentList.Add('--run-read-only')
 $start.UseShellExecute=$false;$start.CreateNoWindow=$true
 $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $start.StandardInputEncoding=[Text.UTF8Encoding]::new($false)
 $process=[Diagnostics.Process]::new();$process.StartInfo=$start
 if(-not $process.Start()){throw 'Process'}
 $output=$process.StandardOutput.ReadToEndAsync();$diagnostics=$process.StandardError.ReadToEndAsync()
 $process.StandardInput.Write($payload);$process.StandardInput.Close()
 if(-not $process.WaitForExit(45000)){$process.Kill();throw 'GET timeout'}
 $safe=$output.GetAwaiter().GetResult().Trim();$null=$diagnostics.GetAwaiter().GetResult()
 if($safe -cnotmatch '^MGMT_READONLY_(PASS status=200 names=6 flags_closed=true original_read=false write_attempted=false|NOT_CONFIRMED reason=(ENTRY|TOKEN_FORMAT|NETWORK_OR_TLS|HTTP_(401|403|404|429|500|502|503|504|OTHER)|METADATA_REJECTED|CUSTODY_REJECTED) original_read=false write_attempted=false)$'){throw 'Output'}
 Write-Output $safe
 exit $process.ExitCode
}catch{Write-Output 'MGMT_READONLY_NOT_CONFIRMED reason=ENTRY original_read=false write_attempted=false';exit 1}
finally{
 if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
 if($secure){$secure.Dispose()};if($process){$process.Dispose()};$token=$null;$payload=$null
}
