// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { capacidadesPorDefecto } from '../hooks/useTenantConfig'
import type { RubroComercio } from '../types/database'

const db = new PGlite()
const migration = readFileSync(new URL('../../supabase_fase_rubros_especializados.sql', import.meta.url), 'utf8')
beforeAll(async () => {
  await db.exec(`CREATE TABLE public.kioscos (
    id text PRIMARY KEY, rubro varchar(50), capacidades_operativas jsonb
  ); INSERT INTO public.kioscos VALUES ('local', 'KIOSCO', '{"envases":false,"personalizado":true}');`)
  await db.exec(migration)
  await db.exec(migration)
})
afterAll(async () => { await db.close() })

it('reaplicar SQL y guardar el mismo rubro conserva preferencias', async () => {
  await db.exec("UPDATE public.kioscos SET rubro = 'KIOSCO' WHERE id = 'local'")
  const { rows } = await db.query<{ capacidades_operativas: object }>('SELECT capacidades_operativas FROM public.kioscos')
  expect(rows[0].capacidades_operativas).toEqual({ envases: false, personalizado: true })
})

it('cada cambio real aplica las mismas capacidades que el frontend', async () => {
  const rubros: RubroComercio[] = ['PETSHOP_VETERINARIA', 'ELECTRONICA_CELULARES', 'GENERAL', 'FOTOCOPIADORA_LIBRERIA', 'KIOSCO']
  for (const rubro of rubros) {
    await db.query('UPDATE public.kioscos SET rubro = $1 WHERE id = $2', [rubro, 'local'])
    const { rows } = await db.query<{ capacidades_operativas: object }>('SELECT capacidades_operativas FROM public.kioscos')
    expect(rows[0].capacidades_operativas).toEqual(capacidadesPorDefecto(rubro))
  }
})

it('un guardado con rubro actual no borra preferencias aunque provenga de otra sesión', async () => {
  await db.exec(`UPDATE public.kioscos SET rubro = 'PETSHOP_VETERINARIA';
    UPDATE public.kioscos SET capacidades_operativas = '{"balanza":false,"vencimientos":true}';
    UPDATE public.kioscos SET rubro = 'PETSHOP_VETERINARIA';`)
  const { rows } = await db.query<{ capacidades_operativas: object }>('SELECT capacidades_operativas FROM public.kioscos')
  expect(rows[0].capacidades_operativas).toEqual({ balanza: false, vencimientos: true })
})
