// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'
it('otorga sólo las columnas de identidad requeridas al servidor', async () => {
  const db = new PGlite()
  try {
    await db.exec(`CREATE ROLE service_role; CREATE ROLE authenticated;
      CREATE TABLE usuarios(id uuid,auth_user_id uuid,kiosco_id uuid,activo boolean,rol text, dato_privado text);
      CREATE TABLE kioscos(id uuid,estado_suscripcion text,capacidades_operativas jsonb, dato_privado text);`)
    const sql = readFileSync('supabase_fase_lectura_identidad_edge.sql','utf8')
    await db.exec(sql); await db.exec(sql)
    const permisos = await db.query(`SELECT
      has_column_privilege('service_role','usuarios','auth_user_id','SELECT') AS identidad,
      has_column_privilege('service_role','kioscos','capacidades_operativas','SELECT') AS capacidades,
      has_column_privilege('service_role','usuarios','dato_privado','SELECT') AS privado,
      has_column_privilege('authenticated','usuarios','auth_user_id','SELECT') AS navegador`)
    expect(permisos.rows).toEqual([{ identidad: true, capacidades: true, privado: false, navegador: false }])
    await db.exec('SET ROLE service_role; SELECT id,auth_user_id,kiosco_id,activo,rol FROM usuarios; SELECT id,estado_suscripcion,capacidades_operativas FROM kioscos;')
    await expect(db.query('SELECT * FROM usuarios')).rejects.toMatchObject({ code: '42501' })
  } finally { await db.close() }
})
