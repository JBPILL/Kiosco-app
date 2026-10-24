// @vitest-environment node
import { readFileSync } from 'node:fs'
import { afterEach,expect,it,vi } from 'vitest'
import { retiredFiscalLegacyHandler } from '../../supabase/functions/_shared/fiscalLegacyRetirement'
afterEach(()=>vi.unstubAllGlobals())
it.each(['POST','GET','OPTIONS'])('legacy route %s is retired without parsing body or using network',async method=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
 const request=new Request('https://example.invalid/afip-wsfe',{method,...(method==='POST'?{body:'invalid private request'}:{})})
 const response=retiredFiscalLegacyHandler(request)
 expect(response.status).toBe(410);expect((await response.json()).codigo).toBe('RUTA_FISCAL_RETIRADA')
 expect(request.bodyUsed).toBe(false);expect(fetcher).not.toHaveBeenCalled();expect(response.headers.get('cache-control')).toBe('no-store')
})
it('entrypoint delegates only to retired handler, without signing or custody dependencies',()=>{
 const source=readFileSync('supabase/functions/afip-wsfe/index.ts','utf8')
 expect(source).toContain('serve(retiredFiscalLegacyHandler)')
 expect(source).not.toMatch(/createClient|node-forge|FECAESolicitar|Deno\.env|req\.json/)
})
