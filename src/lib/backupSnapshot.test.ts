// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const comercio = '10000000-0000-0000-0000-000000000001'
const otroComercio = '10000000-0000-0000-0000-000000000002'
const comercioVacio = '10000000-0000-0000-0000-000000000003'
const dueno = '00000000-0000-0000-0000-000000000001'
const cajero = '00000000-0000-0000-0000-000000000002'
const admin = '00000000-0000-0000-0000-000000000003'
const producto = '20000000-0000-0000-0000-000000000001'

interface SnapshotPrueba {
  productos: { id: string; kiosco_id: string; precio_costo: number; stock_actual: number }[]
  categorias: { kiosco_id: string }[]
  clientes: { kiosco_id: string }[]
  proveedores: { kiosco_id: string }[]
  promociones: { kiosco_id: string }[]
  lotes_producto: { kiosco_id: string }[]
  estadisticas: { totalProductos: number }
  contenido: { incluyeCredenciales: boolean; incluyeVentas: boolean; incluyeMovimientosCaja: boolean }
}

describe('snapshot integral de respaldo en PostgreSQL', () => {
  let db: PGlite
  const sesion = async (usuario: string) => {
    await db.exec(`RESET ROLE; SET request.jwt.claim.sub = '${usuario}'; SET request.jwt.claim.role = 'authenticated'; SET ROLE authenticated;`)
  }
  const snapshot = async (id = comercio) => (await db.query<{ snapshot: SnapshotPrueba }>(
    'SELECT public.generar_snapshot_backup($1::uuid) AS snapshot', [id]
  )).rows[0].snapshot

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT NULLIF(current_setting('request.jwt.claim.role', true), '') $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE TABLE public.kioscos (id uuid PRIMARY KEY, nombre text);
      CREATE TABLE public.usuarios (id uuid PRIMARY KEY, auth_user_id uuid, kiosco_id uuid, rol text, activo boolean DEFAULT true, es_superadmin boolean DEFAULT false);
      CREATE TABLE public.productos (id uuid PRIMARY KEY, kiosco_id uuid REFERENCES public.kioscos(id), descripcion text, precio_costo numeric(12,2) DEFAULT 0, stock_actual numeric DEFAULT 10);
      INSERT INTO public.kioscos VALUES ('${comercio}', 'Comercio principal'), ('${otroComercio}', 'Comercio ajeno'), ('${comercioVacio}', 'Comercio vacío');
      INSERT INTO public.usuarios (id, auth_user_id, kiosco_id, rol, es_superadmin) VALUES
        ('${dueno}', '${dueno}', '${comercio}', 'DUEÑO', false),
        ('${cajero}', '${cajero}', '${comercio}', 'CAJERO', false),
        ('${admin}', '${admin}', NULL, 'DUEÑO', true);
      INSERT INTO public.productos (id, kiosco_id, descripcion, precio_costo) VALUES
        ('${producto}', '${comercio}', 'Producto con costo privado', 123),
        ('90000000-0000-0000-0000-000000000001', '${otroComercio}', 'Producto ajeno', 999);
      INSERT INTO public.productos (id, kiosco_id, descripcion)
        SELECT ('20000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '${comercio}', 'Producto ' || n
        FROM generate_series(2, 1502) n;
    `)
    for (const tabla of ['categorias', 'clientes', 'proveedores', 'promociones', 'lotes_producto']) {
      await db.exec(`CREATE TABLE public.${tabla} (id uuid PRIMARY KEY, kiosco_id uuid); INSERT INTO public.${tabla} VALUES (gen_random_uuid(), '${comercio}'), (gen_random_uuid(), '${otroComercio}');`)
    }
    const roles = readFileSync('supabase_seguridad_roles_rls.sql', 'utf8')
    const inicio = roles.indexOf('CREATE OR REPLACE FUNCTION public.auth_user_kiosco_id()')
    const fin = roles.indexOf('-- 3. SOLUCIÓN ADVISOR:')
    expect(inicio).toBeGreaterThanOrEqual(0)
    expect(fin).toBeGreaterThan(inicio)
    await db.exec(roles.slice(inicio, fin))
    await db.exec(readFileSync('supabase_fase_seguridad_perfiles.sql', 'utf8'))
    await db.exec(readFileSync('supabase_fase_seguridad_costos_privados.sql', 'utf8'))
    await db.exec(readFileSync('supabase_fase_backup_integral.sql', 'utf8'))
    await db.exec(`GRANT SELECT, UPDATE ON public.productos TO authenticated; ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY; CREATE POLICY productos_propio_comercio ON public.productos TO authenticated USING (kiosco_id = public.auth_user_kiosco_id());`)
  }, 30_000)
  afterAll(async () => { await db?.close() })

  it('incluye más de 1000 productos, costos reales y las seis colecciones del comercio', async () => {
    await sesion(dueno)
    const datos = await snapshot()
    expect(datos.productos).toHaveLength(1502)
    expect(datos.estadisticas.totalProductos).toBe(1502)
    expect(datos.productos.find((fila) => fila.id === producto)?.precio_costo).toBe(123)
    for (const filas of [datos.productos, datos.categorias, datos.clientes, datos.proveedores, datos.promociones, datos.lotes_producto]) {
      expect(filas.length).toBeGreaterThan(0)
      expect(filas.every((fila) => fila.kiosco_id === comercio)).toBe(true)
    }
    expect(datos.contenido).toMatchObject({ incluyeCredenciales: false, incluyeVentas: false, incluyeMovimientosCaja: false })
    expect(datos).not.toHaveProperty('usuarios')
  })

  it('rechaza al cajero incluso invocando la función directamente', async () => {
    await sesion(cajero)
    await expect(snapshot()).rejects.toMatchObject({ code: '42501' })
  })

  it('rechaza al dueño que solicita respaldo de otro comercio', async () => {
    await sesion(dueno)
    await expect(snapshot(otroComercio)).rejects.toMatchObject({ code: '42501' })
  })

  it('permite al superadmin seleccionar un comercio y no mezcla inventarios', async () => {
    await sesion(admin)
    const datos = await snapshot(otroComercio)
    expect(datos.productos).toHaveLength(1)
    expect(datos.productos[0]).toMatchObject({ kiosco_id: otroComercio, precio_costo: 999 })
  })

  it('representa un comercio vacío con arrays vacíos y conteos cero', async () => {
    await sesion(admin)
    const datos = await snapshot(comercioVacio)
    expect(datos.productos).toEqual([])
    expect(datos.categorias).toEqual([])
    expect(datos.estadisticas.totalProductos).toBe(0)
  })

  it('rechaza al dueño cuyo perfil ya fue desactivado', async () => {
    await sesion(dueno)
    await db.exec(`BEGIN; RESET ROLE; UPDATE public.usuarios SET activo = false WHERE id = '${dueno}';`)
    try {
      await sesion(dueno)
      await expect(snapshot()).rejects.toMatchObject({ code: '42501' })
    } finally { await db.exec('ROLLBACK; RESET ROLE;') }
  })

  it('no admite ejecución anónima de la función', async () => {
    await db.exec("RESET ROLE; SET request.jwt.claim.sub = ''; SET request.jwt.claim.role = 'anon'; SET ROLE anon;")
    await expect(snapshot()).rejects.toMatchObject({ code: '42501' })
  })

  it('permite al backend service_role obtener el respaldo del comercio solicitado', async () => {
    await db.exec("RESET ROLE; SET request.jwt.claim.sub = ''; SET request.jwt.claim.role = 'service_role'; SET ROLE service_role;")
    expect((await snapshot(otroComercio)).productos[0].precio_costo).toBe(999)
  })

  it('ve un snapshot único ante una escritura dentro de la misma sentencia SQL', async () => {
    await sesion(dueno)
    await db.exec('BEGIN;')
    try {
      const resultado = await db.query<{ snapshot: SnapshotPrueba }>(`
        WITH cambio AS (UPDATE public.productos SET stock_actual = 20 WHERE id = '${producto}' RETURNING id)
        SELECT public.generar_snapshot_backup('${comercio}') AS snapshot, (SELECT count(*) FROM cambio) AS cambios;
      `)
      expect(resultado.rows[0].snapshot.productos.find((fila) => fila.id === producto)?.stock_actual).toBe(10)
      expect((await db.query(`SELECT stock_actual FROM public.productos WHERE id = '${producto}'`)).rows).toEqual([{ stock_actual: '20' }])
    } finally { await db.exec('ROLLBACK;') }
  })
})
