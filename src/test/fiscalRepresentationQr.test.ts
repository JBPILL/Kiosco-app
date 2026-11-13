// @vitest-environment node
import { expect,it,vi } from 'vitest'
import { fiscalRepresentationFixture } from './fixtures/fiscalRepresentation'
import { validateFiscalRepresentation } from '../../supabase/functions/_shared/fiscalRepresentation'
import { buildFiscalRepresentationQr } from '../../supabase/functions/_shared/fiscalRepresentationQr'
it('official QR encodes confirmed header only, preserves numeric decimals and uses current ARCA URL',async()=>{
 const f=await fiscalRepresentationFixture(),source=await validateFiscalRepresentation(f.wire,f.sale,f.operation)
 const qr=await buildFiscalRepresentationQr(source),url=new URL(qr.url),payload=JSON.parse(qr.payload)
 expect(url.origin+url.pathname).toBe('https://www.arca.gob.ar/fe/qr/')
 expect(atob(url.searchParams.get('p')!)).toBe(qr.payload)
 expect(payload).toMatchObject({ver:1,fecha:'2026-10-21',cuit:20123456786,ptoVta:2,tipoCmp:11,nroCmp:1,importe:123.45,moneda:'PES',ctz:1,tipoDocRec:99,nroDocRec:0,tipoCodAut:'E',codAut:11111111111111})
 expect(qr.payload).toContain('"importe":123.45');expect(payload).not.toHaveProperty('receptor')
 expect(qr.validez_fiscal).toBe(false);expect(qr.entorno).toBe('HOMOLOGACION')
})
it('QR rejects a review or unconfirmed source rather than manufacturing missing fields',async()=>{
 const f=await fiscalRepresentationFixture(),source=await validateFiscalRepresentation(f.wire,f.sale,f.operation)
 await expect(buildFiscalRepresentationQr({...source,estado:'PREPARADA'} as unknown as typeof source)).rejects.toThrow('FISCAL_QR_NO_CONFIRMADO')
 const broken={...structuredClone(source),contexto:{...structuredClone(source.contexto),lineas:[]}}
 await expect(buildFiscalRepresentationQr(broken)).rejects.toThrow('FISCAL_QR_NO_CONFIRMADO')
})
it('QR revalidates frozen body and performs no network calls',async()=>{
 const f=await fiscalRepresentationFixture(),source=await validateFiscalRepresentation(f.wire,f.sale,f.operation),fetcher=vi.fn()
 vi.stubGlobal('fetch',fetcher)
 try{await buildFiscalRepresentationQr(source);expect(fetcher).not.toHaveBeenCalled()}finally{vi.unstubAllGlobals()}
})

it('QR keeps small money decimal lexemes exactly within the PES pilot scope',async()=>{
 const f=await fiscalRepresentationFixture({importes:{total:'0.10',neto:'0.10',iva:'0',noGravado:'0',exento:'0',tributos:'0'}})
 const source=await validateFiscalRepresentation(f.wire,f.sale,f.operation),qr=await buildFiscalRepresentationQr(source)
 expect(qr.payload).toContain('"importe":0.10');expect(qr.payload).toContain('"ctz":1');expect(qr.payload).toContain('"moneda":"PES"')
 expect(qr.payload).not.toContain('e-');expect(atob(new URL(qr.url).searchParams.get('p')!)).toBe(qr.payload)
})
it('QR rejects unexpected source fields and a CAE that cannot be encoded as a 14-digit JSON number',async()=>{
 const f=await fiscalRepresentationFixture(),source=await validateFiscalRepresentation(f.wire,f.sale,f.operation)
 await expect(buildFiscalRepresentationQr({...source,extra:true} as typeof source)).rejects.toThrow('FISCAL_QR_NO_CONFIRMADO')
 f.wire.constancia.autorizacion.cae='01111111111111'
 const leading=await validateFiscalRepresentation(f.wire,f.sale,f.operation)
 await expect(buildFiscalRepresentationQr(leading)).rejects.toThrow('FISCAL_QR_NO_CONFIRMADO')
})

it('QR preserves the current PES-only contract and rejects an altered currency',async()=>{
 const f=await fiscalRepresentationFixture(),source=await validateFiscalRepresentation(f.wire,f.sale,f.operation)
 const changed={...source,constancia:{...source.constancia,solicitud:{...source.constancia.solicitud,solicitud:{...source.constancia.solicitud.solicitud,moneda:'DOL'}}}}
 await expect(buildFiscalRepresentationQr(changed as unknown as typeof source)).rejects.toThrow('FISCAL_QR_NO_CONFIRMADO')
})
