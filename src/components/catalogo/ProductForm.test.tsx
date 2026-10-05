import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { crearProducto } from '../../test/factories'

const { cargar, tenant } = vi.hoisted(() => ({
  cargar: vi.fn(), tenant: { tieneEnvases: false, tieneBalanza: false, tieneVencimientos: false },
}))
vi.mock('../../hooks/useTenantConfig', () => ({ useTenantConfig: () => tenant }))
vi.mock('../../hooks/useBarcodeGun', () => ({ useBarcodeGun: () => undefined }))
vi.mock('../../stores/envasesStore', () => ({ useEnvasesStore: () => ({ tiposEnvases: [], cargarTiposEnvases: cargar }) }))
vi.mock('../../stores/proveedorStore', () => ({ useProveedorStore: () => ({ proveedores: [], cargarProveedores: cargar }) }))
vi.mock('../ui/BarcodeCaptureModal', () => ({ BarcodeCaptureModal: () => null }))
import { ProductForm } from './ProductForm'

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
