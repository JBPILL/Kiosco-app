import { FiscalPresentationForm } from './FiscalPresentationForm'
import type { FiscalPresentationContext } from '../../../supabase/functions/_shared/fiscalPresentationContext'
import type { FiscalPresentationFacts,FiscalPresentationRecord } from '../../../supabase/functions/_shared/fiscalPresentation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { FiscalPreparationForm } from './FiscalPreparationForm'
import { FiscalOwnerReviewPanel } from './FiscalOwnerReviewPanel'
import { FiscalReceiptPanel } from './FiscalReceiptPanel'
import { FiscalRepresentationExport } from './FiscalRepresentationExport'
import { FiscalCreditCasesPanel } from './FiscalCreditCasesPanel'
import { casosNotasCreditoHomologacionActivos } from '../../lib/pilotExpansion'
import type { FiscalReceipt } from '../../../supabase/functions/_shared/fiscalReceipt'
import type { FiscalDiagnosis } from '../../../supabase/functions/_shared/fiscalDiagnosis'
import { FiscalDiagnosisPanel } from './FiscalDiagnosisPanel'
import { FiscalPreparationCancellationPanel } from './FiscalPreparationCancellationPanel'
import type { FiscalClient, FiscalClientScope } from '../../lib/fiscalClient'
import type { FiscalPreparationContext, FiscalPreparationInput, FiscalSaleResolution } from '../../../supabase/functions/_shared/fiscalPreparationContract'
import type { FiscalOwnerReview } from '../../../supabase/functions/_shared/fiscalOwnerReview'

interface Props { isOpen: boolean; onClose: () => void; scope: FiscalClientScope; client?: FiscalClient }
export function FiscalDocumentModal(props: Props) {
  if (!props.isOpen) return null
  return <DocumentBody key={`${props.scope.authId}:${props.scope.kioskId}:${props.scope.saleId}`} {...props} />
}
function DocumentBody({ onClose, scope, client: provided }: Props) {
  const { authId, kioskId, saleId } = scope
  const [loadedClient, setClient] = useState<FiscalClient | null>(null)
  const client = provided ?? loadedClient
  const [context, setContext] = useState<FiscalPreparationContext | null>(null)
  const [resolution, setResolution] = useState<Readonly<FiscalSaleResolution> | null>(null)
  const [review, setReview] = useState<Readonly<FiscalOwnerReview> | null>(null)
  const [presentation,setPresentation]=useState<Readonly<FiscalPresentationRecord>|null>(null)
  const [presentationContext,setPresentationContext]=useState<Readonly<FiscalPresentationContext>|null>(null)
  const [receipt, setReceipt] = useState<Readonly<FiscalReceipt> | null>(null)
  const [diagnosis, setDiagnosis] = useState<Readonly<FiscalDiagnosis> | null>(null)
  const [hasPendingObservation, setHasPendingObservation] = useState(false)
  const [consultConfirmed, setConsultConfirmed] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const reconciliationInFlight = useRef(false)
  const [diagnosisError, setDiagnosisError] = useState('')
  const [approvalId, setApprovalId] = useState('')
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [discardConfirmed, setDiscardConfirmed] = useState(false)
  const [correctionKind, setCorrectionKind] = useState<'RESERVA' | 'RECHAZO'>('RESERVA')
  const [correcting, setCorrecting] = useState(false)
  const [correctionConfirmed, setCorrectionConfirmed] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [hasPendingReplacement, setHasPendingReplacement] = useState(false)
  const replacementInFlight = useRef(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const saveInFlight = useRef(false)
  const preparationInFlight = useRef(false)
  const cancellationInFlight = useRef(false)
  const alive = useRef(true)
  const cancelRequests = useCallback(() => { alive.current = false; generation.current++ }, [])
  const [pendingInput, setPendingInput] = useState<FiscalPreparationInput | null>(null)
  const [hasLocalRecord, setHasLocalRecord] = useState(false)
  const [pendingOperationId, setPendingOperationId] = useState<string | null>(null)
  const load = useCallback(async (api: FiscalClient) => {
    const current = ++generation.current
    let stateRecovered = false
    setDiscardConfirmed(false); setCorrecting(false); setCorrectionConfirmed(false); setHasPendingReplacement(false); setHasPendingObservation(false); setConsultConfirmed(false)
    setBusy(true); setError(''); setDiagnosisError(''); setDiagnosis(null); setContext(null); setReview(null); setPresentation(null); setPresentationContext(null); setReceipt(null); setResolution(null)
    try {
      let state = await api.resolve()
      if (generation.current !== current) return
      stateRecovered = true
      setResolution(state)
      const correction = api.pendingReplacement()
      setHasPendingReplacement(!!correction); setCorrectionKind(correction?.version === 2 ? 'RECHAZO' : 'RESERVA')
      const observation = api.pendingObservation(); setHasPendingObservation(!!observation)
      if (correction || observation) return
      let loadedDiagnosis: Readonly<FiscalDiagnosis> | null = null
      if (['ENVIO_INCIERTO', 'AUTORIZADA'].includes(state.estado) && state.operacion_id) {
        try {
          const values = await api.diagnosis(state.operacion_id)
          if (generation.current !== current) return
          if (values.estado === 'RESERVADA' || state.estado === 'AUTORIZADA' && values.estado !== 'AUTORIZADA') throw new Error('FISCAL_ESTADO_NO_CONFIRMADO')
          loadedDiagnosis = values; setDiagnosis(values)
          if (values.estado === 'AUTORIZADA') { state = { ...state, estado: 'AUTORIZADA' }; setResolution(state) }
        } catch {
          if (generation.current !== current) return
          setDiagnosisError('No se pudo confirmar el diagnóstico de recepción y consulta. Volvé a consultar el estado; conservá la operación original.')
        }
      }
      if (state.estado === 'SIN_PREPARACION') {
        const pending = api.pending()
        setHasLocalRecord(!!pending); setPendingInput(pending?.input ?? null)
        setPendingOperationId(pending?.operationId ?? null)
        if (!pending) {
          const values = await api.context()
          if (generation.current !== current) return
          setContext(values)
        }
      } else if (state.estado === 'AUTORIZADA' && state.operacion_id) {
        const values = await api.receipt(state.operacion_id)
        if (generation.current !== current) return
        if (loadedDiagnosis && values.solicitud.sha256 !== loadedDiagnosis.solicitud_sha256) throw new Error('FISCAL_ESTADO_NO_CONFIRMADO')
        setReceipt(values)
      } else if (['RESERVADA', 'ENVIO_INCIERTO'].includes(state.estado) && state.operacion_id) {
        let values = await api.review(state.operacion_id)
        if (generation.current !== current) return
        if (state.estado === 'ENVIO_INCIERTO' && values.estado === 'RESERVADA') throw new Error('FISCAL_ESTADO_NO_CONFIRMADO')
        if (loadedDiagnosis && values.solicitud.sha256 !== loadedDiagnosis.solicitud_sha256) throw new Error('FISCAL_ESTADO_NO_CONFIRMADO')
        if(values.estado==='RESERVADA'){
          const [source,record]=await Promise.all([api.presentationContext(state.operacion_id),api.presentation(state.operacion_id)])
          if(generation.current!==current)return
          if(source.solicitud_sha256!==values.solicitud.sha256||record&&record.solicitud_sha256!==values.solicitud.sha256)throw new Error('FISCAL_REPRESENTACION_DISTINTA')
          setPresentationContext(source);setPresentation(record)
          if(record&&values.aprobacion){
            const bound=await api.presentationApproval(values,record,values.aprobacion.id)
            if(generation.current!==current)return
            if(!bound)throw new Error('FISCAL_APROBACION_NO_LIGADA')
            values={...values,aprobacion:bound}
          }else if(!record&&values.aprobacion){
            setError('La revisión anterior no incluye datos históricos de representación. Usá la corrección conservando el número para preparar una nueva revisión.')
          }
        }
        setApprovalId(values.aprobacion?.id ?? (values.estado === 'RESERVADA' ? api.approvalId(values) : ''))
        setReview(values)
      }
    } catch {
      if (generation.current === current) {
        try { setHasPendingObservation(!!api.pendingObservation()) } catch { /* Conservar también registros ilegibles. */ }
        try { const correction = api.pendingReplacement(); setHasPendingReplacement(!!correction); setCorrectionKind(correction?.version === 2 ? 'RECHAZO' : 'RESERVA') } catch { /* El error permanece; no se descartan registros ilegibles. */ }
        setError(stateRecovered
          ? 'Se recuperó el estado fiscal, pero no se pudieron cargar sus datos. Volvé a consultar; no prepares otro comprobante.'
          : 'No se pudo confirmar el estado fiscal. Conservá la venta y volvé a consultar; no prepares otro comprobante.')
      }
    } finally { if (generation.current === current) setBusy(false) }
  }, [])
  useEffect(() => {
    let active = true
    alive.current = true
    if (provided) { void Promise.resolve().then(() => { if (active) return load(provided) }) }
    else {
      void import('../../lib/fiscalBrowserClient').then(module => {
        if (!active) return
        const api = module.createFiscalBrowserClient({ authId, kioskId, saleId })
        setClient(api); return load(api)
      }).catch(() => { if (active) { setError('La preparación fiscal de homologación todavía no está disponible.'); setBusy(false) } })
    }
    return () => { active = false; cancelRequests() }
  }, [provided, authId, kioskId, saleId, load, cancelRequests])
  async function save(input: FiscalPreparationInput) {
    if (!client || saveInFlight.current || cancellationInFlight.current || replacementInFlight.current || reconciliationInFlight.current) return
    saveInFlight.current = true
    setSaving(true)
    const current = generation.current
    try {
      await client.save(input, context ?? undefined)
      if (generation.current === current) await load(client)
    } finally { saveInFlight.current = false; if (alive.current) setSaving(false) }
  }
  async function savePresentation(facts:FiscalPresentationFacts){
    if(!client||!review||!presentationContext||saveInFlight.current||replacementInFlight.current||reconciliationInFlight.current)return
    saveInFlight.current=true;setSaving(true)
    const current=generation.current
    try{await client.savePresentation(review,presentationContext,facts);if(generation.current===current)await load(client)}
    finally{saveInFlight.current=false;if(alive.current)setSaving(false)}
  }
  async function prepareBody() {
    if (!client || !resolution?.operacion_id || preparationInFlight.current || cancellationInFlight.current || replacementInFlight.current || reconciliationInFlight.current) return
    preparationInFlight.current = true; setPreparing(true); setError('')
    const current = generation.current
    try {
      await client.prepare(resolution.operacion_id)
      if (generation.current === current) await load(client)
    } catch {
      if (generation.current === current) setError('No se confirmó la preparación del comprobante. Volvé a consultar su estado; no prepares otro comprobante para esta venta.')
    } finally { preparationInFlight.current = false; if (alive.current) setPreparing(false) }
  }
  async function cancelPreparation(operationId: string) {
    if (!client || cancellationInFlight.current || preparationInFlight.current || saveInFlight.current || replacementInFlight.current || reconciliationInFlight.current) return
    cancellationInFlight.current = true; setCancelling(true); setError('')
    const current = generation.current
    try {
      await client.cancel(operationId)
      if (generation.current === current) await load(client)
    } catch {
      if (generation.current === current) setError('No se confirmó la cancelación. Conservá el intento original y volvé a consultar su estado antes de cargar otros datos.')
    } finally { cancellationInFlight.current = false; if (alive.current) setCancelling(false) }
  }
  const canCorrectRejected = resolution?.estado === 'ENVIO_INCIERTO' && review?.estado === 'ENVIO_INCIERTO'
    && diagnosis?.estado === 'ENVIO_INCIERTO' && diagnosis.solicitud_sha256 === review.solicitud.sha256
    && diagnosis.recepcion?.estado === 'RECHAZO_RECIBIDO'
    && !['DATOS_DISTINTOS', 'CONSULTA_DISTINTA'].includes(diagnosis.ultima_consulta?.codigo ?? '')
  async function beginCorrection() {
    if (!client || !review || !(review.estado === 'RESERVADA' && resolution?.estado === 'RESERVADA' || canCorrectRejected) || replacementInFlight.current || reconciliationInFlight.current) return
    replacementInFlight.current = true; setReplacing(true); setError(''); setConsultConfirmed(false)
    const current = generation.current
    try {
      const values = await client.context()
      if (generation.current === current) { setContext(values); setCorrecting(true); setCorrectionKind(canCorrectRejected ? 'RECHAZO' : 'RESERVA'); setCorrectionConfirmed(false) }
    } catch {
      if (generation.current === current) setError('No se pudieron cargar los datos para corregir. Conservá la preparación y consultá su estado.')
    } finally { replacementInFlight.current = false; if (alive.current) setReplacing(false) }
  }
  async function replacePreparation(input?: FiscalPreparationInput) {
    if (!client || replacementInFlight.current || saveInFlight.current || preparationInFlight.current || cancellationInFlight.current || reconciliationInFlight.current) return
    if (!input && correctionKind === 'RECHAZO' && !correctionConfirmed) return
    if (input && (!review || !context || !correcting || !correctionConfirmed)) return
    replacementInFlight.current = true; setReplacing(true); setError('')
    const current = generation.current
    try {
      if (input && review && context) {
        if (correctionKind === 'RECHAZO') { if (!canCorrectRejected) return; await client.replace(review, input, context, 'RECHAZO') }
        else await client.replace(review, input, context)
      }
      else await client.retryReplacement()
      if (generation.current === current) await load(client)
    } catch {
      if (generation.current === current) {
        const pending = !!client.pendingReplacement()
        setHasPendingReplacement(pending)
        if (pending) { setCorrecting(false); setContext(null) }
        setError('No se confirmó la corrección. Conservá la propuesta guardada y consultá el estado antes de reintentar. No se habilitó otro envío.')
      }
      throw new Error('FISCAL_SUSTITUCION_NO_CONFIRMADA')
    } finally { replacementInFlight.current = false; if (alive.current) setReplacing(false) }
  }
  async function discardReplacement() {
    if (!client || !discardConfirmed || replacementInFlight.current || reconciliationInFlight.current) return
    replacementInFlight.current = true; setReplacing(true); setError('')
    const current = generation.current
    try {
      await client.cancelReplacement()
      if (generation.current === current) await load(client)
    } catch {
      if (generation.current === current) setError('No se confirmó el descarte de la propuesta. Conservá el intento y consultá el estado. El número original no se cancela.')
    } finally { replacementInFlight.current = false; if (alive.current) setReplacing(false) }
  }
  async function reconcile() {
    if (!client || !consultConfirmed || reconciliationInFlight.current || replacementInFlight.current || preparationInFlight.current || saveInFlight.current || cancellationInFlight.current) return
    if (!hasPendingObservation && (!review || review.estado !== 'ENVIO_INCIERTO' || resolution?.estado !== 'ENVIO_INCIERTO')) return
    reconciliationInFlight.current = true; setReconciling(true); setError('')
    const current = generation.current
    try {
      if (hasPendingObservation) await client.retryReconciliation()
      else if (review) await client.reconcile(review)
      if (generation.current === current) await load(client)
    } catch {
      if (generation.current === current) {
        try { setHasPendingObservation(!!client.pendingObservation()) } catch { /* No borrar datos inciertos. */ }
        setConsultConfirmed(false)
        setError('No se confirmó la consulta. Conservá el intento guardado y volvé a consultar su estado. No reenvíes la factura ni vuelvas a cobrar.')
      }
    } finally { reconciliationInFlight.current = false; if (alive.current) setReconciling(false) }
  }
  const cancelTarget = resolution?.estado === 'DATOS_PREPARADOS' ? resolution.operacion_id
    : resolution?.estado === 'SIN_PREPARACION' && hasLocalRecord ? pendingOperationId : null
  return <Modal isOpen onClose={onClose} title="Preparación y revisión fiscal · Homologación" size="xl" footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
    <div className="space-y-4">
      {busy && <p role="status">Consultando el estado fiscal de la venta…</p>}
      {error && <p role="alert">{error}</p>}
      {diagnosisError && <p role="alert">{diagnosisError}</p>}
      {!busy && diagnosis && <FiscalDiagnosisPanel diagnosis={diagnosis} />}
      {!busy && client && !hasPendingReplacement && !correcting && (hasPendingObservation || review?.estado === 'ENVIO_INCIERTO' && resolution?.estado === 'ENVIO_INCIERTO') && <section aria-label="Consultar resultado en ARCA" className="rounded-lg border p-4 space-y-3">
        <h3 className="font-bold">{hasPendingObservation ? 'Consulta fiscal pendiente' : 'Consultar el resultado del envío'}</h3>
        <p>{hasPendingObservation ? 'Este equipo conserva una consulta pendiente. Se recuperará el mismo intento; no se enviará otra factura.' : 'Se consultará el comprobante original en ARCA de homologación. Esta acción no reenvía la factura ni modifica el cobro, el stock o la caja.'}</p>
        <label className="flex items-start gap-2"><input type="checkbox" checked={consultConfirmed} disabled={reconciling} onChange={event => setConsultConfirmed(event.target.checked)} />Confirmo que quiero consultar ARCA en homologación, sin reenviar la factura ni volver a cobrar.</label>
        <Button disabled={!consultConfirmed} loading={reconciling} onClick={() => { void reconcile() }}>{hasPendingObservation ? 'Recuperar consulta guardada' : 'Consultar en ARCA sin reenviar'}</Button>
      </section>}
      {!busy && hasPendingReplacement && <section className="rounded-lg border p-4 space-y-3" aria-label="Corrección fiscal pendiente">
        <p role="status">Este equipo conserva una corrección pendiente. Se recuperará la misma propuesta y el mismo número; no apruebes el cuerpo anterior.</p>
        {correctionKind === 'RECHAZO' && <label className="flex items-start gap-2"><input type="checkbox" checked={correctionConfirmed} disabled={replacing} onChange={event => setCorrectionConfirmed(event.target.checked)} />Autorizo consultar el estado en ARCA de homologación para recuperar esta corrección, sin emitir.</label>}
        <Button disabled={correctionKind === 'RECHAZO' && !correctionConfirmed} loading={replacing} onClick={() => { void replacePreparation().catch(() => {}) }}>Reintentar corrección guardada</Button>
        <p>Si la propuesta todavía no se guardó en el servidor, podés descartarla para corregir sus datos. Si ya se confirmó, se recuperará esa preparación. El número reservado se conserva en ambos casos.</p>
        <label className="flex items-start gap-2"><input type="checkbox" checked={discardConfirmed} disabled={replacing} onChange={event => setDiscardConfirmed(event.target.checked)} />Quiero descartar sólo la propuesta no confirmada.</label>
        <Button variant="secondary" disabled={!discardConfirmed} loading={replacing} onClick={() => { void discardReplacement() }}>Descartar propuesta no confirmada</Button>
      </section>}
      {!busy && correcting && <section className="rounded-lg border p-4 space-y-3" aria-label="Confirmar corrección fiscal">
        <h3 className="font-bold">{correctionKind === 'RECHAZO' ? 'Corregir un comprobante rechazado' : 'Corregir datos antes del envío'}</h3>
        <p>Se conserva el número, la venta y el historial. La nueva preparación necesita otra revisión y no hereda permiso de emisión. Completá nuevamente los datos; el tipo de comprobante y la serie deben mantenerse.</p>
        <label className="flex items-start gap-2"><input type="checkbox" checked={correctionConfirmed} disabled={replacing} onChange={event => setCorrectionConfirmed(event.target.checked)} />{correctionKind === 'RECHAZO' ? 'Confirmo la corrección del rechazo y las consultas de recuperación en ARCA de homologación, sin emitir.' : 'Confirmo que quiero sustituir esta preparación conservando su número.'}</label>
        <Button variant="secondary" disabled={replacing} onClick={() => { setCorrecting(false); setContext(null); setCorrectionConfirmed(false) }}>Volver a la revisión anterior</Button>
      </section>}
      {!busy && context && !hasPendingReplacement && <FiscalPreparationForm context={context} onPrepare={correcting ? replacePreparation : save} disabled={correcting && (!correctionConfirmed || replacing)} submitLabel={correcting ? 'Guardar corrección y revisar de nuevo' : undefined} />}
      {!busy && resolution?.estado === 'SIN_PREPARACION' && hasLocalRecord && <div className="space-y-3"><p>Este equipo conserva un guardado pendiente. Recuperá el mismo intento antes de cargar otros datos.</p>{pendingInput && <Button disabled={cancelling} loading={saving} onClick={() => { const current = generation.current; void save(pendingInput).catch(() => { if (generation.current === current) setError('No se confirmó el guardado. Volvé a consultar su estado antes de reintentar.') }) }}>Reintentar datos guardados</Button>}</div>}
      {!busy && resolution?.estado === 'DATOS_PREPARADOS' && <div className="space-y-3"><p role="status">Datos fiscales guardados. Todavía falta preparar el cuerpo del comprobante para revisión; no se emitió una factura ni se obtuvo un CAE.</p>{client && <Button disabled={cancelling} loading={preparing} onClick={() => { void prepareBody() }}>Preparar comprobante para revisar</Button>}</div>}
      {!busy && client && cancelTarget && <FiscalPreparationCancellationPanel key={cancelTarget} disabled={saving || preparing} loading={cancelling} onCancel={() => cancelPreparation(cancelTarget)} />}
      {!busy && resolution?.estado === 'REGISTRO_FISCAL_HEREDADO' && <p role="status">Existe un registro fiscal anterior. Consultá la constancia original; no se preparará otro comprobante desde esta venta.</p>}
      {!busy && resolution?.estado === 'REQUIERE_REVISION' && <p role="status">La operación existente requiere revisión de su identidad o contexto. No se iniciará otra preparación.</p>}
      {!busy && resolution?.estado === 'NO_DISPONIBLE' && <p role="status">Esta venta no está disponible para preparar un comprobante fiscal.</p>}
      {!busy && resolution?.estado === 'AUTORIZADA' && !receipt && <p role="status">La operación figura autorizada en el servidor. Falta recuperar su constancia fiscal; no se iniciará otra preparación.</p>}
      {!busy && receipt && <FiscalReceiptPanel receipt={receipt} />}
      {!busy && receipt && client && <FiscalRepresentationExport client={client} receipt={receipt} />}
      {!busy && receipt && client && casosNotasCreditoHomologacionActivos() && <FiscalCreditCasesPanel client={client} receipt={receipt} />}
      {!busy&&review?.estado==='RESERVADA'&&presentationContext&&!presentation&&!review.aprobacion&&!correcting&&!hasPendingReplacement&&!hasPendingObservation&&!reconciling&&!replacing&&<FiscalPresentationForm key={`${review.operacion_id}:${review.solicitud.sha256}`} context={presentationContext} disabled={saving} onSave={savePresentation}/>}
      {!busy && review && client && (review.estado!=='RESERVADA'||presentation) && !correcting && !hasPendingReplacement && !hasPendingObservation && !reconciling && !replacing && <FiscalOwnerReviewPanel review={review} presentation={presentation??undefined} approvalId={approvalId} onApprove={command => {if(!presentation)throw new Error('FISCAL_REPRESENTACION_REQUERIDA');return client.approvePresentation(review,presentation,command.id)}} />}
      {!busy && client && canCorrectRejected && !correcting && !hasPendingReplacement && !hasPendingObservation && <Button variant="secondary" disabled={reconciling} loading={replacing} onClick={() => { void beginCorrection() }}>Corregir datos del comprobante rechazado</Button>}
      {!busy && client && review?.estado === 'RESERVADA' && resolution?.estado === 'RESERVADA' && !correcting && !hasPendingReplacement && <Button variant="secondary" disabled={reconciling} loading={replacing} onClick={() => { void beginCorrection() }}>Corregir datos conservando el número</Button>}
      {!busy && client && <Button variant="secondary" disabled={saving || preparing || cancelling || replacing || correcting || reconciling} onClick={() => { void load(client) }}>Volver a consultar estado</Button>}
    </div>
  </Modal>
}
