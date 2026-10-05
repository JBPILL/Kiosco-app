import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { crearProducto } from '../../test/factories'
import { BalanzaManualModal } from './BalanzaManualModal'

const { leerPeso } = vi.hoisted(() => ({ leerPeso: vi.fn() }))
vi.mock('../../lib/escposPrinter', () => ({ isWebSerialSupported: () => true }))
vi.mock('../../lib/serialScale', () => ({ leerPesoBalanzaSerial: leerPeso }))

it('con integración deshabilitada permite peso manual sin ofrecer lectura USB', () => {
  const confirmar = vi.fn()
  render(<BalanzaManualModal isOpen onClose={() => undefined}
    producto={crearProducto({ es_pesable: true })} onConfirmar={confirmar} lecturaSerialHabilitada={false} />)
  expect(screen.queryByRole('button', { name: 'Leer Balanza USB' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '250g (1/4)' }))
  expect(confirmar).toHaveBeenCalledWith(0.25)
  expect(leerPeso).not.toHaveBeenCalled()
})

it('mantiene lectura USB disponible cuando la integración está habilitada', () => {
  render(<BalanzaManualModal isOpen onClose={() => undefined}
    producto={crearProducto({ es_pesable: true })} onConfirmar={() => undefined} lecturaSerialHabilitada />)
  expect(screen.getByRole('button', { name: 'Leer Balanza USB' })).toBeTruthy()
})
