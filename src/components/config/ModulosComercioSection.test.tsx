import { useState } from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ModulosComercioSection } from './ModulosComercioSection'
import type { CapacidadesOperativas } from '../../types/database'

const capacidades: CapacidadesOperativas = { envases: false, balanza: false, vencimientos: true, serviciosRapidos: false }
afterEach(cleanup)
it('explica cada módulo y conserva el peso manual como alternativa', () => {
 render(<ModulosComercioSection value={capacidades} onChange={vi.fn()} />)
 expect(screen.getAllByRole('checkbox')).toHaveLength(4)
 expect(screen.getByText(/siempre permiten ingresar el peso manualmente/)).toBeTruthy()
 expect(screen.getByText(/fotocopias, impresiones y otros servicios/)).toBeTruthy()
 expect((screen.getByRole('checkbox', { name: 'Lotes y vencimientos' }) as HTMLInputElement).checked).toBe(true)
})
it('actualiza un módulo sin mutar el objeto ni perder los demás valores', () => {
 const onChange = vi.fn()
 render(<ModulosComercioSection value={capacidades} onChange={onChange} />)
 fireEvent.click(screen.getByRole('checkbox', { name: 'Envases retornables' }))
 expect(onChange).toHaveBeenCalledWith({ ...capacidades, envases: true })
 expect(capacidades.envases).toBe(false)
})
it('refleja el estado activado después del cambio del formulario', () => {
 function Formulario() {
  const [value, setValue] = useState(capacidades)
  return <ModulosComercioSection value={value} onChange={setValue} />
 }
 render(<Formulario />)
 fireEvent.click(screen.getByRole('checkbox', { name: 'Servicios rápidos' }))
 expect(screen.getAllByText('Activado')).toHaveLength(2)
})
