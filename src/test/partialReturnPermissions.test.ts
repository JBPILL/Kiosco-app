// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'

interface Diagnostico {
  tabla: string
  presente: boolean
  rls_habilitado: boolean
  permisos: { rol: string; escritura_tabla: boolean; escritura_columnas: boolean }[]
  politicas: { nombre: string; comando: string; usando: string | null; comprobacion: string | null }[]
}

it('informa ausencia, RLS, políticas abiertas y permisos heredados por columna', async () => {
  const db = new PGlite()
  try {
    const consulta = readFileSync('sql_auditar_devoluciones_parciales.sql', 'utf8')
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;')
    const leer = async () => (await db.query<{ diagnostico_devoluciones: Diagnostico[] }>(consulta)).rows[0].diagnostico_devoluciones
    const ausentes = await leer()
    expect(ausentes).toHaveLength(2)
    expect(ausentes.every(t => !t.presente && !t.rls_habilitado)).toBe(true)
    await db.exec(`CREATE TABLE devoluciones_venta(id uuid, kiosco_id uuid);
      CREATE TABLE detalles_devolucion(id uuid, cantidad numeric);
      ALTER TABLE devoluciones_venta ENABLE ROW LEVEL SECURITY;
      CREATE POLICY abierta ON devoluciones_venta FOR ALL USING(true) WITH CHECK(true);
      GRANT UPDATE(cantidad) ON detalles_devolucion TO PUBLIC;
      GRANT INSERT ON devoluciones_venta TO authenticated;`)
    const tablas = await leer()
    const cabecera = tablas.find(t => t.tabla === 'devoluciones_venta')!
    const detalles = tablas.find(t => t.tabla === 'detalles_devolucion')!
    expect(cabecera.presente).toBe(true)
    expect(cabecera.rls_habilitado).toBe(true)
    expect(cabecera.politicas).toEqual([expect.objectContaining({ nombre: 'abierta', comando: '*', usando: 'true', comprobacion: 'true' })])
    expect(cabecera.permisos.find(r => r.rol === 'authenticated')?.escritura_tabla).toBe(true)
    expect(detalles.rls_habilitado).toBe(false)
    expect(detalles.permisos).toHaveLength(3)
    expect(detalles.permisos.every(r => r.escritura_columnas && !r.escritura_tabla)).toBe(true)
    await db.exec('REVOKE UPDATE(cantidad) ON detalles_devolucion FROM PUBLIC; REVOKE INSERT ON devoluciones_venta FROM authenticated;')
    expect((await leer()).every(t => t.permisos.every(r => !r.escritura_tabla && !r.escritura_columnas))).toBe(true)
  } finally { await db.close() }
}, 30_000)
