import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { FiscalCreditCasesPanel } from '../components/pos/FiscalCreditCasesPanel'
import { fiscalCreditUnitsFixture } from './fixtures/fiscalCreditUnits'
import { validateFiscalCreditCommercialSource } from '../../supabase/functions/_shared/fiscalCreditCommercialSource'
import { validateFiscalCreditUnits } from '../../supabase/functions/_shared/fiscalCreditUnits'
import { validateFiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditContext'
import { fiscalCreditContextFixture } from './fixtures/fiscalCreditContext'
import { validateFiscalCreditHistory } from '../../supabase/functions/_shared/fiscalCreditHistory'
import { prepareFiscalCreditDraft } from '../../supabase/functions/_shared/fiscalCreditDraft'
import type { FiscalCreditHistory } from '../../supabase/functions/_shared/fiscalCreditHistory'
import type { FiscalRepresentation } from '../../supabase/functions/_shared/fiscalRepresentation'
import type { FiscalCreditClient, PendingFiscalCredit } from '../lib/fiscalCreditClient'
async function fixture() {
  const f = await fiscalCreditUnitsFixture(), page = await validateFiscalCreditHistory(f.page, f.source, 0)
  let pending: Readonly<PendingFiscalCredit> | null = null
  const credits = { commercial: {pending:vi.fn(()=>null),status:vi.fn<FiscalCreditClient['commercial']['status']>(async()=>null),recover:vi.fn<FiscalCreditClient['commercial']['recover']>(async()=>null),apply:vi.fn<FiscalCreditClient['commercial']['apply']>(),retry:vi.fn<FiscalCreditClient['commercial']['retry']>()}, pendingNumber: vi.fn(() => null), body: vi.fn(), number: vi.fn(), recoverNumber: vi.fn(), retryNumber: vi.fn(), pendingReview: vi.fn(() => null), review: vi.fn(), recoverReview: vi.fn(), approveReview: vi.fn(), retryReview: vi.fn(), pendingPreparation: vi.fn(() => null), recoverPreparation: vi.fn(), savePreparation: vi.fn(), preparation: vi.fn<FiscalCreditClient['preparation']>(async () => null), context: vi.fn<FiscalCreditClient['context']>(), units: vi.fn<FiscalCreditClient['units']>(async () => validateFiscalCreditUnits(f.packet, f.source, f.commercial)), commercialSource: vi.fn<FiscalCreditClient['commercialSource']>(async () => validateFiscalCreditCommercialSource(f.commercial, f.source)),
    pending: vi.fn(() => pending), save: vi.fn<FiscalCreditClient['save']>(),
    history: vi.fn<FiscalCreditClient['history']>(async () => page),
    recover: vi.fn<FiscalCreditClient['recover']>(async () => null),
    cancel: vi.fn<FiscalCreditClient['cancel']>(async () => ({ ...f.ack, estado: 'CANCELADA' })),
  }
  const client = { representation: vi.fn(async () => f.source), credits }
  const setPending = (value: Readonly<PendingFiscalCredit> | null): void => { pending = value }
  const record: Readonly<PendingFiscalCredit> = { version: 1, operationId: f.operation, requestId: f.input.solicitud_id, sha256: f.proposal.sha256, intention: 'GUARDAR' }
  const props = { client, receipt: f.source.constancia }
  const consult = (): void => { fireEvent.click(screen.getByRole('button', { name: 'Consultar casos guardados' })) }
  return { ...f, page, credits, client, props, record, setPending, consult }
}
it('consulta explícita muestra caso histórico sin presentar reserva como CAE ni emitir', async () => {
  const f = await fixture(); render(<FiscalCreditCasesPanel {...f.props} />)
  expect(f.client.representation).not.toHaveBeenCalled(); expect(f.credits.history).not.toHaveBeenCalled()
  f.consult(); await screen.findByRole('article', { name: 'Caso 1' })
  expect(screen.getByText('Guardado · sin emitir')).toBeTruthy()
  expect(screen.getByText('Devolución sintética')).toBeTruthy()
  expect(screen.getByText('Reposición solicitada, aún sin aplicar', { exact: false })).toBeTruthy()
  expect(f.credits.save).not.toHaveBeenCalled(); expect(f.credits.cancel).not.toHaveBeenCalled()
})
it('caso activo integra consulta de contexto y abrir cancelación retira el resultado',async()=>{
  const f=await fixture(),base=await fiscalCreditContextFixture()
  f.credits.context.mockResolvedValue(await validateFiscalCreditContext({...base.context,venta_id:f.sale,operacion_origen_id:f.operation,solicitud_id:f.input.solicitud_id,propuesta_sha256:f.proposal.sha256},f.source,f.proposal))
  render(<FiscalCreditCasesPanel {...f.props} />);f.consult()
  fireEvent.click(await screen.findByRole('button',{name:'Consultar contexto fiscal del caso 1'}))
  await screen.findByText('Nota de crédito C');expect(f.credits.context).toHaveBeenCalledExactlyOnceWith(f.source,f.proposal)
  fireEvent.click(screen.getByRole('button',{name:'Solicitar cancelación del caso 1'}))
  expect(screen.queryByText('Nota de crédito C')).toBeNull();expect(f.credits.save).not.toHaveBeenCalled()
})
async function openDraft(f: Awaited<ReturnType<typeof fixture>>) {
  f.credits.history.mockResolvedValue({ ...f.page, casos: [] })
  render(<FiscalCreditCasesPanel {...f.props} />); f.consult()
  const consultOriginal = await screen.findByRole('button', { name: 'Consultar datos originales' })
  await waitFor(() => expect(consultOriginal.hasAttribute('disabled')).toBe(false)); fireEvent.click(consultOriginal)
  await screen.findByRole('form', { name: 'Preparar caso NC' })
  const change = (label: string, value: string): void => { fireEvent.change(screen.getByLabelText(label), { target: { value } }) }
  change('Fecha del caso', '23/10/2026'); change('Motivo del caso', 'Caso explícito'); change('Código de condición IVA del receptor', '5')
  fireEvent.click(screen.getByLabelText('Incluir artículo 1')); change('Cantidad artículo 1', '2'); change('Importe artículo 1', '123,45')
  for (const label of ['Total del caso', 'Neto']) change(label, '123,45')
  for (const label of ['IVA total', 'No gravado', 'Exento', 'Otros tributos total']) change(label, '0')
  fireEvent.click(screen.getByLabelText('Confirmo estos datos para guardar un caso sin emitir ni entregar efectivo o reponer stock.'))
}
it('captura integrada confirma ACK exacto y recarga historial sin anunciar CAE ni emitir', async () => {
  const f = await fixture(); await openDraft(f)
  f.credits.save.mockImplementation(async (source, input) => {
    const proposal = await prepareFiscalCreditDraft(source, input, input.fecha)
    const ack = { ...f.ack, solicitud_id: input.solicitud_id, propuesta_sha256: proposal.sha256 }
    f.credits.history.mockResolvedValue(await validateFiscalCreditHistory({ ...f.page, casos: [{ secuencia: 1, acuse: ack, propuesta: { canonico: proposal.canonico, sha256: proposal.sha256 } }] }, source, 0))
    return ack
  })
  fireEvent.submit(screen.getByRole('form', { name: 'Preparar caso NC' }))
  await screen.findByText('Caso guardado y confirmado.', { exact: false })
  await screen.findByText('Caso explícito'); expect(f.credits.save).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Guardado · sin emitir')).toBeTruthy()
})
it('guardado incierto muestra pendiente recuperable y excluye otro envío de formulario', async () => {
  const f = await fixture(); await openDraft(f)
  f.credits.save.mockImplementation(async (source, input) => {
    const proposal = await prepareFiscalCreditDraft(source, input, input.fecha)
    f.setPending({ version: 1, operationId: f.operation, requestId: input.solicitud_id, sha256: proposal.sha256, intention: 'GUARDAR' })
    throw new Error('PRIVATE_NETWORK')
  })
  fireEvent.submit(screen.getByRole('form', { name: 'Preparar caso NC' }))
  await screen.findByRole('button', { name: 'Recuperar intento pendiente' })
  expect(screen.getByRole('alert').textContent).not.toContain('PRIVATE_NETWORK')
  fireEvent.submit(screen.getByRole('form', { name: 'Preparar caso NC' }))
  expect(f.credits.save).toHaveBeenCalledTimes(1); expect(screen.queryByText('Caso guardado y confirmado.', { exact: false })).toBeNull()
})
it('ACK de otro intento no confirma guardado ni actualiza historial', async () => {
  const f = await fixture(); await openDraft(f); f.credits.save.mockResolvedValue(f.ack)
  const reads = f.credits.history.mock.calls.length
  fireEvent.submit(screen.getByRole('form', { name: 'Preparar caso NC' }))
  await screen.findByRole('alert')
  expect(screen.queryByText('Caso guardado y confirmado.', { exact: false })).toBeNull()
  expect(f.credits.history).toHaveBeenCalledTimes(reads)
})
it('fallo de historial después de ACK exacto conserva confirmación y no ofrece otro envío', async () => {
  const f = await fixture(); await openDraft(f)
  f.credits.save.mockImplementation(async (source, input) => {
    const proposal = await prepareFiscalCreditDraft(source, input, input.fecha)
    f.credits.history.mockRejectedValue(new Error('PRIVATE_HISTORY'))
    return { ...f.ack, solicitud_id: input.solicitud_id, propuesta_sha256: proposal.sha256 }
  })
  fireEvent.submit(screen.getByRole('form', { name: 'Preparar caso NC' }))
  await screen.findByText('Caso guardado y confirmado.', { exact: false })
  expect((await screen.findByRole('alert')).textContent).toContain('El resultado del intento se confirmó')
  expect(screen.queryByRole('form', { name: 'Preparar caso NC' })).toBeNull()
  expect(f.credits.save).toHaveBeenCalledTimes(1)
})
it('cancelar exige confirmación y relee historial; no guarda una propuesta ni mueve efectivo', async () => {
  const f = await fixture(); render(<FiscalCreditCasesPanel {...f.props} />); f.consult()
  fireEvent.click(await screen.findByRole('button', { name: 'Solicitar cancelación del caso 1' }))
  const submit = screen.getByRole('button', { name: 'Confirmar cancelación del intento' })
  expect(submit.hasAttribute('disabled')).toBe(true); fireEvent.click(submit); expect(f.credits.cancel).not.toHaveBeenCalled()
  const canceled = await validateFiscalCreditHistory({ ...f.page, casos: [{ ...f.entry, acuse: { ...f.ack, estado: 'CANCELADA' } }] }, f.source, 0)
  f.credits.history.mockResolvedValue(canceled)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Confirmo que quiero cancelar este intento.' })); fireEvent.click(submit); fireEvent.click(submit)
  await screen.findByText('Cancelado · historial conservado')
  expect(f.credits.cancel).toHaveBeenCalledExactlyOnceWith(f.operation, f.record.requestId, f.record.sha256)
  expect(f.credits.save).not.toHaveBeenCalled(); expect(screen.queryByRole('button', { name: 'Solicitar cancelación del caso 1' })).toBeNull()
})
it('lectura vacía conserva pendiente; recuperar sin ACK no afirma cancelación', async () => {
  const f = await fixture(); f.setPending(f.record)
  f.credits.history.mockResolvedValue({ ...f.page, casos: [] })
  render(<FiscalCreditCasesPanel {...f.props} />); f.consult()
  await screen.findByText('No hay casos guardados en esta factura. Una consulta vacía no cancela un intento pendiente.')
  fireEvent.click(screen.getByRole('button', { name: 'Recuperar intento pendiente' }))
  await screen.findByText('Todavía no hay confirmación del intento.', { exact: false })
  expect(screen.getByLabelText('Intento NC pendiente')).toBeTruthy()
  expect(f.credits.cancel).not.toHaveBeenCalled(); expect(f.credits.pending()).toEqual(f.record)
})
it('recuperar cancelación aún no confirmada mantiene la intención y no informa éxito falso', async () => {
  const f = await fixture(); f.setPending({ ...f.record, intention: 'CANCELAR' }); f.credits.recover.mockResolvedValue(f.ack)
  render(<FiscalCreditCasesPanel {...f.props} />); f.consult(); await screen.findByRole('article')
  fireEvent.click(screen.getByRole('button', { name: 'Recuperar intento pendiente' }))
  await screen.findByText('El caso está guardado, pero su cancelación sigue pendiente.', { exact: false })
  expect(f.credits.pending()?.intention).toBe('CANCELAR'); expect(screen.queryByText('Cancelación confirmada. Se conserva el historial.')).toBeNull()
})
it('fallo de cancelación conserva pendiente y permite recuperar sin mostrar error privado', async () => {
  const f = await fixture(); f.credits.cancel.mockImplementation(async () => { f.setPending({ ...f.record, intention: 'CANCELAR' }); throw new Error('PRIVATE_SYNTHETIC_FAILURE') })
  render(<FiscalCreditCasesPanel {...f.props} />); f.consult()
  fireEvent.click(await screen.findByRole('button', { name: 'Solicitar cancelación del caso 1' }))
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación del intento' }))
  expect((await screen.findByRole('alert')).textContent).not.toContain('PRIVATE_SYNTHETIC_FAILURE')
  expect(screen.getByRole('button', { name: 'Recuperar intento pendiente' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Confirmar cancelación del intento' }).hasAttribute('disabled')).toBe(true)
})
it('cancelación confirmada de un intento sin caso retira pendiente y relee sin fabricar NC', async () => {
  const f = await fixture(); f.setPending(f.record); f.credits.history.mockResolvedValue({ ...f.page, casos: [] })
  f.credits.cancel.mockImplementation(async () => { f.setPending(null); return { ...f.ack, estado: 'CANCELADA' } })
  render(<FiscalCreditCasesPanel {...f.props} />); f.consult()
  const pendingCancel = await screen.findByRole('button', { name: 'Solicitar cancelación del pendiente' }); await waitFor(() => expect(pendingCancel.hasAttribute('disabled')).toBe(false)); fireEvent.click(pendingCancel)
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación del intento' }))
  await screen.findByText('Cancelación confirmada. La venta, el cobro y el historial se conservan.')
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Recuperar intento pendiente' })).toBeNull())
  expect(screen.queryByRole('article')).toBeNull()
})
it('otra fuente o un historial incoherente no muestran casos ni habilitan cancelación', async () => {
  const f = await fixture(), other = await fixture(); f.client.representation.mockResolvedValueOnce(other.source)
  render(<FiscalCreditCasesPanel {...f.props} />); f.consult(); await screen.findByRole('alert')
  expect(f.credits.history).not.toHaveBeenCalled(); expect(screen.queryByRole('article')).toBeNull()
  f.credits.history.mockResolvedValue({ ...f.page, venta_id: other.sale })
  f.consult(); await screen.findByRole('alert'); expect(screen.queryByRole('article')).toBeNull()
})
it('doble clic no duplica consulta y cambiar de factura descarta respuestas tardías', async () => {
  const f = await fixture(), other = await fixture(); let finish!: (source: Readonly<FiscalRepresentation>) => void
  f.client.representation.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const view = render(<FiscalCreditCasesPanel {...f.props} />); f.consult(); f.consult()
  expect(f.client.representation).toHaveBeenCalledTimes(1)
  view.rerender(<FiscalCreditCasesPanel {...other.props} />)
  await act(async () => { finish(f.source) })
  expect(f.credits.history).not.toHaveBeenCalled(); expect(other.client.representation).not.toHaveBeenCalled()
  expect(screen.queryByRole('article')).toBeNull()
})
it('cerrar durante historial descarta la respuesta sin ofrecer acciones tardías', async () => {
  const f = await fixture(); let finish!: (history: Readonly<FiscalCreditHistory>) => void
  f.credits.history.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const view = render(<FiscalCreditCasesPanel {...f.props} />); f.consult()
  await waitFor(() => expect(f.credits.history).toHaveBeenCalledTimes(1)); view.unmount()
  await act(async () => { finish(f.page) }); expect(f.credits.cancel).not.toHaveBeenCalled()
})
it('pagina sin ofrecer cancelar hasta conocer el último caso; conserva páginas ante fallo', async () => {
  const f = await fixture()
  const entries = await Promise.all(Array.from({ length: 11 }, async (_, index) => {
    const proposal = await prepareFiscalCreditDraft(f.source, { ...f.input, solicitud_id: crypto.randomUUID() }, f.input.fecha)
    return { secuencia: index + 1, propuesta: { canonico: proposal.canonico, sha256: proposal.sha256 }, acuse: { ...f.ack, solicitud_id: proposal.datos.solicitud_id, propuesta_sha256: proposal.sha256, estado: index === 10 ? 'SALDO_RESERVADO_NO_EMITIR' : 'CANCELADA' } }
  }))
  const first = await validateFiscalCreditHistory({ ...f.page, casos: entries.slice(0, 10), continuar_desde: 10 }, f.source, 0)
  const last = await validateFiscalCreditHistory({ ...f.page, casos: entries.slice(10), despues: 10 }, f.source, 10)
  f.credits.history.mockResolvedValueOnce(first).mockRejectedValueOnce(new Error('SYNTHETIC_NETWORK')).mockResolvedValueOnce(last)
  render(<FiscalCreditCasesPanel {...f.props} />); f.consult()
  const more = await screen.findByRole('button', { name: 'Ver más casos' }); await waitFor(() => expect(more.hasAttribute('disabled')).toBe(false))
  expect(screen.getAllByRole('article')).toHaveLength(10); expect(screen.queryByRole('button', { name: /Solicitar cancelación del caso/ })).toBeNull()
  fireEvent.click(more); await screen.findByRole('alert'); expect(screen.getAllByRole('article')).toHaveLength(10)
  fireEvent.click(more); await screen.findByRole('button', { name: 'Solicitar cancelación del caso 11' })
  expect(screen.getAllByRole('article')).toHaveLength(11); expect(screen.queryByRole('button', { name: 'Ver más casos' })).toBeNull()
  expect(f.credits.history.mock.calls.map(([, after]) => after)).toEqual([0, 10, 10])
})
it('si se confirma cancelación pero falla historial no deja el caso anterior como activo', async () => {
  const f = await fixture(); f.credits.history.mockResolvedValueOnce(f.page).mockRejectedValueOnce(new Error('SYNTHETIC_HISTORY_LOST'))
  render(<FiscalCreditCasesPanel {...f.props} />); f.consult()
  fireEvent.click(await screen.findByRole('button', { name: 'Solicitar cancelación del caso 1' }))
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación del intento' }))
  await screen.findByRole('alert'); expect(screen.getByText('Cancelación confirmada. La venta, el cobro y el historial se conservan.')).toBeTruthy()
  expect(screen.queryByRole('article')).toBeNull(); expect(screen.queryByText('No hay casos guardados en esta factura.', { exact: false })).toBeNull()
})
it('pendiente corrupto o de otra operación bloquea consulta y se conserva sin sustituir identidad', async () => {
  const f = await fixture(); f.setPending({ ...f.record, operationId: crypto.randomUUID() })
  render(<FiscalCreditCasesPanel {...f.props} />); f.consult(); await screen.findByRole('alert')
  expect(f.client.representation).not.toHaveBeenCalled(); expect(f.credits.cancel).not.toHaveBeenCalled()
  expect(f.credits.pending()?.operationId).not.toBe(f.operation)
  f.credits.pending.mockImplementation(() => { throw new Error('SYNTHETIC_CORRUPT_STORAGE') }); f.consult()
  expect((await screen.findByRole('alert')).textContent).not.toContain('SYNTHETIC_CORRUPT_STORAGE')
  expect(f.client.representation).not.toHaveBeenCalled()
})
