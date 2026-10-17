import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { crearProducto } from '../../test/factories'

const { cargar, tenant } = vi.hoisted(() => ({
  cargar: vi.fn(), tenant: { tieneEnvases: false, tieneBalanza: false, tieneVencimientos: false },
}))
vi.mock('../../hooks/useTenantConfig', () => ({ useTenantConfig: () => tenant }))
vi.mock('../../hooks/useBarcodeGun', () => ({ useBarcodeGun: () => undefined }))
vi.mock('../../stores/envasesStore', () => ({ useEnvasesStore: () => ({ tiposEnvases: [], cargarTiposEnvases: cargar }) }))
vi.mock('../../stores/proveedorStore', () => ({ useProveedorStore: () => ({ proveedores: [], cargarProveedores: cargar }) }))
vi.mock('../ui/BarcodeCaptureModal', () => ({
  BarcodeCaptureModal: ({ isOpen, onBarcodeCaptured, onClose }: { isOpen: boolean; onBarcodeCaptured: (code: string) => void; onClose: () => void }) =>
    isOpen ? <button onClick={() => { onBarcodeCaptured('0012345678905'); onClose() }}>Lectura óptica de ensayo</button> : null,
}))
import { ProductForm } from './ProductForm'
afterEach(() => vi.unstubAllEnvs())

it('exige y envía un motivo al modificar el precio', async () => {
  vi.stubEnv('VITE_AUDITORIA_MOTIVO_PRECIO', 'true')
  const guardar = vi.fn().mockResolvedValue(true)
  render(<ProductForm isOpen categorias={[]} onClose={() => undefined} onGuardar={guardar}
    producto={crearProducto({ precio_venta: 12345 })} />)
  fireEvent.change(screen.getByDisplayValue('12345'), { target: { value: '12500' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }))
  expect(guardar).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('textbox', { name: 'Motivo del cambio de precio' }), { target: { value: '  Nueva lista  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }))
  await waitFor(() => expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ precio_venta: 12500, motivo_cambio_precio: 'Nueva lista' })))
})

it('editar un pesable con módulos desactivados conserva unidad, PLU y stock fraccionario', async () => {
  const guardar = vi.fn().mockResolvedValue(true)
  render(<ProductForm isOpen categorias={[]} onClose={() => undefined} onGuardar={guardar}
    producto={crearProducto({ es_pesable: true, unidad_medida: 'KG', plu_balanza: '1234', stock_actual: 1.75, stock_minimo: 0.5 })} />)
  fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }))
  await waitFor(() => expect(guardar).toHaveBeenCalledWith(expect.objectContaining({
    es_pesable: true, unidad_medida: 'KG', plu_balanza: '1234', stock_actual: 1.75, stock_minimo: 0.5,
  })))
})

it('editar un retornable y perecedero conserva depósito y vencimiento aunque se oculten módulos', async () => {
  const guardar = vi.fn().mockResolvedValue(true)
  render(<ProductForm isOpen categorias={[]} onClose={() => undefined} onGuardar={guardar}
    producto={crearProducto({ es_retornable: true, precio_envase: 500, nombre_envase: 'Botella', requiere_vencimiento: true, dias_alerta_vencimiento: 7 })} />)
  fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }))
  await waitFor(() => expect(guardar).toHaveBeenCalledWith(expect.objectContaining({
    es_retornable: true, precio_envase: 500, nombre_envase: 'Botella', requiere_vencimiento: true, dias_alerta_vencimiento: 7,
  })))
})


it('la captura de cámara completa el código conservando ceros sin crear el producto automáticamente', () => {
  const guardar = vi.fn()
  render(<ProductForm isOpen categorias={[]} onClose={vi.fn()} onGuardar={guardar} />)
  fireEvent.click(screen.getByTitle('Escanear código con la cámara del celular'))
  fireEvent.click(screen.getByRole('button', { name: 'Lectura óptica de ensayo' }))
  expect(screen.getByDisplayValue('0012345678905')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Lectura óptica de ensayo' })).toBeNull()
  expect(guardar).not.toHaveBeenCalled()
})

it('cerrar el formulario cierra la cámara y reabrirlo no la inicia por sorpresa', () => {
  const guardar = vi.fn(); const cerrar = vi.fn()
  const ventana = (abierta: boolean) => <ProductForm isOpen={abierta} categorias={[]} onClose={cerrar} onGuardar={guardar} />
  const vista = render(ventana(true))
  fireEvent.click(screen.getByTitle('Escanear código con la cámara del celular'))
  expect(screen.getByRole('button', { name: 'Lectura óptica de ensayo' })).toBeTruthy()
  vista.rerender(ventana(false))
  expect(screen.queryByRole('button', { name: 'Lectura óptica de ensayo' })).toBeNull()
  vista.rerender(ventana(true))
  expect(screen.queryByRole('button', { name: 'Lectura óptica de ensayo' })).toBeNull()
  expect(guardar).not.toHaveBeenCalled()
})


it('stock cero queda listo para reemplazar al enfocar sin guardar ni alterar otras cantidades', () => {
  const guardar = vi.fn()
  render(<ProductForm isOpen categorias={[]} onClose={vi.fn()} onGuardar={guardar} />)
  const stock = screen.getByDisplayValue('0') as HTMLInputElement
  fireEvent.focus(stock)
  expect(stock.value).toBe('')
  fireEvent.change(stock, { target: { value: '12' } })
  fireEvent.blur(stock)
  expect(stock.value).toBe('12')
  expect(screen.getByDisplayValue('5')).toBeTruthy()
  expect(guardar).not.toHaveBeenCalled()
})
