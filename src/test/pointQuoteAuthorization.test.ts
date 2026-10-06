import { describe, expect, it } from 'vitest'
import { autorizarCotizacionPoint, validarCreditoCotizacionPoint } from '../../supabase/functions/_shared/pointQuoteAuthorization'
import type { Cliente, Kiosco, Usuario } from '../types/database'

const usuario: Usuario = { id: 'u1', auth_user_id: 'auth-1', kiosco_id: 'k1', nombre: 'Dueño',
  email: null, rol: 'DUEÑO', activo: true, fecha_creacion: '' }
const kiosco: Kiosco = { id: 'k1', nombre: 'Local', direccion: null, telefono: null,
  fecha_creacion: '', estado_suscripcion: 'ACTIVO',
  capacidades_operativas: { envases: true, balanza: true, vencimientos: true, serviciosRapidos: true } }
const cliente: Cliente = { id: 'c1', kiosco_id: 'k1', nombre: 'Cliente', telefono: null,
  dni_cuit: null, direccion: null, email: null, limite_credito: 100, saldo_deudor: 80,
  activo: true, fecha_creacion: '', notas: null }

describe('autorización de cotización Point', () => {
  it('vincula el perfil al JWT, comercio activo y rol de cobro', () => {
    expect(autorizarCotizacionPoint('auth-1', usuario, kiosco).permiteAjustes).toBe(true)
    expect(autorizarCotizacionPoint('auth-1', { ...usuario, rol: 'CAJERO' }, kiosco).permiteAjustes).toBe(false)
    expect(() => autorizarCotizacionPoint('otro', usuario, kiosco)).toThrow('no autorizado')
    expect(() => autorizarCotizacionPoint('auth-1', { ...usuario, rol: 'VISOR' }, kiosco)).toThrow()
    expect(() => autorizarCotizacionPoint('auth-1', usuario, { ...kiosco, estado_suscripcion: 'SOLO_LECTURA' })).toThrow()
  })

  it('requiere capacidad explícita para servicios', () => {
    expect(autorizarCotizacionPoint('auth-1', usuario, { ...kiosco, capacidades_operativas: null }).permiteServicios).toBe(false)
  })

  it('valida pertenencia, actividad y límite crediticio con igualdad inclusiva', () => {
    expect(() => validarCreditoCotizacionPoint('k1', 'c1', cliente, 2000)).not.toThrow()
    expect(() => validarCreditoCotizacionPoint('k1', 'c1', cliente, 2001)).toThrow('excedido')
    expect(() => validarCreditoCotizacionPoint('k2', 'c1', cliente, 100)).toThrow('Cliente')
    expect(() => validarCreditoCotizacionPoint('k1', 'c1', { ...cliente, activo: false }, 100)).toThrow()
    expect(() => validarCreditoCotizacionPoint('k1', 'c1', { ...cliente, limite_credito: 0 }, 999999)).not.toThrow()
  })
})
