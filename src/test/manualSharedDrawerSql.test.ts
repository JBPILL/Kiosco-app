// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'

it('modifica sólo la titularidad, conserva comercio y bloqueos y admite reaplicación', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE TABLE sesiones_caja(id uuid,kiosco_id uuid,usuario_id uuid,estado text);
      CREATE FUNCTION preparar_checkout_manual(a uuid,b jsonb,c jsonb) RETURNS boolean LANGUAGE plpgsql AS $$
      DECLARE v_caja uuid:=a; v_kid uuid:=(b->>'kid')::uuid; v_uid uuid:=(b->>'uid')::uuid;
      BEGIN PERFORM 1 FROM public.sesiones_caja WHERE id=v_caja AND kiosco_id=v_kid AND usuario_id=v_uid AND estado='ABIERTA' FOR SHARE; RETURN FOUND; END $$;
      CREATE FUNCTION confirmar_venta_manual_interna_supervisor(a uuid,b jsonb) RETURNS boolean LANGUAGE plpgsql AS $$
      DECLARE caja_id uuid:=a; kid uuid:=(b->>'kid')::uuid; uid uuid:=(b->>'uid')::uuid; caja sesiones_caja;
      BEGIN SELECT * INTO caja FROM public.sesiones_caja WHERE id=caja_id AND kiosco_id=kid AND usuario_id=uid FOR UPDATE; RETURN FOUND; END $$;
      CREATE FUNCTION cancelar_checkout_manual(a jsonb,b text,c text,d text) RETURNS boolean LANGUAGE plpgsql AS $$
      DECLARE v_caja uuid:=(a->>'caja')::uuid; v_kid uuid:=(a->>'kid')::uuid; v_uid uuid:=(a->>'uid')::uuid;
      BEGIN PERFORM 1 FROM public.sesiones_caja WHERE id=v_caja AND kiosco_id=v_kid AND usuario_id=v_uid FOR SHARE; RETURN FOUND; END $$;
      INSERT INTO sesiones_caja VALUES('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','ABIERTA');
    `)
    const sql = readFileSync('supabase_fase_checkout_manual_caja_compartida.sql', 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    const entrada = { kid: '20000000-0000-0000-0000-000000000001', uid: '30000000-0000-0000-0000-000000000002' }
    const caja = '10000000-0000-0000-0000-000000000001'
    for (const funcion of ['preparar_checkout_manual', 'confirmar_venta_manual_interna_supervisor']) {
      const args = funcion.startsWith('preparar') ? '$1::uuid,$2::jsonb,null::jsonb' : '$1::uuid,$2::jsonb'
      expect((await db.query<{ ok: boolean }>(`SELECT ${funcion}(${args}) AS ok`, [caja, entrada])).rows[0].ok).toBe(true)
      expect((await db.query<{ ok: boolean }>(`SELECT ${funcion}(${args}) AS ok`, [caja, { ...entrada, kid: '20000000-0000-0000-0000-000000000002' }])).rows[0].ok).toBe(false)
    }
    await db.exec("UPDATE sesiones_caja SET estado='CERRADA'")
    expect((await db.query<{ ok: boolean }>('SELECT preparar_checkout_manual($1::uuid,$2::jsonb,null) AS ok', [caja, entrada])).rows[0].ok).toBe(false)
  } finally { await db.close() }
}, 30000)

it('prepara con la función real para cajero y conserva identidad, fecha y aislamiento', async () => {
  const db = new PGlite()
  const kid = '10000000-0000-0000-0000-000000000001'
  const vendedor = '20000000-0000-0000-0000-000000000001'
  const titular = '20000000-0000-0000-0000-000000000002'
  const caja = '30000000-0000-0000-0000-000000000001'
  const checkout = '40000000-0000-0000-0000-000000000001'
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
      CREATE TABLE usuarios(id uuid PRIMARY KEY,auth_user_id uuid,kiosco_id uuid,activo boolean,rol text);
      CREATE TABLE kioscos(id uuid PRIMARY KEY,estado_suscripcion text);
      CREATE TABLE sesiones_caja(id uuid PRIMARY KEY,kiosco_id uuid,usuario_id uuid,estado text,fecha_apertura timestamptz,fecha_cierre timestamptz);
      CREATE TABLE checkout_manual_entradas(id uuid PRIMARY KEY,kiosco_id uuid,usuario_id uuid,entrada jsonb,snapshot jsonb,autorizado_por_auth_id uuid);
      INSERT INTO usuarios VALUES('${vendedor}','${vendedor}','${kid}',true,'CAJERO'),('${titular}','${titular}','${kid}',true,'DUEÑO');
      INSERT INTO kioscos VALUES('${kid}','ACTIVO');
      INSERT INTO sesiones_caja VALUES('${caja}','${kid}','${titular}','ABIERTA','2026-10-01T00:00:00Z',null);
      SET request.jwt.claim.role='service_role';`)
    const cierre = readFileSync('supabase_fase_checkout_manual.sql', 'utf8')
    await db.exec(cierre.slice(cierre.indexOf('CREATE OR REPLACE FUNCTION public.checkout_objeto'), cierre.indexOf('CREATE OR REPLACE FUNCTION public.confirmar_venta_manual')))
    await db.exec(readFileSync('supabase_fase_checkout_manual_preparacion_bloqueos.sql', 'utf8'))
    // Estas dos funciones no participan en esta prueba de preparación.
    await db.exec(`CREATE FUNCTION confirmar_venta_manual_interna_supervisor(uuid,jsonb) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
      PERFORM 1 FROM sesiones_caja WHERE id=caja_id AND kiosco_id=kid AND usuario_id=uid FOR UPDATE; END $$;
      CREATE FUNCTION cancelar_checkout_manual(jsonb,text,text,text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
      PERFORM 1 FROM sesiones_caja WHERE id=v_caja AND kiosco_id=v_kid AND usuario_id=v_uid FOR SHARE; END $$;`)
    await db.exec(readFileSync('supabase_fase_checkout_manual_caja_compartida.sql', 'utf8'))
    const entrada = { version: 1, checkoutId: checkout, kioscoId: kid, usuarioId: vendedor, sesionCajaId: caja,
      fechaHora: '2026-10-08T04:00:00.000Z', clienteId: null, notas: null, tipoAjuste: 'NINGUNO', valorAjuste: 0,
      totalEsperado: 100, subtotalesEsperados: [100], componentesEsperados: [], lineas: [], pagos: [] }
    const snapshot = { version: 1, id: checkout, kiosco_id: kid, usuario_id: vendedor, sesion_caja_id: caja,
      fecha_hora: entrada.fechaHora, total: 100, notas: null, cliente_id: null, detalles: [], pagos: [] }
    const preparar = () => db.query('SELECT preparar_checkout_manual($1::uuid,$2::jsonb,$3::jsonb)', [vendedor, entrada, snapshot])
    await expect(preparar()).resolves.toBeTruthy()
    expect((await db.query('SELECT usuario_id FROM checkout_manual_entradas')).rows[0].usuario_id).toBe(vendedor)
    expect((await db.query('SELECT usuario_id FROM sesiones_caja')).rows[0].usuario_id).toBe(titular)
    await db.exec('DELETE FROM checkout_manual_entradas')
    await db.exec("UPDATE sesiones_caja SET estado='CERRADA'")
    await expect(preparar()).rejects.toThrow('Caja original no disponible')
    await db.exec("UPDATE sesiones_caja SET estado='ABIERTA',fecha_apertura='2026-10-09T00:00:00Z'")
    await expect(preparar()).rejects.toThrow('Caja original no disponible')
    await db.exec(`UPDATE sesiones_caja SET fecha_apertura='2026-10-01T00:00:00Z',kiosco_id='10000000-0000-0000-0000-000000000002'`)
    await expect(preparar()).rejects.toThrow('Caja original no disponible')
    await db.exec(`UPDATE sesiones_caja SET kiosco_id='${kid}'; UPDATE usuarios SET activo=false WHERE id='${vendedor}'`)
    await expect(preparar()).rejects.toThrow('Perfil no disponible')
    expect((await db.query('SELECT * FROM checkout_manual_entradas')).rows).toHaveLength(0)
  } finally { await db.close() }
}, 30000)
