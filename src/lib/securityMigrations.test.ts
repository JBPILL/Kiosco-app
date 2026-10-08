// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const propietario = '00000000-0000-0000-0000-000000000001'
const cajero = '00000000-0000-0000-0000-000000000002'
const otroPropietario = '00000000-0000-0000-0000-000000000003'
const superadmin = '00000000-0000-0000-0000-000000000004'
const kiosco = '10000000-0000-0000-0000-000000000001'
const otroKiosco = '10000000-0000-0000-0000-000000000002'
const productoInicial = '20000000-0000-0000-0000-000000000001'
const productoNuevo = '20000000-0000-0000-0000-000000000002'
const venta = '30000000-0000-0000-0000-000000000001'
const migracionCostos = readFileSync('supabase_fase_seguridad_costos_privados.sql', 'utf8')
const reglasRoles = readFileSync('supabase_seguridad_roles_rls.sql', 'utf8')

describe('migraciones de seguridad en PostgreSQL', () => {
  let db: PGlite

  const sesion = async (usuario: string) => {
    await db.exec(`RESET ROLE; SET request.jwt.claim.sub = '${usuario}'; SET request.jwt.claim.role = 'authenticated'; SET ROLE authenticated;`)
  }

  const conVenta = async (verificar: () => Promise<void>) => {
    await sesion(propietario)
    await db.exec(`BEGIN; INSERT INTO public.ventas (id, kiosco_id, estado) VALUES ('${venta}', '${kiosco}', 'COMPLETADA');`)
    try { await verificar() } finally { await db.exec('ROLLBACK; RESET ROLE;') }
  }

  const instalarConsultaComercial = async () => {
    await db.exec('RESET ROLE;')
    const sql = readFileSync('supabase_fase_auditoria_comercial_consulta.sql', 'utf8')
    await db.exec(sql.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, ''))
    await sesion(propietario)
  }

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.role', true), '');
      $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE TABLE public.kioscos (id uuid PRIMARY KEY);
      CREATE TABLE public.usuarios (
        id uuid PRIMARY KEY, auth_user_id uuid, kiosco_id uuid REFERENCES public.kioscos(id),
        activo boolean DEFAULT true, rol text, es_superadmin boolean DEFAULT false, nombre text DEFAULT 'Usuario de prueba'
      );
      CREATE TABLE public.productos (
        id uuid PRIMARY KEY, kiosco_id uuid REFERENCES public.kioscos(id),
        precio_costo numeric(12,2) NOT NULL DEFAULT 0, precio_venta numeric(12,2) NOT NULL DEFAULT 0
      );
      INSERT INTO public.kioscos VALUES ('${kiosco}'), ('${otroKiosco}');
      INSERT INTO public.usuarios (id, auth_user_id, kiosco_id, rol) VALUES
        ('${propietario}', '${propietario}', '${kiosco}', 'DUEÑO'),
        ('${cajero}', '${cajero}', '${kiosco}', 'CAJERO'),
        ('${otroPropietario}', '${otroPropietario}', '${otroKiosco}', 'DUEÑO');
      INSERT INTO public.usuarios (id, auth_user_id, rol, es_superadmin) VALUES ('${superadmin}', '${superadmin}', 'DUEÑO', true);
      INSERT INTO public.productos (id, kiosco_id, precio_costo) VALUES ('${productoInicial}', '${kiosco}', 123);
      GRANT SELECT, INSERT, UPDATE ON public.productos TO authenticated;
    `)
    // Ejecutar las funciones reales de autorización y las políticas reales de productos.
    const inicioHelpers = reglasRoles.indexOf('CREATE OR REPLACE FUNCTION public.auth_user_kiosco_id()')
    const finHelpers = reglasRoles.indexOf('-- 3. SOLUCIÓN ADVISOR:')
    const inicioPoliticas = reglasRoles.indexOf('ALTER TABLE IF EXISTS public.productos ENABLE ROW LEVEL SECURITY;')
    const finPoliticas = reglasRoles.indexOf('DROP POLICY IF EXISTS "categorias_all_policy"')
    expect(inicioHelpers).toBeGreaterThanOrEqual(0)
    expect(finHelpers).toBeGreaterThan(inicioHelpers)
    expect(inicioPoliticas).toBeGreaterThanOrEqual(0)
    expect(finPoliticas).toBeGreaterThan(inicioPoliticas)
    await db.exec(reglasRoles.slice(inicioHelpers, finHelpers))
    const inicioPerfiles = reglasRoles.indexOf('ALTER TABLE IF EXISTS public.usuarios ENABLE ROW LEVEL SECURITY;')
    const finPerfiles = reglasRoles.indexOf('-- 6. SOLUCIÓN ADVISOR:')
    expect(inicioPerfiles).toBeGreaterThanOrEqual(0)
    expect(finPerfiles).toBeGreaterThan(inicioPerfiles)
    await db.exec(reglasRoles.slice(inicioPerfiles, finPerfiles))
    await db.exec('GRANT SELECT, INSERT, UPDATE ON public.usuarios TO authenticated;')
    await db.exec(readFileSync('supabase_fase_seguridad_perfiles.sql', 'utf8'))
    await db.exec('CREATE TABLE public.categorias (id uuid PRIMARY KEY, kiosco_id uuid);')
    await db.exec(reglasRoles.slice(inicioPoliticas, finPoliticas))
    await db.exec(migracionCostos)
    expect((await db.query('SELECT precio_costo FROM public.producto_costos')).rows).toEqual([{ precio_costo: '123.00' }])
    await db.exec(`
      CREATE TABLE public.ventas (id uuid PRIMARY KEY, kiosco_id uuid REFERENCES public.kioscos(id), estado text NOT NULL);
      CREATE TABLE public.detalles_venta (id uuid PRIMARY KEY, venta_id uuid);
      GRANT SELECT, INSERT, UPDATE ON public.ventas TO authenticated;
    `)
    const inicioVentas = reglasRoles.indexOf('ALTER TABLE IF EXISTS public.ventas ENABLE ROW LEVEL SECURITY;')
    const finVentas = reglasRoles.indexOf('DROP POLICY IF EXISTS "detalles_venta_policy"')
    expect(inicioVentas).toBeGreaterThanOrEqual(0)
    expect(finVentas).toBeGreaterThan(inicioVentas)
    await db.exec(reglasRoles.slice(inicioVentas, finVentas))
    await db.exec(readFileSync('supabase_fase_auditoria_anulaciones.sql', 'utf8'))
    await db.exec(readFileSync('supabase_fase_auditoria_precios.sql', 'utf8'))
  }, 30_000)

  beforeEach(async () => {
    await db.exec(`RESET ROLE; DELETE FROM public.productos WHERE id = '${productoNuevo}';`)
    await sesion(propietario)
    await db.exec(`UPDATE public.productos SET precio_costo = 123 WHERE id = '${productoInicial}';`)
  })

  afterAll(async () => { await db?.close() })

  it('migra el costo existente y no lo entrega al cajero ni a otro comercio', async () => {
    await sesion(propietario)
    expect((await db.query('SELECT precio_costo FROM public.producto_costos')).rows).toEqual([{ precio_costo: '123.00' }])
    await sesion(cajero)
    expect((await db.query('SELECT precio_costo FROM public.productos')).rows).toEqual([{ precio_costo: '0.00' }])
    expect((await db.query('SELECT * FROM public.producto_costos')).rows).toEqual([])
    await sesion(otroPropietario)
    expect((await db.query('SELECT * FROM public.producto_costos')).rows).toEqual([])
  })

  it('permite dar de alta un producto con costo, sin exponerlo en productos', async () => {
    await sesion(propietario)
    await db.exec(`INSERT INTO public.productos (id, kiosco_id, precio_costo) VALUES ('${productoNuevo}', '${kiosco}', 456);`)
    expect((await db.query(`SELECT precio_costo FROM public.productos WHERE id = '${productoNuevo}'`)).rows).toEqual([{ precio_costo: '0.00' }])
    expect((await db.query(`SELECT precio_costo FROM public.producto_costos WHERE producto_id = '${productoNuevo}'`)).rows).toEqual([{ precio_costo: '456.00' }])
  })

  it('permite al dueño cambiar un costo privado existente a cero', async () => {
    await sesion(propietario)
    await db.exec(`UPDATE public.productos SET precio_costo = 0 WHERE id = '${productoInicial}';`)
    expect((await db.query(`SELECT precio_costo FROM public.producto_costos WHERE producto_id = '${productoInicial}'`)).rows).toEqual([{ precio_costo: '0.00' }])
  })

  it('rechaza costo no cero de cajero y no borra el costo privado con un cero público', async () => {
    await sesion(propietario)
    await db.exec(`UPDATE public.productos SET precio_costo = 789 WHERE id = '${productoInicial}';`)
    await sesion(cajero)
    await expect(db.exec(`UPDATE public.productos SET precio_costo = 999 WHERE id = '${productoInicial}';`)).rejects.toMatchObject({ code: '42501' })
    await db.exec(`UPDATE public.productos SET precio_costo = 0 WHERE id = '${productoInicial}';`)
    await sesion(propietario)
    expect((await db.query(`SELECT precio_costo FROM public.producto_costos WHERE producto_id = '${productoInicial}'`)).rows).toEqual([{ precio_costo: '789.00' }])
  })

  it('reaplicar la migración preserva el costo privado', async () => {
    await sesion(propietario)
    await db.exec(`UPDATE public.productos SET precio_costo = 789 WHERE id = '${productoInicial}';`)
    await db.exec('RESET ROLE;')
    await db.exec(migracionCostos)
    await sesion(propietario)
    expect((await db.query(`SELECT precio_costo FROM public.producto_costos WHERE producto_id = '${productoInicial}'`)).rows).toEqual([{ precio_costo: '789.00' }])
  })

  it('cajero no anula la venta aun con acceso directo a PostgreSQL', async () => {
    await conVenta(async () => {
      await sesion(cajero)
      expect((await db.query(`UPDATE public.ventas SET estado = 'ANULADA', motivo_anulacion = 'Error de carga' WHERE id = '${venta}' RETURNING id`)).rows).toEqual([])
      expect((await db.query(`SELECT estado FROM public.ventas WHERE id = '${venta}'`)).rows).toEqual([{ estado: 'COMPLETADA' }])
    })
  })

  it('anular guarda el actor de la sesión y una auditoría, ignorando actor/fecha falsificados', async () => {
    await conVenta(async () => {
      await db.exec(`UPDATE public.ventas SET estado = 'ANULADA', motivo_anulacion = 'Error de carga', anulada_por = '${cajero}', anulada_en = '2000-01-01' WHERE id = '${venta}';`)
      const auditoria = await db.query<{ usuario_id: string; accion: string; motivo: string }>('SELECT usuario_id, accion, motivo FROM public.auditoria_operaciones')
      expect(auditoria.rows).toEqual([{ usuario_id: propietario, accion: 'VENTA_ANULADA', motivo: 'Error de carga' }])
      expect((await db.query(`SELECT anulada_por, anulada_en > '2000-01-02' AS fecha_verificada FROM public.ventas WHERE id = '${venta}'`)).rows).toEqual([{ anulada_por: propietario, fecha_verificada: true }])
    })
  })

  it('impide alterar fecha y autor luego de anular la venta', async () => {
    await conVenta(async () => {
      await db.exec(`UPDATE public.ventas SET estado = 'ANULADA', motivo_anulacion = 'Error de carga' WHERE id = '${venta}'; SAVEPOINT antes_intento;`)
      await expect(db.exec(`UPDATE public.ventas SET anulada_por = '${cajero}', anulada_en = '2000-01-01' WHERE id = '${venta}';`)).rejects.toMatchObject({ code: '42501' })
      await db.exec('ROLLBACK TO SAVEPOINT antes_intento;')
      expect((await db.query(`SELECT anulada_por FROM public.ventas WHERE id = '${venta}'`)).rows).toEqual([{ anulada_por: propietario }])
    })
  })

  it('no permite escribir directamente en la tabla de auditoría', async () => {
    await conVenta(async () => {
      await expect(db.exec(`INSERT INTO public.auditoria_operaciones (kiosco_id, accion, entidad, entidad_id, motivo) VALUES ('${kiosco}', 'FALSA', 'ventas', '${venta}', 'Registro falso');`)).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('impide cambiar la identidad de la venta referenciada por auditoría', async () => {
    await conVenta(async () => {
      await expect(db.exec(`UPDATE public.ventas SET id = '30000000-0000-0000-0000-000000000099' WHERE id = '${venta}';`)).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('no admite una venta insertada directamente como anulada sin auditoría', async () => {
    await conVenta(async () => {
      await expect(db.exec(`INSERT INTO public.ventas (id, kiosco_id, estado, motivo_anulacion) VALUES ('30000000-0000-0000-0000-000000000002', '${kiosco}', 'ANULADA', 'Eludir auditoría');`)).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('impide falsificar datos de anulación en una venta vigente', async () => {
    await conVenta(async () => {
      await expect(db.exec(`UPDATE public.ventas SET anulada_por = '${cajero}', anulada_en = now() WHERE id = '${venta}';`)).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('conserva identidad de sesión en auditoría al eliminar el perfil referenciado', async () => {
    await conVenta(async () => {
      await db.exec(`UPDATE public.ventas SET estado = 'ANULADA', motivo_anulacion = 'Error de carga' WHERE id = '${venta}';`)
      await db.exec(`RESET ROLE; DELETE FROM public.usuarios WHERE id = '${propietario}';`)
      expect((await db.query('SELECT usuario_id, actor_auth_id, actor_rol FROM public.auditoria_operaciones')).rows).toEqual([{ usuario_id: null, actor_auth_id: propietario, actor_rol: 'DUEÑO' }])
      expect((await db.query(`SELECT anulada_por FROM public.ventas WHERE id = '${venta}'`)).rows).toEqual([{ anulada_por: null }])
    })
  })

  it('una clave foránea diferida sigue rechazando costos huérfanos al finalizar la transacción', async () => {
    await db.exec('RESET ROLE;')
    await expect(db.exec(`INSERT INTO public.producto_costos (producto_id, kiosco_id, precio_costo) VALUES ('20000000-0000-0000-0000-000000000099', '${kiosco}', 10);`)).rejects.toMatchObject({ code: '23503' })
    expect((await db.query(`SELECT producto_id FROM public.producto_costos WHERE producto_id = '20000000-0000-0000-0000-000000000099'`)).rows).toEqual([])
  })

  it('cajero no puede elevar su propio rol mediante UPDATE directo', async () => {
    await conVenta(async () => {
      await sesion(cajero)
      await expect(db.exec(`UPDATE public.usuarios SET rol = 'DUEÑO' WHERE id = '${cajero}';`)).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('dueño no puede concederse privilegios de superadmin', async () => {
    await conVenta(async () => {
      await expect(db.exec(`UPDATE public.usuarios SET es_superadmin = true WHERE id = '${propietario}';`)).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('dueño no puede crear un perfil superadmin en su comercio', async () => {
    await conVenta(async () => {
      await expect(db.exec(`INSERT INTO public.usuarios (id, kiosco_id, rol, es_superadmin) VALUES ('00000000-0000-0000-0000-000000000099', '${kiosco}', 'CAJERO', true);`)).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('dueño puede administrar el rol y acceso de un empleado de su comercio', async () => {
    await conVenta(async () => {
      await db.exec(`UPDATE public.usuarios SET rol = 'VISOR', activo = false, auth_user_id = NULL WHERE id = '${cajero}';`)
      expect((await db.query(`SELECT rol, activo, auth_user_id FROM public.usuarios WHERE id = '${cajero}'`)).rows).toEqual([{ rol: 'VISOR', activo: false, auth_user_id: null }])
    })
  })

  it('cajero conserva la edición de su nombre sin cambiar privilegios', async () => {
    await conVenta(async () => {
      await sesion(cajero)
      await db.exec(`UPDATE public.usuarios SET nombre = 'Nombre corregido' WHERE id = '${cajero}';`)
      expect((await db.query(`SELECT nombre, rol FROM public.usuarios WHERE id = '${cajero}'`)).rows).toEqual([{ nombre: 'Nombre corregido', rol: 'CAJERO' }])
    })
  })

  it('cajero no puede cambiar la identidad de autenticación de su perfil', async () => {
    await conVenta(async () => {
      await sesion(cajero)
      await expect(db.exec(`UPDATE public.usuarios SET auth_user_id = '${propietario}' WHERE id = '${cajero}';`)).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('dueño puede crear un empleado sin privilegios globales', async () => {
    await conVenta(async () => {
      await db.exec(`INSERT INTO public.usuarios (id, kiosco_id, rol) VALUES ('00000000-0000-0000-0000-000000000099', '${kiosco}', 'CAJERO');`)
      expect((await db.query(`SELECT rol, es_superadmin FROM public.usuarios WHERE id = '00000000-0000-0000-0000-000000000099'`)).rows).toEqual([{ rol: 'CAJERO', es_superadmin: false }])
    })
  })

  it('impide asociar la misma cuenta de autenticación a dos perfiles', async () => {
    await conVenta(async () => {
      await expect(db.exec(`INSERT INTO public.usuarios (id, auth_user_id, kiosco_id, rol) VALUES ('00000000-0000-0000-0000-000000000099', '${propietario}', '${kiosco}', 'CAJERO');`)).rejects.toMatchObject({ code: '23505' })
    })
  })

  it('superadmin conserva la administración de privilegios globales', async () => {
    await conVenta(async () => {
      await sesion(superadmin)
      await db.exec(`UPDATE public.usuarios SET es_superadmin = true WHERE id = '${cajero}';`)
      expect((await db.query(`SELECT es_superadmin FROM public.usuarios WHERE id = '${cajero}'`)).rows).toEqual([{ es_superadmin: true }])
    })
  })

  it('dueño no puede modificar un perfil superadmin del mismo comercio', async () => {
    await conVenta(async () => {
      await sesion(superadmin)
      await db.exec(`UPDATE public.usuarios SET es_superadmin = true WHERE id = '${cajero}';`)
      await sesion(propietario)
      await expect(db.exec(`UPDATE public.usuarios SET auth_user_id = NULL WHERE id = '${cajero}';`)).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('permite mantenimiento desde la sesión SQL administrativa sin JWT', async () => {
    await conVenta(async () => {
      await db.exec(`RESET ROLE; SET request.jwt.claim.sub = ''; SET request.jwt.claim.role = ''; UPDATE public.usuarios SET es_superadmin = true WHERE id = '${cajero}';`)
      expect((await db.query(`SELECT es_superadmin FROM public.usuarios WHERE id = '${cajero}'`)).rows).toEqual([{ es_superadmin: true }])
    })
  })

  it('cajero no puede cambiar el precio de catálogo por acceso directo', async () => {
    await conVenta(async () => {
      await sesion(cajero)
      await expect(db.exec(`UPDATE public.productos SET precio_venta = 900 WHERE id = '${productoInicial}';`)).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('cambiar precio como dueño guarda actor y valores anterior/nuevo en auditoría', async () => {
    await conVenta(async () => {
      await db.exec(`UPDATE public.productos SET precio_venta = 900 WHERE id = '${productoInicial}';`)
      expect((await db.query('SELECT actor_auth_id, accion, entidad_id, detalles FROM public.auditoria_operaciones')).rows).toEqual([{
        actor_auth_id: propietario,
        accion: 'PRECIO_VENTA_MODIFICADO',
        entidad_id: productoInicial,
        detalles: { precio_anterior: 0, precio_nuevo: 900 },
      }])
    })
  })

  it('enviar el mismo precio no genera auditorías duplicadas', async () => {
    await conVenta(async () => {
      await db.exec(`UPDATE public.productos SET precio_venta = 0 WHERE id = '${productoInicial}';`)
      expect((await db.query('SELECT id FROM public.auditoria_operaciones')).rows).toEqual([])
    })
  })

  it('consulta comercial devuelve sólo eventos propios y campos públicos acotados', async () => {
    await conVenta(async () => {
      await instalarConsultaComercial()
      await instalarConsultaComercial()
      await db.exec(`UPDATE public.productos SET precio_venta = 900 WHERE id = '${productoInicial}';`)
      await db.exec('RESET ROLE;')
      await db.query(`UPDATE public.auditoria_operaciones SET detalles = detalles || '{"token":"secreto","precio_costo":999}'::jsonb`)
      await db.query(`INSERT INTO public.auditoria_operaciones (kiosco_id,accion,entidad,entidad_id,motivo) VALUES ($1,'VENTA_ANULADA','ventas',$2,'Ajeno'), ($3,'OTRA','productos',$4,'Excluir')`, [otroKiosco, venta, kiosco, productoInicial])
      await sesion(propietario)
      const filas = (await db.query<{ accion: string; detalles: unknown }>('SELECT * FROM public.consultar_auditoria_comercial(50)')).rows
      expect(filas).toHaveLength(1)
      expect(filas[0].accion).toBe('PRECIO_VENTA_MODIFICADO')
      expect(filas[0].detalles).toEqual({ precio_anterior: 0, precio_nuevo: 900 })
      expect(Object.keys(filas[0])).toHaveLength(9)
      await sesion(cajero)
      await expect(db.query('SELECT * FROM public.consultar_auditoria_comercial(50)')).rejects.toMatchObject({ code: '42501' })
    })
  })

  it.each([null, 0, 101])('consulta comercial rechaza límite %s', async limite => {
    await conVenta(async () => {
      await instalarConsultaComercial()
      await expect(db.query('SELECT * FROM public.consultar_auditoria_comercial($1)', [limite])).rejects.toMatchObject({ code: '22023' })
    })
  })

  it('guarda la justificación específica sin conservarla para otro cambio', async () => {
    await conVenta(async () => {
      const sql = readFileSync('supabase_fase_motivo_cambio_precio.sql', 'utf8')
      // La migración se instala fuera del rol de cliente, dentro de la transacción de prueba.
      await db.exec('RESET ROLE;')
      await db.exec(sql.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, ''))
      await db.exec(sql.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, ''))
      await sesion(propietario)
      await db.exec(`UPDATE public.productos SET precio_venta = 900, motivo_cambio_precio = '  Nueva lista del proveedor  ' WHERE id = '${productoInicial}';`)
      expect((await db.query('SELECT motivo FROM public.auditoria_operaciones')).rows).toEqual([{ motivo: 'Nueva lista del proveedor' }])
      expect((await db.query('SELECT motivo_cambio_precio FROM public.productos')).rows).toEqual([{ motivo_cambio_precio: null }])
      await expect(db.exec(`UPDATE public.productos SET precio_venta = 1000 WHERE id = '${productoInicial}';`)).rejects.toMatchObject({ code: '22023' })
    })
  })

  it.each(['', '    ', 'abcd', 'x'.repeat(301)])('rechaza justificación inválida sin cambiar precio: %s', async motivo => {
    await sesion(propietario)
    await db.exec('BEGIN; RESET ROLE;')
    try {
      const sql = readFileSync('supabase_fase_motivo_cambio_precio.sql', 'utf8')
      await db.exec(sql.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, ''))
      await sesion(propietario)
      await expect(db.query(`UPDATE public.productos SET precio_venta = 900, motivo_cambio_precio = $1 WHERE id = $2`, [motivo, productoInicial])).rejects.toMatchObject({ code: '22023' })
    } finally { await db.exec('ROLLBACK; RESET ROLE;') }
  })

  it('la justificación no concede permiso al cajero', async () => {
    await sesion(propietario)
    await db.exec('BEGIN; RESET ROLE;')
    try {
      const sql = readFileSync('supabase_fase_motivo_cambio_precio.sql', 'utf8')
      await db.exec(sql.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, ''))
      await sesion(cajero)
      await expect(db.exec(`UPDATE public.productos SET precio_venta = 900, motivo_cambio_precio = 'Nueva lista del proveedor' WHERE id = '${productoInicial}'`)).rejects.toMatchObject({ code: '42501' })
    } finally { await db.exec('ROLLBACK; RESET ROLE;') }
  })
})
