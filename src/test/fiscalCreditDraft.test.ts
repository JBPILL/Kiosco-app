import { expect, it, vi } from 'vitest'
import { prepareFiscalCreditDraft } from '../../supabase/functions/_shared/fiscalCreditDraft'
import type { FiscalCreditDraftInput } from '../../supabase/functions/_shared/fiscalCreditDraft'
import { validateFiscalRepresentation } from '../../supabase/functions/_shared/fiscalRepresentation'
import { fiscalRepresentationFixture } from './fixtures/fiscalRepresentation'

async function fixture(tipo = 11, taxDescription = 'Tributo uno', rate = '1') {
  const taxed = tipo !== 11
  const f = await fiscalRepresentationFixture({ tipoComprobante: tipo,
    ...(taxed ? { importes: { total: '123.45', neto: '100', iva: '21', noGravado: '0', exento: '0', tributos: '2.45' },
      iva: [{ id: 5, base: '100', importe: '21' }],
      tributos: [{ id: 99, descripcion: taxDescription, base: '100', alicuota: rate, importe: '1' }, { id: 100, descripcion: 'Tributo dos', base: '100', alicuota: '1.45', importe: '1.45' }],
    } : {}),
  })
  const source = await validateFiscalRepresentation({ ...f.wire, condicion_emisor: taxed ? 'RESPONSABLE_INSCRIPTO' : 'MONOTRIBUTO' }, f.sale, f.operation)
  const body = source.constancia.solicitud.solicitud
  const input: FiscalCreditDraftInput = { version: 1, solicitud_id: crypto.randomUUID(), fecha: '20261023', motivo: 'Devolución de ensayo', condicion_iva_receptor: 5,
    lineas: [{ detalle_id: source.contexto.lineas[0].detalle_id, cantidad: '2.000', importe: body.importes.total, reingresa_stock: true }],
    importes: structuredClone(body.importes), iva: structuredClone(body.iva), tributos: structuredClone(body.tributos),
  }
  return { source, input }
}
it.each([[1, 3], [6, 8], [11, 13]])('factura %i conserva asociación exacta y prepara tipo NC %i sin numerar ni emitir', async (invoice, note) => {
  const f = await fixture(invoice), before = JSON.stringify(f)
  const result = await prepareFiscalCreditDraft(f.source, f.input, '20261023')
  expect(result.estado).toBe('PROPUESTA_NO_PERSISTIDA'); expect(result.emision_habilitada).toBe(false)
  expect(result.datos.tipo_nota_credito).toBe(note)
  expect(result.datos.origen).toEqual({ venta_id: f.source.venta_id, operacion_id: f.source.operacion_id, solicitud_sha256: f.source.constancia.solicitud.sha256,
    presentacion_sha256: f.source.hechos.presentacion_sha256, cae: f.source.constancia.autorizacion.cae, cuit: '20123456786', tipo: invoice,
    punto_venta: 2, numero: 1, fecha: '20261021', tipo_documento_receptor: 99, numero_documento_receptor: '0' })
  expect(result.datos).not.toHaveProperty('numero'); expect(result.datos).not.toHaveProperty('punto_venta')
  expect(result.sha256).toMatch(/^[0-9a-f]{64}$/); expect(JSON.parse(result.canonico)).toEqual(result.datos)
  expect(Object.isFrozen(result.datos.lineas[0])).toBe(true); expect(JSON.stringify(f)).toBe(before)
})
it('acepta propuesta parcial explícita sin fabricar impuesto proporcional o nuevo cobro', async () => {
  const f = await fixture()
  const input = { ...f.input, lineas: [{ ...f.input.lineas[0], cantidad: '1.000', importe: '61.73' }], importes: { ...f.input.importes, total: '61.73', neto: '61.73' } }
  const draft = await prepareFiscalCreditDraft(f.source, input, '20261023')
  expect(draft.datos.lineas[0].importe).toBe('61.73'); expect(draft.datos.importes.iva).toBe('0.00')
  expect(draft.datos.condicion_iva_receptor).toBe(5)
})
const invalid = [
  ['sin condición IVA explícita', (x: FiscalCreditDraftInput) => { const { condicion_iva_receptor: _removed, ...v } = x; return v }],
  ['sin motivo', (x: FiscalCreditDraftInput) => ({ ...x, motivo: '' })],
  ['motivo con controles', (x: FiscalCreditDraftInput) => ({ ...x, motivo: 'No\npermitido' })],
  ['uuid inválido', (x: FiscalCreditDraftInput) => ({ ...x, solicitud_id: 'invalid' })],
  ['fecha inexistente', (x: FiscalCreditDraftInput) => ({ ...x, fecha: '20260230' })],
  ['fecha futura', (x: FiscalCreditDraftInput) => ({ ...x, fecha: '20261024' })],
  ['fecha anterior a factura', (x: FiscalCreditDraftInput) => ({ ...x, fecha: '20261020' })],
  ['tipo NC impuesto por cliente', (x: FiscalCreditDraftInput) => ({ ...x, tipo_nota_credito: 3 })],
  ['asociación editable', (x: FiscalCreditDraftInput) => ({ ...x, origen: { numero: 999 } })],
  ['detalle ajeno', (x: FiscalCreditDraftInput) => ({ ...x, lineas: [{ ...x.lineas[0], detalle_id: crypto.randomUUID() }] })],
  ['detalle repetido', (x: FiscalCreditDraftInput) => ({ ...x, lineas: [x.lineas[0], x.lineas[0]] })],
  ['cantidad superior', (x: FiscalCreditDraftInput) => ({ ...x, lineas: [{ ...x.lineas[0], cantidad: '3.000' }] })],
  ['cantidad cero', (x: FiscalCreditDraftInput) => ({ ...x, lineas: [{ ...x.lineas[0], cantidad: '0.000' }] })],
  ['cantidad float', (x: FiscalCreditDraftInput) => ({ ...x, lineas: [{ ...x.lineas[0], cantidad: 1 }] })],
  ['reposición no explícita', (x: FiscalCreditDraftInput) => ({ ...x, lineas: [{ ...x.lineas[0], reingresa_stock: 'sí' }] })],
  ['importe superior', (x: FiscalCreditDraftInput) => ({ ...x, lineas: [{ ...x.lineas[0], importe: '123.46' }], importes: { ...x.importes, total: '123.46', neto: '123.46' } })],
  ['importe negativo', (x: FiscalCreditDraftInput) => ({ ...x, importes: { ...x.importes, total: '-123.45' } })],
  ['importe en exponente', (x: FiscalCreditDraftInput) => ({ ...x, importes: { ...x.importes, total: '1.2345e2' } })],
  ['importe con coma', (x: FiscalCreditDraftInput) => ({ ...x, importes: { ...x.importes, total: '123,45' } })],
  ['importe float', (x: FiscalCreditDraftInput) => ({ ...x, importes: { ...x.importes, total: 123.45 } })],
  ['suma fiscal distinta', (x: FiscalCreditDraftInput) => ({ ...x, importes: { ...x.importes, neto: '100.00' } })],
  ['suma comercial distinta', (x: FiscalCreditDraftInput) => ({ ...x, lineas: [{ ...x.lineas[0], importe: '100.00' }] })],
  ['IVA no presente en C', (x: FiscalCreditDraftInput) => ({ ...x, iva: [{ id: 5, base: '123.45', importe: '0.00' }] })],
] as const
it.each(invalid)('rechaza %s', async (_label, modify) => {
  const f = await fixture()
  await expect(prepareFiscalCreditDraft(f.source, modify(f.input), '20261023')).rejects.toThrow('FISCAL_PROPUESTA_NC_INVALIDA')
})
it('normaliza orden canónico y exige mismos impuestos y límites del original, sin calcular tasas', async () => {
  const f = await fixture(6)
  const a = await prepareFiscalCreditDraft(f.source, f.input, '20261023')
  const b = await prepareFiscalCreditDraft(f.source, { ...f.input, tributos: [...f.input.tributos].reverse() }, '20261024')
  expect(b.sha256).toBe(a.sha256)
  await expect(prepareFiscalCreditDraft(f.source, { ...f.input, iva: [{ id: 4, base: '100.00', importe: '21.00' }] }, '20261023')).rejects.toThrow()
  await expect(prepareFiscalCreditDraft(f.source, { ...f.input, tributos: f.input.tributos.map(line => ({ ...line, alicuota: '9.0000' })) }, '20261023')).rejects.toThrow()
  await expect(prepareFiscalCreditDraft(f.source, { ...f.input, tributos: f.input.tributos.map(line => ({ ...line, base: '101.00' })) }, '20261023')).rejects.toThrow()
})
it('captura el original y la propuesta antes de esperar; ninguna red ni persistencia', async () => {
  const f = await fixture(), original = structuredClone(f.source), input = structuredClone(f.input), fetcher = vi.fn(), storage = { setItem: vi.fn() }
  vi.stubGlobal('fetch', fetcher); vi.stubGlobal('localStorage', storage)
  try {
    const pending = prepareFiscalCreditDraft(original, input, '20261023')
    Object.assign(original.constancia.solicitud.solicitud, { numero: 999 }); input.motivo = 'CAMBIADO'
    const result = await pending
    expect(result.datos.origen.numero).toBe(1); expect(result.datos.motivo).toBe('Devolución de ensayo')
    expect(fetcher).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled()
  } finally { vi.unstubAllGlobals() }
})
it('exige descripción80 y alícuota3+2 en tributos sin truncar o redondear historia heredada', async () => {
  const valid = await fixture(6, 'T'.repeat(80), '999.99')
  await expect(prepareFiscalCreditDraft(valid.source, valid.input, '20261023')).resolves.toHaveProperty('estado', 'PROPUESTA_NO_PERSISTIDA')
  for (const f of [await fixture(6, 'T'.repeat(81)), await fixture(6, 'T', '1000'), await fixture(6, 'T', '1.2345')]) {
    await expect(prepareFiscalCreditDraft(f.source, f.input, '20261023')).rejects.toThrow('FISCAL_PROPUESTA_NC_INVALIDA')
  }
})
it('rechaza fuente no autorizada o cuerpo/hash alterados, con error sanitizado', async () => {
  const f = await fixture()
  await expect(prepareFiscalCreditDraft({ ...f.source, estado: 'RESERVADA' } as unknown as typeof f.source, f.input, '20261023')).rejects.toThrow('FISCAL_PROPUESTA_NC_INVALIDA')
  const altered = { ...f.source, constancia: { ...f.source.constancia, solicitud: { ...f.source.constancia.solicitud, sha256: 'a'.repeat(64) } } }
  await expect(prepareFiscalCreditDraft(altered, f.input, '20261023')).rejects.toThrow('FISCAL_PROPUESTA_NC_INVALIDA')
  await expect(prepareFiscalCreditDraft(f.source, f.input, 'PRIVATE_INVALID_CONTEXT')).rejects.toThrow('FISCAL_PROPUESTA_NC_INVALIDA')
})
