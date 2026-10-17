// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'

const { planStagingUpgrade } = await import(pathToFileURL(path.resolve('scripts/plan-commercial-staging-upgrade.mjs')).href) as {
  planStagingUpgrade: (input: Record<string, unknown>) => string
}
const input = { projectRef: 'acoyfwwmhaeruciyedri', adminEmail: 'admin@example.test', planName: 'Plan de prueba', price: 0, days: 365 }
it('rejects Production and unauthorized trial coverage before generating SQL', () => {
  expect(() => planStagingUpgrade({ ...input, projectRef: 'lllkjnqpltnwvxzphncr' })).toThrow(/Staging/)
  expect(() => planStagingUpgrade({ ...input, price: 100 })).toThrow(/coverage/)
  expect(() => planStagingUpgrade({ ...input, days: 366 })).toThrow(/coverage/)
  expect(() => planStagingUpgrade({ ...input, adminEmail: '' })).toThrow(/identity/)
})
it('upgrades the pre-030 schema atomically, preserves its tenant, audits trial coverage and refuses replay', async () => {
  const db = new PGlite()
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;`)
    const read = (name: string) => readFileSync(`supabase/bootstrap/${name}`, 'utf8')
    await db.exec(read('001_domain.sql').replace(/CREATE TABLE public\.platform_initial_admin_bootstrap_state \([\s\S]*?\r?\n\);/, ''))
    await db.exec(read('002_identity_helpers.sql'))
    // The hosted pre-030 schema requires tenant membership even for admins.
    await db.exec('ALTER TABLE public.usuarios DROP CONSTRAINT usuarios_superadmin_kiosco_scope_check; ALTER TABLE public.usuarios ALTER COLUMN kiosco_id SET NOT NULL')
    for (const name of readdirSync('supabase/bootstrap/steps').filter(name => /^(00[3-9]|01[0-9]|02[0-9])_/.test(name)).sort())
      await db.exec(read(`steps/${name}`))
    await db.exec(read('steps/042_post_import_triggers.sql'))
    await db.exec(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
      ('dd000000-0000-4000-8000-000000000001','owner@example.test',now());
      INSERT INTO public.kioscos(id,nombre) VALUES('dd000000-0000-4000-8000-000000000010','Existing');
      INSERT INTO public.usuarios(id,auth_user_id,kiosco_id,nombre,email,rol) VALUES
      ('dd000000-0000-4000-8000-000000000020','dd000000-0000-4000-8000-000000000001',
      'dd000000-0000-4000-8000-000000000010','Owner','owner@example.test','DUEÑO');`)
    const sql = planStagingUpgrade(input)
    await expect(db.exec(sql)).rejects.toThrow(/Confirmed separate Auth account/)
    await db.exec('ROLLBACK')
    expect((await db.query("SELECT to_regclass('public.planes') r")).rows).toEqual([{ r: null }])
    await db.exec(`INSERT INTO auth.users(id,email,email_confirmed_at)
      VALUES('dd000000-0000-4000-8000-000000000002','admin@example.test',now())`)
    await db.exec(sql)
    expect((await db.query('SELECT nombre FROM public.kioscos')).rows).toEqual([{ nombre: 'Existing' }])
    expect((await db.query('SELECT rol,es_superadmin FROM public.usuarios WHERE kiosco_id IS NOT NULL')).rows)
      .toEqual([{ rol: 'DUEÑO', es_superadmin: false }])
    expect((await db.query('SELECT rol,kiosco_id FROM public.usuarios WHERE es_superadmin')).rows)
      .toEqual([{ rol: 'VISOR', kiosco_id: null }])
    expect((await db.query('SELECT precio_mensual::text precio FROM public.planes')).rows).toEqual([{ precio: '0.00' }])
    expect((await db.query('SELECT fecha_vencimiento-public.comercial_hoy() dias FROM public.suscripciones')).rows).toEqual([{ dias: 365 }])
    expect((await db.query("SELECT count(*)::int n FROM public.auditoria_comercial_admin WHERE tipo='INICIALIZACION_COMERCIAL'")).rows).toEqual([{ n: 1 }])
    await expect(db.exec(sql)).rejects.toThrow(/prerequisites differ/)
    await db.exec('ROLLBACK')
    expect((await db.query('SELECT count(*)::int n FROM public.suscripciones')).rows).toEqual([{ n: 1 }])
  } finally { await db.close() }
}, 30000)
