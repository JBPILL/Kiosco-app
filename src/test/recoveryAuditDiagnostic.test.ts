import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'

const consulta = readFileSync('sql_verificar_recuperacion_auditada.sql', 'utf8')

it('informa objetos ausentes sin fallar', async () => {
  const db = new PGlite()
  try {
    const { rows } = await db.query<{ diagnostico_recuperacion_auditada: Record<string, boolean> }>(consulta)
    expect(rows[0].diagnostico_recuperacion_auditada.tabla_presente).toBe(false)
    expect(rows[0].diagnostico_recuperacion_auditada.funcion_presente).toBe(false)
  } finally { await db.close() }
})

it.each([
  ['', ''],
  ['GRANT UPDATE(venta_id) ON checkout_recuperaciones TO authenticated', 'sin_escritura_directa'],
  ['GRANT SELECT(venta_id) ON checkout_recuperaciones TO anon', 'sin_lectura_roles_no_previstos'],
  ['GRANT SELECT ON checkout_recuperaciones TO service_role', 'sin_lectura_roles_no_previstos'],
  ['CREATE POLICY abierta ON checkout_recuperaciones FOR SELECT TO authenticated USING(true)', 'sin_politicas_lectura_adicionales'],
  ['GRANT EXECUTE ON FUNCTION confirmar_checkout_recuperado(uuid,jsonb) TO PUBLIC', 'navegador_no_ejecuta'],
  ['ALTER TABLE checkout_recuperaciones DISABLE ROW LEVEL SECURITY', 'rls_habilitado'],
])('detecta alteración del catálogo: %s', async (alteracion, control) => {
  const db = new PGlite()
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE FUNCTION auth_user_kiosco_id() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
      CREATE FUNCTION auth_es_dueno_o_superadmin() RETURNS boolean LANGUAGE sql AS 'SELECT false';
      CREATE TABLE checkout_recuperaciones(venta_id uuid,kiosco_id uuid);
      GRANT SELECT ON checkout_recuperaciones TO authenticated;
      ALTER TABLE checkout_recuperaciones ENABLE ROW LEVEL SECURITY;
      CREATE POLICY checkout_recuperacion_dueno ON checkout_recuperaciones FOR SELECT TO authenticated
        USING(kiosco_id=auth_user_kiosco_id() AND auth_es_dueno_o_superadmin());
      CREATE FUNCTION confirmar_checkout_recuperado(uuid,jsonb) RETURNS jsonb LANGUAGE sql
        SECURITY DEFINER SET search_path=pg_catalog,public AS 'SELECT $2';
      REVOKE ALL ON FUNCTION confirmar_checkout_recuperado(uuid,jsonb) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION confirmar_checkout_recuperado(uuid,jsonb) TO service_role;`)
    if (alteracion) await db.exec(alteracion)
    const { rows } = await db.query<{ diagnostico_recuperacion_auditada: Record<string, boolean> }>(consulta)
    const valores = rows[0].diagnostico_recuperacion_auditada
    for (const [nombre, valor] of Object.entries(valores)) expect(valor, nombre).toBe(nombre !== control)
  } finally { await db.close() }
})
