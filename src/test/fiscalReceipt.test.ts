// @vitest-environment node
import { expect, it } from 'vitest'
import { validateFiscalReceipt } from '../../supabase/functions/_shared/fiscalReceipt'
import { freezeFiscalRequest } from '../../supabase/functions/_shared/fiscalReconciliation'
import { wsfeSample } from './fixtures/fiscalWsfe'

const scope = { operationId: crypto.randomUUID(), saleId: crypto.randomUUID() }
async function receipt() {
  return { version: 1, entorno: 'HOMOLOGACION', estado: 'AUTORIZADA',
    operacion_id: scope.operationId, venta_id: scope.saleId, solicitud: await freezeFiscalRequest(wsfeSample),
    autorizacion: { cae: '11111111111111', vencimiento: '20261031', procesado_en: '20261021120000' as string | null } }
}

it('valida y congela copia del cuerpo y CAE sintéticos sin compartir referencias', async () => {
  const input = await receipt(), result = await validateFiscalReceipt(input, scope)
  input.autorizacion.cae = '22222222222222'
  expect(result.autorizacion.cae).toBe('11111111111111')
  expect(Object.isFrozen(result)).toBe(true)
  expect(Object.isFrozen(result.autorizacion)).toBe(true)
  expect(Object.isFrozen(result.solicitud.solicitud.importes)).toBe(true)
})

it.each(['RESERVADA', 'ENVIO_INCIERTO', 'APROBADA', undefined])('no convierte estado %s en autorización', async estado => {
  await expect(validateFiscalReceipt({ ...await receipt(), estado }, scope)).rejects.toThrow()
})
it.each(['operacion_id', 'venta_id'])('rechaza constancia de otra %s', async field => {
  await expect(validateFiscalReceipt({ ...await receipt(), [field]: crypto.randomUUID() }, scope)).rejects.toThrow()
})
it.each(['token', 'sign', 'credencial_id', 'aprobacion'])('rechaza metadato privado o ajeno %s', async field => {
  await expect(validateFiscalReceipt({ ...await receipt(), [field]: 'fixture' }, scope)).rejects.toThrow()
})
it.each(['', '00000000000000', '123', 11111111111111])('rechaza CAE inválido %s', async cae => {
  const input = await receipt()
  await expect(validateFiscalReceipt({ ...input, autorizacion: { ...input.autorizacion, cae } }, scope)).rejects.toThrow()
})
it.each(['20260230', '20261020', '31/10/2026', null])('rechaza vencimiento inválido %s', async vencimiento => {
  const input = await receipt()
  await expect(validateFiscalReceipt({ ...input, autorizacion: { ...input.autorizacion, vencimiento } }, scope)).rejects.toThrow()
})
it('rechaza cuerpo alterado que conserva hash anterior', async () => {
  const input = await receipt()
  await expect(validateFiscalReceipt({ ...input, solicitud: { ...input.solicitud,
    solicitud: { ...input.solicitud.solicitud, numero: 2 } } }, scope)).rejects.toThrow()
})
it('recupera autorización histórica sin exigir que el CAE siga vigente hoy', async () => {
  const input = await receipt()
  input.solicitud = await freezeFiscalRequest({ ...wsfeSample, fecha: '20200101' })
  input.autorizacion = { cae: '11111111111111', vencimiento: '20200111', procesado_en: null }
  expect((await validateFiscalReceipt(input, scope)).autorizacion.procesado_en).toBeNull()
})
it.each(['20260230120000', '20261021240000', '20261021126000', '20261021120060', ''])('rechaza fecha de proceso inválida %s', async procesado_en => {
  const input = await receipt()
  await expect(validateFiscalReceipt({ ...input, autorizacion: { ...input.autorizacion, procesado_en } }, scope)).rejects.toThrow()
})
it('rechaza Production, versión ajena y scope mal formado', async () => {
  const input = await receipt()
  await expect(validateFiscalReceipt({ ...input, entorno: 'PRODUCCION' }, scope)).rejects.toThrow()
  await expect(validateFiscalReceipt({ ...input, version: 2 }, scope)).rejects.toThrow()
  await expect(validateFiscalReceipt(input, { ...scope, saleId: 'otra' })).rejects.toThrow()
})
it('rechaza autorización incompleta o con campos adicionales', async () => {
  const input = await receipt()
  await expect(validateFiscalReceipt({ ...input, autorizacion: { cae: input.autorizacion.cae } }, scope)).rejects.toThrow()
  await expect(validateFiscalReceipt({ ...input, autorizacion: { ...input.autorizacion, sign: 'fixture' } }, scope)).rejects.toThrow()
})
it('retiene identidad y valores capturados antes de la validación asíncrona', async () => {
  const input = await receipt(), mutableScope = { ...scope }
  const pending = validateFiscalReceipt(input, mutableScope)
  mutableScope.saleId = crypto.randomUUID()
  input.autorizacion.cae = '22222222222222'
  input.autorizacion.vencimiento = '20260230'
  const result = await pending
  expect(result.venta_id).toBe(scope.saleId)
  expect(result.autorizacion.cae).toBe('11111111111111')
  expect(result.autorizacion.vencimiento).toBe('20261031')
})
