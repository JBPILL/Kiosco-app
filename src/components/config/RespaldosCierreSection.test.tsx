import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RespaldosCierreSection } from './RespaldosCierreSection'
import { useAuthStore } from '../../stores/authStore'
import type { RespaldoCierreLocal } from '../../lib/backupCierreLocal'
import type { Usuario } from '../../types/database'

const mocks = vi.hoisted(() => ({ listar: vi.fn(), descargar: vi.fn() }))
vi.mock('../../lib/backupCierreLocal', () => ({ listarRespaldosCierreLocal: mocks.listar }))
vi.mock('../../lib/exportUtils', () => ({ descargarArchivo: mocks.descargar }))
const dueno = (kioscoId: string): Usuario => ({ id: 'u1', kiosco_id: kioscoId, rol: 'DUEÑO' } as Usuario)
const copia = (kioscoId = 'k1'): RespaldoCierreLocal => ({
  kioscoId, sesionId: `s-${kioscoId}`, fecha: '2026-10-06T18:00:00Z', cierreConfirmadoRemoto: false,
  tipo: 'ARQUEO_CAJA', version: 1, resumen: null, movimientos: [],
  sesion: { id: `s-${kioscoId}`, kiosco_id: kioscoId, usuario_id: 'u1', fecha_apertura: '2026-10-06T08:00:00Z',
    fecha_cierre: '2026-10-06T18:00:00Z', monto_inicial: 100, monto_final_declarado: 100,
    monto_final_sistema: 100, diferencia: 0, estado: 'CERRADA' },
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.listar.mockReset().mockResolvedValue([copia()])
  useAuthStore.setState({ usuario: dueno('k1') })
})

it('descarga únicamente el arqueo del comercio activo y describe el estado al crear la copia', async () => {
  mocks.listar.mockResolvedValue([copia('k2'), copia('k1')])
  render(<RespaldosCierreSection />)
  const boton = await screen.findByRole('button', { name: 'Descargar arqueo' })
  expect(screen.getAllByRole('button', { name: 'Descargar arqueo' })).toHaveLength(1)
  expect(screen.getByText('Pendiente de sincronización al crear la copia')).toBeTruthy()
  fireEvent.click(boton)
  expect(mocks.descargar).toHaveBeenCalledOnce()
  expect(JSON.parse(mocks.descargar.mock.calls[0][0] as string).kioscoId).toBe('k1')
})

it('retira las copias del comercio anterior al cambiar de kiosco aunque la lectura nueva siga pendiente', async () => {
  render(<RespaldosCierreSection />)
  await screen.findByRole('button', { name: 'Descargar arqueo' })
  let resolver: ((value: RespaldoCierreLocal[]) => void) | undefined
  mocks.listar.mockImplementationOnce(() => new Promise<RespaldoCierreLocal[]>((resolve) => { resolver = resolve }))
  act(() => { useAuthStore.setState({ usuario: dueno('k2') }) })
  expect(screen.queryByRole('button', { name: 'Descargar arqueo' })).toBeNull()
  await act(async () => { resolver?.([copia('k2')]) })
  fireEvent.click(await screen.findByRole('button', { name: 'Descargar arqueo' }))
  expect(JSON.parse(mocks.descargar.mock.calls[0][0] as string).kioscoId).toBe('k2')
})

it('revalida el comercio actual al descargar aunque el botón conserve una copia anterior', async () => {
  render(<RespaldosCierreSection />)
  const boton = await screen.findByRole('button', { name: 'Descargar arqueo' })
  const estado = useAuthStore.getState()
  vi.spyOn(useAuthStore, 'getState').mockReturnValue({ ...estado, usuario: dueno('k2') })
  fireEvent.click(boton)
  expect(mocks.descargar).not.toHaveBeenCalled()
})

it('no lista ni descarga copias para el cajero', async () => {
  useAuthStore.setState({ usuario: { ...dueno('k1'), rol: 'CAJERO' } })
  render(<RespaldosCierreSection />)
  await waitFor(() => expect(mocks.listar).not.toHaveBeenCalled())
  expect(screen.queryByRole('button', { name: 'Descargar arqueo' })).toBeNull()
})
