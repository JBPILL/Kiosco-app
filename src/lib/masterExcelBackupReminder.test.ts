import { beforeEach, expect, it, vi } from 'vitest'
import { exportarMasterExcel } from './exportUtils'
import { leerDescargaRespaldoExterno } from './externalBackupReminder'

const mocks = vi.hoisted(() => ({ toFile: vi.fn() }))
vi.mock('write-excel-file/browser', () => ({ default: () => ({ toFile: mocks.toFile }) }))
beforeEach(() => {
  localStorage.clear()
  mocks.toFile.mockReset().mockResolvedValue(undefined)
})

it('registra Excel maestro sólo después de que la API solicita la descarga', async () => {
  let completar: (() => void) | undefined
  mocks.toFile.mockImplementationOnce(() => new Promise<void>((resolve) => { completar = resolve }))
  const exportacion = exportarMasterExcel({ kioscoId: 'k1', nombreKiosco: 'Comercio' })
  expect(leerDescargaRespaldoExterno('k1')).toBeNull()
  completar?.()
  await exportacion
  expect(leerDescargaRespaldoExterno('k1')?.formato).toBe('EXCEL')
  expect(leerDescargaRespaldoExterno('k2')).toBeNull()
})

it('mantiene la fecha anterior si el exportador falla', async () => {
  mocks.toFile.mockRejectedValueOnce(new Error('No pudo descargar'))
  await expect(exportarMasterExcel({ kioscoId: 'k1' })).rejects.toThrow('No pudo descargar')
  expect(leerDescargaRespaldoExterno('k1')).toBeNull()
})
