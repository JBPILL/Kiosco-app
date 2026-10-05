import { beforeAll, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import {
  cifrarBackupJson,
  descifrarBackupJson,
  esBackupCifrado,
} from './backupCrypto'

beforeAll(() => {
  vi.stubGlobal('crypto', webcrypto)
})

describe('cifrado de backups', () => {
  const clave = 'contraseña de resguardo suficientemente larga'
  const contenido = JSON.stringify({ app: 'KioskoApp', productos: [{ id: 'p1', precio_costo: 1500 }] })

  it('cifra y recupera el JSON sin dejar su contenido visible', async () => {
    const cifrado = await cifrarBackupJson(contenido, clave)

    expect(esBackupCifrado(cifrado)).toBe(true)
    expect(cifrado).not.toContain('precio_costo')
    await expect(descifrarBackupJson(cifrado, clave)).resolves.toBe(contenido)
  })

  it('rechaza una contraseña incorrecta sin devolver contenido parcial', async () => {
    const cifrado = await cifrarBackupJson(contenido, clave)

    await expect(descifrarBackupJson(cifrado, 'otra contraseña suficientemente larga')).rejects.toThrow(
      'No se pudo descifrar'
    )
  })

  it('distingue un backup JSON común de un sobre cifrado', () => {
    expect(esBackupCifrado(contenido)).toBe(false)
  })
})
