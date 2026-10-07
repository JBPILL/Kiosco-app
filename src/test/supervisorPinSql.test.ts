// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
const kid = '10000000-0000-0000-0000-000000000001'
const dueno = '20000000-0000-0000-0000-000000000001'
const cajero = '20000000-0000-0000-0000-000000000002'
const hash = { version: 1, algoritmo: 'PBKDF2-SHA256', iteraciones: 600000, sal: 'a'.repeat(32), hash: 'b'.repeat(64), pepperVersion: '1' }
let db: PGlite
beforeAll(async () => {
 db = new PGlite()
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
 CREATE TABLE kioscos(id uuid PRIMARY KEY);
 CREATE TABLE usuarios(id uuid PRIMARY KEY,auth_user_id uuid,kiosco_id uuid REFERENCES kioscos,activo boolean,rol text);
 INSERT INTO kioscos VALUES('${kid}');
 INSERT INTO usuarios VALUES('${dueno}','${dueno}','${kid}',true,'DUEÑO'),('${cajero}','${cajero}','${kid}',true,'CAJERO');`)
 await db.exec(readFileSync('supabase_fase_supervisor_pin_privado.sql', 'utf8'))
 await db.exec(readFileSync('supabase_fase_supervisor_pin_privado.sql', 'utf8'))
 await db.exec(readFileSync('supabase_fase_supervisor_pin_intentos.sql', 'utf8'))
 await db.exec(readFileSync('supabase_fase_supervisor_pin_intentos.sql', 'utf8'))
 await db.exec(readFileSync('supabase_fase_supervisor_autorizacion_descuento.sql', 'utf8'))
 await db.exec(readFileSync('supabase_fase_supervisor_autorizacion_descuento.sql', 'utf8'))
}, 30000)
beforeEach(async () => {
 await db.exec(`RESET ROLE; SET request.jwt.claim.role='service_role'; DELETE FROM supervisor_autorizaciones; DELETE FROM supervisor_pin_intentos; DELETE FROM supervisor_pin_limites; DELETE FROM supervisor_pin_config_auditoria; DELETE FROM supervisor_pin_secretos; UPDATE usuarios SET activo=true;`)
})
afterAll(async () => { await db.close() })
async function configurar(actor = dueno, datos: unknown = hash) {
 return db.query<{ revision: number }>('SELECT configurar_hash_pin_supervisor($1::uuid,$2::jsonb) AS revision', [actor, JSON.stringify(datos)])
}
it('configura y cambia revisión con auditoría sin PIN ni hash en el registro de auditoría', async () => {
 expect((await configurar()).rows[0].revision).toBe(1)
 expect((await configurar()).rows[0].revision).toBe(2)
 const filas = (await db.query('SELECT * FROM supervisor_pin_config_auditoria ORDER BY revision')).rows
 expect(filas).toHaveLength(2)
 expect(filas[1]).toMatchObject({ kiosco_id: kid, revision: 2, actor_auth_id: dueno })
 expect(Object.keys(filas[1] as object)).not.toContain('pin_hash')
})
it('rechaza actor cajero e inactivo', async () => {
 await expect(configurar(cajero)).rejects.toThrow(/Solo el dueño/)
 await db.exec(`UPDATE usuarios SET activo=false WHERE id='${dueno}'`)
 await expect(configurar()).rejects.toThrow(/Perfil no disponible/)
})
it.each([null, { ...hash, iteraciones: 1 }, { ...hash, sal: '00' }, { ...hash, extra: 'PIN' }, { ...hash, hash: 1234 }])('rechaza hash malformado %#', async datos => {
 await expect(configurar(dueno, datos)).rejects.toThrow(/Hash inválido/)
 expect((await db.query('SELECT * FROM supervisor_pin_secretos')).rows).toHaveLength(0)
})
it('el cliente autenticado no lee el hash ni configura o escribe tablas privadas', async () => {
 await configurar()
 await db.exec("SET ROLE authenticated; SET request.jwt.claim.role='authenticated'")
 await expect(db.query('SELECT * FROM supervisor_pin_secretos')).rejects.toThrow(/permission denied/)
 await expect(configurar()).rejects.toThrow(/permission denied/)
 await expect(db.query('DELETE FROM supervisor_pin_config_auditoria')).rejects.toThrow(/permission denied/)
})

interface Reserva { estado: string; id: string; revision: number; pin_hash: unknown; reintentar_en?: string }
async function reservar(actor = cajero) {
 return (await db.query<{ datos: Reserva }>('SELECT reservar_intento_pin_supervisor($1::uuid) AS datos', [actor])).rows[0].datos
}
async function finalizar(id: string, valido: boolean, actor = cajero) {
 return (await db.query<{ datos: { estado: string; valido: boolean } }>('SELECT finalizar_intento_pin_supervisor($1::uuid,$2::uuid,$3::boolean) AS datos', [actor,id,valido])).rows[0].datos
}
it('sin PIN no entrega hash ni crea reserva', async () => {
 expect(await reservar()).toEqual({ estado: 'NO_CONFIGURADO' })
 expect((await db.query('SELECT * FROM supervisor_pin_intentos')).rows).toHaveLength(0)
})
it('limita a cinco reservas pendientes por operador y conserva el límite tras fallos', async () => {
 await configurar()
 for (let i=0;i<5;i++) { const reserva = await reservar(); expect(reserva.estado).toBe('RESERVADO'); await finalizar(reserva.id,false) }
 const bloqueado = await reservar()
 expect(bloqueado.estado).toBe('BLOQUEADO'); expect(bloqueado.reintentar_en).toBeTruthy(); expect(bloqueado.pin_hash).toBeUndefined()
 expect((await db.query('SELECT * FROM supervisor_pin_intentos')).rows).toHaveLength(5)
})
it('un PIN válido libera su cupo una sola vez y no cambia resultados repetidos', async () => {
 await configurar(); const reserva = await reservar()
 expect(await finalizar(reserva.id,true)).toEqual({ estado: 'FINALIZADO', valido: true })
 expect(await finalizar(reserva.id,false)).toEqual({ estado: 'FINALIZADO', valido: true })
 expect((await db.query<{ intentos: number }>('SELECT intentos FROM supervisor_pin_limites')).rows.map(f=>f.intentos)).toEqual([0,0])
})
it('reserva vencida o revisión de PIN cambiada no acepta éxito ni libera cupo', async () => {
 await configurar(); const vencida = await reservar()
 await db.exec(`UPDATE supervisor_pin_intentos SET vence_en=now()-interval '1 second' WHERE id='${vencida.id}'`)
 expect((await finalizar(vencida.id,true)).valido).toBe(false)
 const anterior = await reservar(); await configurar()
 expect((await finalizar(anterior.id,true)).valido).toBe(false)
 expect((await db.query<{ intentos: number }>('SELECT intentos FROM supervisor_pin_limites')).rows.map(f=>f.intentos)).toEqual([2,2])
})
it('el límite global impide distribuir diez intentos entre operadores', async () => {
 await configurar()
 for (let i=0;i<5;i++) { await reservar(cajero); await reservar(dueno) }
 const tercero = '20000000-0000-0000-0000-000000000003'
 await db.exec(`INSERT INTO usuarios VALUES('${tercero}','${tercero}','${kid}',true,'CAJERO')`)
 expect((await reservar(tercero)).estado).toBe('BLOQUEADO')
 await db.exec(`DELETE FROM usuarios WHERE id='${tercero}'`)
})
it('una nueva ventana permite reservar sin usar el reloj del cliente', async () => {
 await configurar()
 for (let i=0;i<5;i++) await reservar()
 await db.exec("UPDATE supervisor_pin_limites SET ventana=now()-interval '16 minutes'")
 expect((await reservar()).estado).toBe('RESERVADO')
 expect((await db.query<{ intentos: number }>('SELECT intentos FROM supervisor_pin_limites')).rows.map(f=>f.intentos)).toEqual([1,1])
})
it('otro operador no finaliza la reserva e inactivos no reservan', async () => {
 await configurar(); const reserva = await reservar()
 await expect(finalizar(reserva.id,true,dueno)).rejects.toThrow(/Intento no disponible/)
 await db.exec(`UPDATE usuarios SET activo=false WHERE id='${cajero}'`)
 await expect(reservar()).rejects.toThrow(/Perfil no disponible/)
 await expect(finalizar(reserva.id,true)).rejects.toThrow(/Operador no disponible/)
})
it('anon y cliente autenticado no reservan, finalizan ni leen intentos privados', async () => {
 await configurar(); const reserva = await reservar()
 for (const rol of ['anon','authenticated']) {
  await db.exec(`SET ROLE ${rol}; SET request.jwt.claim.role='${rol}'`)
  await expect(reservar()).rejects.toThrow(/permission denied/)
  await expect(finalizar(reserva.id,true)).rejects.toThrow(/permission denied/)
  await expect(db.query('SELECT * FROM supervisor_pin_intentos')).rejects.toThrow(/permission denied/)
  await db.exec('RESET ROLE')
 }
})

function operacion() {
 return { version: 1, checkoutId: '30000000-0000-0000-0000-000000000001', kioscoId: kid, usuarioId: cajero,
 sesionCajaId: '40000000-0000-0000-0000-000000000001', fechaHora: '2026-10-07T12:00:00Z', clienteId: null, notas: null,
 tipoAjuste: 'DESCUENTO_PORCENTAJE', valorAjuste: 20, totalEsperado: 80, subtotalesEsperados: [100], componentesEsperados: [], lineas: [], pagos: [] }
}
async function reservarOperacion(datos: unknown = operacion()) {
 return (await db.query<{ datos: Reserva }>('SELECT reservar_intento_pin_supervisor($1::uuid,$2,$3::jsonb) AS datos',[cajero,'DESCUENTO',JSON.stringify(datos)])).rows[0].datos
}
async function emitir(intentoId: string) {
 return (await db.query<{ datos: { autorizacion_id: string; vence_en: string } }>('SELECT emitir_autorizacion_supervisor($1::uuid,$2::uuid) AS datos',[cajero,intentoId])).rows[0].datos
}
async function consumir(id: string, datos: unknown = operacion(), actor = cajero) {
 return db.query('SELECT consumir_autorizacion_supervisor($1::uuid,$2::uuid,$3,$4::jsonb)',[actor,id,'DESCUENTO',JSON.stringify(datos)])
}
async function permiso() { await configurar(); const reserva = await reservarOperacion(); await finalizar(reserva.id,true); return emitir(reserva.id) }
it('emite permiso ligado al cuerpo original y recupera el mismo sin renovar plazo', async () => {
 await configurar(); const reserva = await reservarOperacion(); await finalizar(reserva.id,true)
 const primero = await emitir(reserva.id)
 expect(await emitir(reserva.id)).toEqual(primero)
 expect((await db.query<{ solicitud: unknown }>('SELECT solicitud FROM supervisor_autorizaciones')).rows[0].solicitud).toEqual(operacion())
})
it('no emite desde un PIN fallido ni una reserva sin operación', async () => {
 await configurar(); const fallida = await reservarOperacion(); await finalizar(fallida.id,false)
 await expect(emitir(fallida.id)).rejects.toThrow(/no autorizada/)
 const sinOperacion = await reservar(); await finalizar(sinOperacion.id,true)
 await expect(emitir(sinOperacion.id)).rejects.toThrow(/no autorizada/)
})
it('consume una sola vez y rechaza cambios de importe, actor u operación', async () => {
 const actual = await permiso()
 await expect(consumir(actual.autorizacion_id,{ ...operacion(), totalEsperado: 70 })).rejects.toThrow(/no corresponde/)
 await expect(consumir(actual.autorizacion_id,operacion(),dueno)).rejects.toThrow(/no corresponde/)
 await expect(consumir(actual.autorizacion_id,{ ...operacion(), checkoutId: dueno })).rejects.toThrow(/no corresponde/)
 await consumir(actual.autorizacion_id)
 await expect(consumir(actual.autorizacion_id)).rejects.toThrow(/consumido/)
})
it('el rollback financiero revierte consumo del permiso', async () => {
 const actual = await permiso()
 await db.exec('BEGIN'); await consumir(actual.autorizacion_id); await db.exec('ROLLBACK')
 expect((await db.query<{ consumido_en: unknown }>('SELECT consumido_en FROM supervisor_autorizaciones')).rows[0].consumido_en).toBeNull()
 await consumir(actual.autorizacion_id)
})
it('PIN cambiado o permiso vencido no permiten consumir', async () => {
 const actual = await permiso(); await configurar()
 await expect(consumir(actual.autorizacion_id)).rejects.toThrow(/PIN modificado/)
 await db.exec("UPDATE supervisor_autorizaciones SET vence_en=now()-interval '1 second'")
 await expect(consumir(actual.autorizacion_id)).rejects.toThrow(/vencido/)
})
it('rechaza cuerpo de otro operador y campos ajenos al contrato', async () => {
 await configurar()
 await expect(reservarOperacion({ ...operacion(), usuarioId: dueno })).rejects.toThrow(/no autorizada/)
 await expect(reservarOperacion({ ...operacion(), pin: 'NO_GUARDAR' })).rejects.toThrow(/Operación inválida/)
})
it('el backend no puede consumir directamente fuera de la función financiera', async () => {
 const actual = await permiso()
 await db.exec('SET ROLE service_role')
 await expect(consumir(actual.autorizacion_id)).rejects.toThrow(/permission denied/)
})
