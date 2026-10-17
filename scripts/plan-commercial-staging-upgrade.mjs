#!/usr/bin/env node
/** Offline only. Builds an atomic upgrade for the observed pre-030 Staging schema. */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const stagingRef = 'acoyfwwmhaeruciyedri'
const literal = value => `'${value.replaceAll("'", "''")}'`
const sha256 = value => createHash('sha256').update(value).digest('hex')

export function planStagingUpgrade(input) {
  if (!input || input.projectRef !== stagingRef) throw new Error('Only the reviewed Staging ref is supported.')
  if (typeof input.adminEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.adminEmail)
    || input.adminEmail.length > 254) throw new Error('A separate confirmed Auth identity is required.')
  if (input.planName !== 'Plan de prueba' || input.price !== 0 || input.days !== 365)
    throw new Error('Only the explicitly authorized Staging trial coverage is supported.')
  const bootstrap = path.join(root, 'supabase/bootstrap')
  const domain = readFileSync(path.join(bootstrap, '001_domain.sql'), 'utf8')
  const platform = domain.match(/CREATE TABLE public\.platform_initial_admin_bootstrap_state \([\s\S]*?\r?\n\);/)?.[0]
  if (!platform) throw new Error('Canonical platform definition is missing.')
  const sources = readdirSync(path.join(bootstrap, 'steps')).filter(name => /^(03[0-9]|04[01])_/.test(name))
    .sort().map(name => `steps/${name}`)
  sources.push('900_final_security.sql', ...readdirSync(path.join(bootstrap, 'commercial')).filter(name => name.endsWith('.sql'))
    .sort().map(name => `commercial/${name}`))
  const manifest = JSON.parse(readFileSync(path.join(bootstrap, 'manifest.json'), 'utf8'))
  const approved = [...manifest.files, ...manifest.optionalModules.commercial.files]
  const bodies = sources.map(source => {
    const bytes = readFileSync(path.join(bootstrap, source))
    if (approved.find(entry => entry.path === source)?.sha256 !== sha256(bytes)) throw new Error(`Checksum mismatch: ${source}`)
    return `-- Canonical source: ${source}\n${bytes.toString('utf8').replace(/^\s*(BEGIN|COMMIT);\s*$/gmi, '')}`
  })
  const email = literal(input.adminEmail.trim().toLowerCase())
  return `-- OFFLINE PLAN. Target ref must be supplied explicitly to the authenticated CLI: ${stagingRef}
-- One transaction; existing tables/data and the 15 installed operational triggers are preserved.
BEGIN;
SET LOCAL lock_timeout='10s';
LOCK TABLE public.kioscos,public.usuarios IN ACCESS EXCLUSIVE MODE;
DO $preflight$
BEGIN
  IF current_user<>'postgres' THEN RAISE EXCEPTION 'postgres operator required'; END IF;
  IF (SELECT count(*) FROM pg_tables WHERE schemaname='public')<>30
    OR to_regclass('public.proveedores') IS NOT NULL
    OR to_regclass('public.suscripciones') IS NOT NULL
    OR to_regclass('public.platform_initial_admin_bootstrap_state') IS NOT NULL
    OR to_regprocedure('public.confirmar_venta_manual(uuid,jsonb)') IS NULL
    OR (SELECT count(*) FROM public.kioscos)<>1
    OR EXISTS(SELECT 1 FROM public.usuarios WHERE es_superadmin)
    OR (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal)<>15
  THEN RAISE EXCEPTION 'Observed pre-030 Staging prerequisites differ; no upgrade applied'; END IF;
  IF (SELECT count(*) FROM auth.users WHERE lower(email)=${email} AND email_confirmed_at IS NOT NULL)<>1
    OR EXISTS(SELECT 1 FROM public.usuarios p JOIN auth.users a ON a.id=p.auth_user_id WHERE lower(a.email)=${email})
  THEN RAISE EXCEPTION 'Confirmed separate Auth account required'; END IF;
END $preflight$;
ALTER TABLE public.usuarios ALTER COLUMN kiosco_id DROP NOT NULL;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_superadmin_kiosco_scope_check
  CHECK ((es_superadmin AND kiosco_id IS NULL) OR (NOT es_superadmin AND kiosco_id IS NOT NULL));
${platform}
${bodies.join('\n')}
DO $coverage$
DECLARE aid uuid; actor uuid:=gen_random_uuid(); kid uuid; pid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid();
  op uuid:=gen_random_uuid(); ack jsonb; coverage date:=public.comercial_hoy()+365;
BEGIN
  SELECT id INTO STRICT aid FROM auth.users WHERE lower(email)=${email};
  SELECT id INTO STRICT kid FROM public.kioscos;
  INSERT INTO public.usuarios(id,auth_user_id,kiosco_id,nombre,email,rol,activo,es_superadmin)
    VALUES(actor,aid,NULL,'Administrador comercial',${email},'VISOR',true,true);
  PERFORM set_config('request.jwt.claim.sub',aid::text,true);
  ack:=public.actualizar_plan(gen_random_uuid(),pid,'Plan de prueba',0,3,true,'Ensayo autorizado en Staging');
  INSERT INTO public.suscripciones(id,kiosco_id,plan_id,fecha_inicio,fecha_vencimiento,estado)
    SELECT sid,id,pid,public.comercial_hoy(),coverage,
      CASE WHEN estado_suscripcion='SUSPENDIDO' THEN 'SUSPENDIDA' ELSE 'ACTIVA' END FROM public.kioscos WHERE id=kid;
  ack:=jsonb_build_object('success',true,'suscripcion_id',sid,'fecha_vencimiento',coverage,'precio',0);
  INSERT INTO public.operaciones_comerciales(id,actor_usuario_id,kiosco_id,tipo,solicitud,resultado)
    VALUES(op,actor,kid,'INICIALIZACION_COMERCIAL',jsonb_build_object('plan','Plan de prueba','precio',0,'dias',365),ack);
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
    if (!inputPath || !outputPath) throw new Error('Usage: node scripts/plan-commercial-staging-upgrade.mjs INPUT.json OUTPUT.sql (offline only)')
    const sql = planStagingUpgrade(JSON.parse(readFileSync(inputPath, 'utf8')))
    writeFileSync(outputPath, sql, { flag: 'wx' })
    process.stdout.write(`Offline Staging plan generated; sha256=${sha256(sql)}. No connection or SQL execution.\n`)
  } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : 'Plan generation failed'}\n`); process.exitCode = 1 }
}
