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
