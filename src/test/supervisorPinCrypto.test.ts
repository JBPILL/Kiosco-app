// @vitest-environment node
import { createHmac, pbkdf2Sync } from 'node:crypto'
import { expect, it } from 'vitest'
import { crearHashPinSupervisor, verificarPinSupervisor } from '../../supabase/functions/_shared/supervisorPinCrypto'
const kid = '10000000-0000-0000-0000-000000000001'
// Material ficticio exclusivo de pruebas. Producción debe usar secreto aleatorio.
const pepper = new Uint8Array(32).fill(7)
it('preserva ceros iniciales y coincide con una derivación independiente en Node', async () => {
 const registro = await crearHashPinSupervisor('0042', kid, pepper, '1')
 const material = createHmac('sha256', pepper).update(`kiosko-supervisor:v1:${kid}:0042`).digest()
 expect(registro.hash).toBe(pbkdf2Sync(material, Buffer.from(registro.sal, 'hex'), 600000, 32, 'sha256').toString('hex'))
 expect(await verificarPinSupervisor('0042', kid, pepper, '1', registro)).toBe(true)
 expect(Object.keys(registro).sort()).toEqual(['algoritmo', 'hash', 'iteraciones', 'pepperVersion', 'sal', 'version'])
})
it('genera sales distintas para el mismo PIN', async () => {
 const primero = await crearHashPinSupervisor('123456', kid, pepper, '1')
 const segundo = await crearHashPinSupervisor('123456', kid, pepper, '1')
 expect(primero.sal).not.toBe(segundo.sal); expect(primero.hash).not.toBe(segundo.hash)
 expect(await verificarPinSupervisor('123456', kid, pepper, '1', segundo)).toBe(true)
})
it('rechaza PIN, comercio o pepper distintos', async () => {
 const registro = await crearHashPinSupervisor('0042', kid, pepper, '1')
 expect(await verificarPinSupervisor('0043', kid, pepper, '1', registro)).toBe(false)
 expect(await verificarPinSupervisor('0042', kid.replace(/1$/, '2'), pepper, '1', registro)).toBe(false)
 expect(await verificarPinSupervisor('0042', kid, new Uint8Array(32).fill(8), '1', registro)).toBe(false)
})
it.each(['123', '1234567', '12a4', ' 1234', '１２３４', 1234])('rechaza formato de PIN inválido %s', async pin => {
 await expect(crearHashPinSupervisor(pin as string, kid, pepper, '1')).rejects.toThrow('Configuración de PIN inválida')
})
it('rechaza registros débiles, malformados o de otra versión de pepper', async () => {
 const registro = await crearHashPinSupervisor('0042', kid, pepper, '1')
 for (const alterado of [{ ...registro, iteraciones: 1 }, { ...registro, sal: '00' }, { ...registro, hash: '00' }, { ...registro, pepperVersion: '2' }, { ...registro, extra: true }]) {
  await expect(verificarPinSupervisor('0042', kid, pepper, '1', alterado)).rejects.toThrow('Hash de PIN inválido')
 }
 await expect(crearHashPinSupervisor('0042', kid, new Uint8Array(16), '1')).rejects.toThrow('Configuración de PIN inválida')
})
