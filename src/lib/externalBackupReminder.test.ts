import { beforeEach, expect, it, vi } from 'vitest'
import { leerDescargaRespaldoExterno, necesitaRecordatorioRespaldo, registrarDescargaRespaldoExterno, SIETE_DIAS_MS } from './externalBackupReminder'

const ahora = Date.parse('2026-10-20T12:00:00Z')
beforeEach(() => localStorage.clear())

it('mantiene historial separado por kiosco y no escribe al leer o calcular avisos', () => {
  expect(leerDescargaRespaldoExterno('k1')).toBeNull()
  expect(necesitaRecordatorioRespaldo(null, '2026-10-01T00:00:00Z', ahora)).toBe(true)
  expect(localStorage.length).toBe(0)
  expect(registrarDescargaRespaldoExterno('k1', 'JSON', ahora)).toBe(true)
  expect(leerDescargaRespaldoExterno('k1')).toEqual({ fecha: new Date(ahora).toISOString(), formato: 'JSON' })
  expect(leerDescargaRespaldoExterno('k2')).toBeNull()
  registrarDescargaRespaldoExterno('k2', 'EXCEL', ahora - SIETE_DIAS_MS - 1)
  expect(necesitaRecordatorioRespaldo(leerDescargaRespaldoExterno('k2'), undefined, ahora)).toBe(true)
  expect(necesitaRecordatorioRespaldo(leerDescargaRespaldoExterno('k1'), undefined, ahora)).toBe(false)
})

it('avisa después de siete días y da margen inicial usando creación sin persistir datos', () => {
  const descarga = { fecha: new Date(ahora - SIETE_DIAS_MS).toISOString(), formato: 'JSON' as const }
  expect(necesitaRecordatorioRespaldo(descarga, undefined, ahora)).toBe(false)
  expect(necesitaRecordatorioRespaldo(descarga, undefined, ahora + 1)).toBe(true)
  expect(necesitaRecordatorioRespaldo(null, new Date(ahora - 1000).toISOString(), ahora)).toBe(false)
  expect(localStorage.length).toBe(0)
})

it('tolera almacenamiento corrupto o bloqueado y fechas futuras sin certificarlas como recientes', () => {
  localStorage.setItem('kioskopos_respaldo_externo_v1_k1', 'malformed')
  expect(leerDescargaRespaldoExterno('k1')).toBeNull()
  expect(necesitaRecordatorioRespaldo({ fecha: new Date(ahora + 1).toISOString(), formato: 'JSON' }, undefined, ahora)).toBe(true)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  expect(registrarDescargaRespaldoExterno('k1', 'EXCEL', ahora)).toBe(false)
})
