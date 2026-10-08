import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { db, resetDb, responder } from '../../test/supabaseMock'

vi.mock('../../lib/supabase', async () => {
  const { crearModuloSupabase } = await import('../../test/supabaseMock')
  return crearModuloSupabase()
})
vi.mock('../../stores/authStore', () => ({ useAuthStore: () => ({ usuario: { kiosco_id: 'k1' } }) }))
vi.mock('../../lib/utils', () => ({ formatPrecio: (valor: number) => String(valor), saveCachedProductos: vi.fn() }))
import { ImportarCatalogoModal } from './ImportarCatalogoModal'

beforeEach(() => {
  resetDb(); vi.clearAllMocks(); vi.stubEnv('VITE_AUDITORIA_MOTIVO_PRECIO', 'true')
  responder('productos.select', { data: [{ id: 'p1', codigo_barras: '123', descripcion: 'Agua', stock_actual: 5, activo: true }], error: null })
})
afterEach(() => vi.unstubAllEnvs())

it('exige motivo y muestra importación parcial ante rechazo del precio', async () => {
  responder('productos.update', { error: { code: '22023', message: 'Motivo inválido' } })
  const vista = render(<ImportarCatalogoModal isOpen onClose={vi.fn()} onImportCompletado={vi.fn()} categorias={[]} />)
  const archivo = new File(['Código de Barras;Descripción;Precio Venta;Stock Actual\n123;Agua;900;5'], 'lista.csv', { type: 'text/csv' })
  fireEvent.change(vista.container.querySelector('input[type="file"]')!, { target: { files: [archivo] } })
  const boton = await screen.findByRole('button', { name: 'Confirmar Importación (1)' })
  fireEvent.click(boton)
  expect(db.llamadas.filter(llamada => llamada.op === 'update')).toHaveLength(0)
  fireEvent.change(screen.getByRole('textbox', { name: 'Motivo del cambio de precio' }), { target: { value: '  Lista de octubre  ' } })
  fireEvent.click(boton)
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Importación parcial'), expect.any(Object)))
  expect(db.llamadas.find(llamada => llamada.op === 'update')?.payload).toEqual(expect.objectContaining({ motivo_cambio_precio: 'Lista de octubre' }))
  expect(toast.success).not.toHaveBeenCalledWith(expect.stringContaining('Restauración completada'), expect.any(Object))
})
