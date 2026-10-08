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
}, 30000)

it('concede columnas comerciales sin acceso a datos adicionales ni escrituras', async () => {
  const db = new PGlite()
  try {
    await db.exec('CREATE ROLE service_role; CREATE ROLE authenticated;')
    const sql = readFileSync('supabase_fase_lectura_catalogo_checkout.sql','utf8')
    const grants = [...sql.matchAll(/GRANT SELECT \(([^)]+)\)\s+ON public\.(\w+) TO service_role;/g)]
    expect(grants).toHaveLength(5)
    for (const grant of grants) await db.exec(`CREATE TABLE ${grant[2]} (${grant[1].split(',').map(c => `${c.trim()} text`).join(',')}, dato_privado text);`)
    await db.exec(sql); await db.exec(sql)
    for (const grant of grants) {
      const permiso = await db.query(`SELECT has_column_privilege('service_role',$1,'id','SELECT') AS lectura, has_column_privilege('service_role',$1,'dato_privado','SELECT') AS privado, has_table_privilege('service_role',$1,'UPDATE') AS escritura, has_column_privilege('authenticated',$1,'id','SELECT') AS navegador`, [grant[2]])
      expect(permiso.rows).toEqual([{ lectura: true, privado: false, escritura: false, navegador: false }])
    }
  } finally { await db.close() }
}, 30000)
