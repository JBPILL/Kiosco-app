#!/usr/bin/env node
/** Offline plan only: reviewed F6 Production baseline, no Auth creation or payments. */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
export function planProductionInstall(input) {
  if (!input || input.projectRef !== 'lllkjnqpltnwvxzphncr') throw new Error('Only the reviewed F6 Production ref is supported.')
  if (input.monthlyPrice !== 30000 || input.coverageMonths !== 1 || input.trialPrice !== 0 || input.trialDays !== 30)
    throw new Error('Commercial coverage differs from the authorized monthly/trial offer.')
  if (typeof input.adminEmail !== 'string' || input.adminEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.adminEmail))
    throw new Error('Existing confirmed SuperAdmin identity required.')
  const module = readFileSync(path.join(root, 'supabase_fase_comercial_suscripciones.sql'))
  const manifest = JSON.parse(readFileSync(path.join(root, 'supabase/bootstrap/manifest.json'), 'utf8'))
  if (digest(module) !== manifest.optionalModules.commercial.incrementalSha256) throw new Error('Commercial module checksum mismatch.')
  const email = `'${input.adminEmail.trim().toLowerCase().replaceAll("'", "''")}'`
  return `-- OFFLINE PLAN. Explicit CLI target: lllkjnqpltnwvxzphncr. No baseline reinstall.
BEGIN;
SET LOCAL lock_timeout='10s';
LOCK TABLE public.kioscos,public.usuarios IN ACCESS EXCLUSIVE MODE;
DO $preflight$
BEGIN
  IF current_user<>'postgres' THEN RAISE EXCEPTION 'postgres operator required'; END IF;
  IF (SELECT count(*) FROM pg_tables WHERE schemaname='public')<>43
    OR to_regclass('public.suscripciones') IS NOT NULL
    OR to_regclass('public.operaciones_comerciales') IS NOT NULL
    OR to_regprocedure('public.guardar_producto_transaccional(uuid,uuid,jsonb)') IS NULL
    OR (SELECT count(*) FROM public.kioscos)<>1
    OR (SELECT count(*) FROM public.usuarios WHERE es_superadmin AND activo AND kiosco_id IS NULL)<>1
    OR (SELECT count(*) FROM public.usuarios p JOIN auth.users a ON a.id=p.auth_user_id
      WHERE p.es_superadmin AND p.activo AND p.kiosco_id IS NULL AND lower(a.email)=${email} AND a.email_confirmed_at IS NOT NULL)<>1
  THEN RAISE EXCEPTION 'Reviewed Production prerequisites differ; no installation applied'; END IF;
END $preflight$;
${module.toString('utf8').replace(/^\s*(BEGIN|COMMIT);\s*$/gmi, '')}
DO $coverage$
DECLARE aid uuid; actor uuid; kid uuid; paid uuid:=gen_random_uuid(); trial uuid:=gen_random_uuid();
  sid uuid:=gen_random_uuid(); op uuid:=gen_random_uuid(); ack jsonb;
  coverage date:=(public.comercial_hoy()+interval '1 month')::date;
BEGIN
  SELECT p.id,p.auth_user_id INTO STRICT actor,aid FROM public.usuarios p JOIN auth.users a ON a.id=p.auth_user_id
    WHERE p.es_superadmin AND p.activo AND p.kiosco_id IS NULL AND lower(a.email)=${email};
  SELECT id INTO STRICT kid FROM public.kioscos;
  PERFORM set_config('request.jwt.claim.sub',aid::text,true);
  ack:=public.actualizar_plan(gen_random_uuid(),paid,'Plan mensual',30000,3,true,'Cobertura mensual; regularización manual');
  ack:=public.actualizar_plan(gen_random_uuid(),trial,'Prueba inicial gratuita',0,3,true,'Primer período de prueba de 30 días para nuevos clientes; luego seleccionar Plan mensual y registrar renovación autorizada');
  INSERT INTO public.suscripciones(id,kiosco_id,plan_id,fecha_inicio,fecha_vencimiento,estado)
    SELECT sid,id,paid,public.comercial_hoy(),coverage,
      CASE WHEN estado_suscripcion='SUSPENDIDO' THEN 'SUSPENDIDA' ELSE 'ACTIVA' END FROM public.kioscos WHERE id=kid;
  ack:=jsonb_build_object('success',true,'suscripcion_id',sid,'fecha_vencimiento',coverage,'precio_mensual',30000,'pago_acreditado',false);
  INSERT INTO public.operaciones_comerciales(id,actor_usuario_id,kiosco_id,tipo,solicitud,resultado)
    VALUES(op,actor,kid,'INICIALIZACION_COMERCIAL',jsonb_build_object('meses',1,'precio_mensual',30000,'trial_dias',30,'trial_precio',0),ack);
  INSERT INTO public.auditoria_comercial_admin(operacion_id,actor_usuario_id,kiosco_id,tipo,estado_nuevo)
    VALUES(op,actor,kid,'INICIALIZACION_COMERCIAL',ack);
END $coverage$;
NOTIFY pgrst,'reload schema';
COMMIT;
`
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [inputPath, outputPath] = process.argv.slice(2)
    if (!inputPath || !outputPath) throw new Error('Usage: node scripts/plan-commercial-production-install.mjs INPUT.json OUTPUT.sql (offline only)')
    const sql = planProductionInstall(JSON.parse(readFileSync(inputPath, 'utf8')))
    writeFileSync(outputPath, sql, { flag: 'wx' })
    process.stdout.write(`Offline Production plan generated; sha256=${digest(sql)}. No connection or SQL execution.\n`)
  } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : 'Plan generation failed'}\n`); process.exitCode = 1 }
}
