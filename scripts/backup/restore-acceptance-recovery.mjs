// Administrative READ ONLY recovery; never grant authenticated access to the operation table.
import { inspectRestoreJournal, loadRestorePlan, PLAN_HASH, valueHash } from './restore-acceptance-engine.mjs'
const plan = loadRestorePlan()
const fail = code => { throw Error(code) }
const quote = value => "'" + String(value).replaceAll("'", "''") + "'"
function context(journal) {
  const state = inspectRestoreJournal(journal), intent = state.pending
  if (!intent) fail('RESTORE_NO_PENDING_INTENT')
  const step = [...plan.steps, ...plan.cashierDeniedCalls].find(row => row.rpc === intent.rpc && valueHash(row.params) === intent.paramsHash)
  if (!step) fail('RESTORE_RECOVERY_CONTEXT_INVALID')
  const p = step.params
  const request = step.rpc === 'restaurar_contacto_backup' ? { tabla: p.p_tabla, registro_id: p.p_registro_id, datos: p.p_datos, actor_auth_id: intent.actorAuthId }
    : step.rpc === 'restaurar_producto_backup' ? { producto_id: p.p_producto_id, datos: p.p_datos, actor_auth_id: intent.actorAuthId }
      : { lote_id: p.p_lote_id, datos: p.p_datos, actor_auth_id: intent.actorAuthId }
  if (valueHash(request) !== intent.requestHash) fail('RESTORE_RECOVERY_CONTEXT_INVALID')
  return { state, intent, step, request }
}
export function buildUncertainRestoreReadSql(journal) {
  const { state, intent, step, request } = context(journal)
  const role = intent.actorAuthId === state.actors.OWNER ? 'DUE\u00d1O' : 'CAJERO'
  const type = step.rpc === 'restaurar_contacto_backup' ? 'BACKUP_CONTACTO' : step.rpc === 'restaurar_producto_backup' ? 'BACKUP_PRODUCTO' : 'BACKUP_LOTE'
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='10s';
WITH scope AS (
 SELECT current_user='postgres' AND EXISTS(
   SELECT 1 FROM public.usuarios u JOIN public.kioscos k ON k.id=u.kiosco_id
   WHERE u.auth_user_id=${quote(intent.actorAuthId)}::uuid AND u.kiosco_id=${quote(plan.kioskId)}::uuid
     AND u.activo AND u.es_superadmin IS FALSE AND u.rol=${quote(role)} AND k.estado_suscripcion='ACTIVO'
 ) AS context_matches
), observed AS (
 SELECT scope.context_matches,o.*,
   coalesce(o.kiosco_id=${quote(plan.kioskId)}::uuid AND o.tipo=${quote(type)}
     AND o.solicitud=${quote(JSON.stringify(request))}::jsonb,false) AS bound
 FROM scope LEFT JOIN public.operaciones_escritura o ON o.id=${quote(intent.operationId)}::uuid
)
SELECT jsonb_build_object(
 'read_only',current_setting('transaction_read_only'),'plan_hash',${quote(PLAN_HASH)},
 'operation_id',${quote(intent.operationId)},'request_hash',${quote(intent.requestHash)},
 'context_matches',context_matches,
 'state',CASE WHEN NOT context_matches THEN 'CONFLICT' WHEN id IS NULL THEN 'ABSENT'
   WHEN NOT bound THEN 'CONFLICT' WHEN resultado IS NULL THEN 'RESULT_PENDING' ELSE 'BOUND' END,
 'solicitud',CASE WHEN context_matches AND bound THEN solicitud ELSE NULL END,
 'resultado',CASE WHEN context_matches AND bound THEN resultado ELSE NULL END
) AS evidence FROM observed;
ROLLBACK;
`
}
export function decodeUncertainRestoreRead(journal, evidence) {
  const { intent } = context(journal)
  if (evidence?.read_only !== 'on' || evidence.plan_hash !== PLAN_HASH || evidence.operation_id !== intent.operationId || evidence.request_hash !== intent.requestHash || evidence.context_matches !== true) fail('RESTORE_RECOVERY_QUERY_NOT_CONFIRMED')
  if (evidence.state === 'ABSENT') return null // Never a permit to resend.
  if (evidence.state !== 'BOUND' || !evidence.solicitud || !evidence.resultado || valueHash(evidence.solicitud) !== intent.requestHash) fail('RESTORE_RECOVERY_QUERY_CONFLICT')
  return { operationId: intent.operationId, kioskId: plan.kioskId, actorAuthId: intent.actorAuthId, requestHash: intent.requestHash, ack: evidence.resultado }
}
