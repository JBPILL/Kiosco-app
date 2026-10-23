// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createFiscalRepresentationPdf } from '../lib/fiscalRepresentationPdf'
import { fiscalRepresentationFixture } from './fixtures/fiscalRepresentation'
import { validateFiscalRepresentation } from '../../supabase/functions/_shared/fiscalRepresentation'
import { prepareFiscalPresentationFacts } from '../../supabase/functions/_shared/fiscalPresentation'

async function fixture(long = false, unicode = false) {
  const f = await fiscalRepresentationFixture()
  const original = await validateFiscalRepresentation(f.wire, f.sale, f.operation)
  if (!long && !unicode) return original
  const lines = long ? Array.from({ length: 200 }, () => ({ detalle_id: crypto.randomUUID(), descripcion: 'Descripción histórica de ensayo con ajuste y presentación extensa. '.repeat(3).slice(0, 200) })) : original.hechos.datos.lineas
  const prepared = await prepareFiscalPresentationFacts({ ...original.hechos.datos,
    emisor: { ...original.hechos.datos.emisor, razon_social: unicode ? 'Comercio 中文' : 'Razón social histórica de homologación para verificar el corte de líneas '.repeat(2), domicilio_comercial: 'Domicilio comercial de ensayo exclusivamente sintético '.repeat(4) },
    lineas: lines,
  })
  return validateFiscalRepresentation({ ...f.wire,
    hechos: { ...f.wire.hechos, canonico: prepared.canonico, presentacion_sha256: prepared.sha256 },
    contexto: { ...f.wire.contexto, lineas: long ? prepared.datos.lineas.map((line, i) => ({ detalle_id: line.detalle_id, cantidad: '1.000', precio_unitario: '1.00', subtotal: i < 145 ? '0.62' : '0.61' })) : f.wire.contexto.lineas },
  }, f.sale, f.operation)
}

describe('PDF de representación autorizada de homologación', () => {
  it.each([1, 6])('representa tipo %s e impuestos explícitos sin inferir IVA por renglón', async tipoComprobante => {
    const f = await fiscalRepresentationFixture({ tipoComprobante, tipoDocumento: 80, numeroDocumento: '20123456786', condicionIvaReceptor: 1,
      importes: { total: '123.45', neto: '100', iva: '21', noGravado: '0', exento: '0', tributos: '2.45' },
      iva: [{ id: 5, base: '100', importe: '21' }], tributos: [{ id: 99, descripcion: 'Tributo declarado de ensayo', base: '100', alicuota: '2.45', importe: '2.45' }],
    })
    const source = await validateFiscalRepresentation({ ...f.wire, condicion_emisor: 'RESPONSABLE_INSCRIPTO' }, f.sale, f.operation)
    const result = await createFiscalRepresentationPdf(source)
    expect(result.fileName).toBe(`homologacion-${tipoComprobante}-00002-00000001.pdf`)
    expect(result.doc.getNumberOfPages()).toBe(1)
    expect(source.constancia.solicitud.solicitud.iva).toEqual([{ id: 5, base: '100.00', importe: '21.00' }])
  })
  it('conserva cantidades/precios/subtotales ajustados, cuerpo y CAE sin recalcular la venta', async () => {
    const source = await fixture(), before = JSON.stringify(source)
    const result = await createFiscalRepresentationPdf(source)
    const pdf = result.doc.output()
    expect(result.pages).toBe(1)
    expect(result.fileName).toBe('homologacion-11-00002-00000001.pdf')
    expect(pdf).toMatch(/^%PDF-/)
    expect(JSON.stringify(source)).toBe(before)
    expect(result.doc.getNumberOfPages()).toBe(result.pages)
  })
  it('pagina los 200 renglones y permite generar muestras sintéticas sin descargar automáticamente', async () => {
    const single = await createFiscalRepresentationPdf(await fixture())
    const long = await createFiscalRepresentationPdf(await fixture(true))
    expect(long.pages).toBeGreaterThan(10)
    expect(long.pages).toBeLessThan(40)
    const destination = process.env.FISCAL_PDF_SYNTHETIC_OUTPUT
    if (destination) {
      const root = resolve(destination)
      await mkdir(root, { recursive: true })
      await writeFile(join(root, 'homologacion-sintetica-simple.pdf'), Buffer.from(single.doc.output('arraybuffer')))
      await writeFile(join(root, 'homologacion-sintetica-200-lineas.pdf'), Buffer.from(long.doc.output('arraybuffer')))
    }
  })
  it('rechaza cuerpo alterado, raíz extra o datos no autorizados sin salida PDF', async () => {
    const source = await fixture()
    await expect(createFiscalRepresentationPdf({ ...source, estado: 'PREPARADA' } as unknown as typeof source)).rejects.toThrow()
    await expect(createFiscalRepresentationPdf({ ...source, extra: 'ignored?' } as typeof source)).rejects.toThrow()
    const changed = { ...source, contexto: { ...source.contexto, lineas: source.contexto.lineas.map(line => ({ ...line, subtotal: '100.00' })) } }
    await expect(createFiscalRepresentationPdf(changed)).rejects.toThrow()
  })
  it('deniega glifos no soportados en vez de omitir o sustituir identidad fiscal', async () => {
    await expect(createFiscalRepresentationPdf(await fixture(false, true))).rejects.toThrow('FISCAL_PDF_FUENTE_NO_COMPATIBLE')
  })
  it('captura la fuente antes de esperas asíncronas y no incorpora cambios posteriores', async () => {
    const source = structuredClone(await fixture())
    const pending = createFiscalRepresentationPdf(source)
    Object.assign(source.constancia.solicitud.solicitud, { numero: 999 })
    const result = await pending
    expect(result.fileName).toBe('homologacion-11-00002-00000001.pdf')
  })
  it('no solicita red ni guarda la fuente o el documento en almacenamiento del navegador', async () => {
    const source = await fixture(), fetcher = vi.fn(), storage = { setItem: vi.fn() }
    vi.stubGlobal('fetch', fetcher); vi.stubGlobal('localStorage', storage)
    try { await createFiscalRepresentationPdf(source); expect(fetcher).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled() }
    finally { vi.unstubAllGlobals() }
  })
})
