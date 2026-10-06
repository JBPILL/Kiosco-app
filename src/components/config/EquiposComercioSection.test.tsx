import { useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { EquiposComercioSection, normalizarEquiposComercio } from './EquiposComercioSection'

afterEach(() => vi.unstubAllGlobals())
it('completa al conectar y retira la detección al desconectar sin borrar el registro', async () => {
  let conectado = true
  const usb = Object.assign(new EventTarget(), {
    getDevices: async () => conectado ? [{ vendorId: 1, productId: 2, productName: 'Printer A', deviceClass: 7 }] : [],
  })
  vi.stubGlobal('navigator', { usb })
  localStorage.clear()
  function Formulario() {
    const [equipos, setEquipos] = useState(normalizarEquiposComercio(null))
    return <EquiposComercioSection value={equipos} onChange={setEquipos} />
  }
  render(<Formulario />)
  await waitFor(() => expect((screen.getByLabelText('Marca y modelo de impresora') as HTMLInputElement).value).toBe('Printer A'))
  expect(screen.getByText('Detectado · prueba pendiente')).toBeTruthy()
  conectado = false
  await act(async () => usb.dispatchEvent(new Event('disconnect')))
  await waitFor(() => expect(screen.queryByText('Detectado · prueba pendiente')).toBeNull())
  expect((screen.getByLabelText('Marca y modelo de impresora') as HTMLInputElement).value).toBe('Printer A')
})
