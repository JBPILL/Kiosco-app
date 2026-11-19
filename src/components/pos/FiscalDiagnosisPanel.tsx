import type { FiscalDiagnosis, FiscalDiagnosisCode } from '../../../supabase/functions/_shared/fiscalDiagnosis'

const consultationMessages: Record<FiscalDiagnosisCode, string> = {
  SOLICITUD_INVALIDA: 'Los datos del comprobante requieren revisión.',
  RESPUESTA_INVALIDA: 'No se pudo validar la respuesta de la consulta.',
  CONSULTA_DISTINTA: 'La consulta no corresponde al comprobante esperado.',
  DATOS_DISTINTOS: 'Los datos consultados difieren del comprobante guardado.',
  SIN_CONFIRMACION: 'La consulta no confirmó la autorización.',
}

export function FiscalDiagnosisPanel({ diagnosis }: { diagnosis: Readonly<FiscalDiagnosis> }) {
  const reception = diagnosis.recepcion, consultation = diagnosis.ultima_consulta
  return <section aria-label="Diagnóstico fiscal" className="space-y-3 rounded-lg border p-4">
    <h3 className="font-bold">Estado de la operación fiscal</h3>
    <p>{diagnosis.estado === 'AUTORIZADA' ? 'La autorización figura guardada. Consultá su constancia.' : diagnosis.estado === 'ENVIO_INCIERTO' ? 'El envío todavía requiere conciliación.' : 'El comprobante está reservado y aún no tiene un envío registrado.'}</p>
    <div><h4 className="font-bold">Respuesta de emisión</h4>
      {!reception ? <p>No hay una respuesta de emisión registrada. Eso no confirma un rechazo.</p>
        : reception.estado === 'RECHAZO_RECIBIDO' ? <p>{diagnosis.estado === 'AUTORIZADA' ? 'Se conserva un rechazo recibido previamente; la autorización guardada se consulta en la constancia.' : 'Se recibió un rechazo. La operación sigue pendiente de resolución; no habilita otro envío.'}</p>
          : reception.estado === 'APROBACION_RECIBIDA' ? <p>{diagnosis.estado === 'AUTORIZADA' ? 'Se conserva una aprobación recibida.' : 'Se recibió una aprobación, pero aún falta confirmar la autorización mediante conciliación.'}</p>
            : <p>La respuesta recibida no confirmó el resultado de la emisión.</p>}
      {reception && reception.codigos.length > 0 && <details><summary>Códigos informados ({reception.codigos.length})</summary><p className="break-words">{reception.codigos.join(' · ')}</p></details>}
    </div>
    <div><h4 className="font-bold">Última consulta registrada</h4><p>{!consultation ? 'No hay una consulta completa registrada.' : consultation.estado === 'AUTORIZACION_COINCIDENTE' ? 'La consulta completa confirmó los datos del comprobante.' : consultationMessages[consultation.codigo]}</p></div>
    {diagnosis.estado === 'ENVIO_INCIERTO' && <p className="font-bold">Conservá esta operación. No vuelvas a cobrar ni prepares otro comprobante para esta venta hasta resolverla.</p>}
  </section>
}
