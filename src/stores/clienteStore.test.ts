import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import type { Cliente, MovimientoCuentaCorriente } from '../types/database'
import { db, encolar, llamadasA, resetDb, responder } from '../test/supabaseMock'

vi.mock('../lib/supabase', async () => (await import('../test/supabaseMock')).crearModuloSupabase())

import { useClienteStore } from './clienteStore'
import { useAuthStore } from './authStore'
import { useCajaStore } from './cajaStore'

const KIOSCO = 'k1'
const registrarMovimientoOriginal = useCajaStore.getState().registrarMovimientoCaja

function cli(overrides: Partial<Cliente> = {}): Cliente {
  return {
    id: 'c1',
    kiosco_id: KIOSCO,
    nombre: 'Juan Pérez',
    telefono: null,
    dni_cuit: null,
    direccion: null,
    email: null,
    limite_credito: 10000,
    saldo_deudor: 0,
    activo: true,
    notas: null,
    fecha_creacion: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function movsLocales(clienteId: string): MovimientoCuentaCorriente[] {
  return JSON.parse(localStorage.getItem(`kioskopos_cc_movimientos_${clienteId}`) ?? '[]')
}

function clientesLocales(): Cliente[] {
  return JSON.parse(localStorage.getItem(`kioskopos_clientes_${KIOSCO}`) ?? '[]')
}

function saldoEnStore(id: string) {
  return useClienteStore.getState().clientes.find(c => c.id === id)?.saldo_deudor
}

beforeEach(() => {
  localStorage.clear()
  resetDb()
  vi.clearAllMocks()
  useAuthStore.setState({ usuario: { id: 'u1', nombre: 'Cajero', kiosco_id: KIOSCO } as never })
  useCajaStore.setState({ sesionActiva: null, registrarMovimientoCaja: registrarMovimientoOriginal })
  useClienteStore.setState({ clientes: [], cargando: false })
})

describe('clienteStore.cargarClientes', () => {
  it('devuelve [] sin kiosco identificado', async () => {
    useAuthStore.setState({ usuario: null })
    expect(await useClienteStore.getState().cargarClientes()).toEqual([])
  })

  it('carga desde Supabase y guarda copia local', async () => {
    responder('clientes.select', { data: [cli({ id: 'a' }), cli({ id: 'b', nombre: 'Ana' })], error: null })

    const res = await useClienteStore.getState().cargarClientes()

    expect(res).toHaveLength(2)
    expect(useClienteStore.getState().clientes).toHaveLength(2)
    expect(clientesLocales()).toHaveLength(2)
    expect(useClienteStore.getState().cargando).toBe(false)
  })

  it('usa la copia local cuando Supabase devuelve error', async () => {
    localStorage.setItem(`kioskopos_clientes_${KIOSCO}`, JSON.stringify([cli({ id: 'local' })]))
    responder('clientes.select', { data: null, error: { message: 'relation does not exist' } })

    const res = await useClienteStore.getState().cargarClientes()

    expect(res.map(c => c.id)).toEqual(['local'])
    expect(useClienteStore.getState().cargando).toBe(false)
  })

  it('usa la copia local cuando Supabase lanza excepción', async () => {
    localStorage.setItem(`kioskopos_clientes_${KIOSCO}`, JSON.stringify([cli({ id: 'local' })]))
    db.lanzar.add('clientes')

    const res = await useClienteStore.getState().cargarClientes()

    expect(res.map(c => c.id)).toEqual(['local'])
  })
})

describe('clienteStore.crearCliente', () => {
  it('crea el cliente con datos normalizados y lo ordena alfabéticamente', async () => {
    useClienteStore.setState({ clientes: [cli({ id: 'z', nombre: 'Zulema' })] })

    const nuevo = await useClienteStore.getState().crearCliente({
      nombre: '  Ana Gómez ',
      email: ' ana@mail.com ',
      limite_credito: -500,
      telefono: '  ',
    })

    expect(nuevo).toMatchObject({ nombre: 'Ana Gómez', email: 'ana@mail.com', limite_credito: 0, telefono: null, saldo_deudor: 0 })
    expect(useClienteStore.getState().clientes.map(c => c.nombre)).toEqual(['Ana Gómez', 'Zulema'])
    expect(clientesLocales()).toHaveLength(2)
    expect(llamadasA('clientes', 'insert')).toHaveLength(1)
  })

  it('rechaza nombre vacío', async () => {
    expect(await useClienteStore.getState().crearCliente({ nombre: '   ' })).toBeNull()
    expect(toast.error).toHaveBeenCalled()
    expect(useClienteStore.getState().clientes).toHaveLength(0)
  })

  it('rechaza nombres duplicados sin distinguir mayúsculas ni espacios', async () => {
    useClienteStore.setState({ clientes: [cli({ nombre: 'Juan Pérez' })] })

    expect(await useClienteStore.getState().crearCliente({ nombre: '  juan PÉREZ ' })).toBeNull()
    expect(useClienteStore.getState().clientes).toHaveLength(1)
  })

  it('rechaza emails con formato inválido', async () => {
    for (const email of ['sin-arroba', 'a@b', 'a b@c.com']) {
      expect(await useClienteStore.getState().crearCliente({ nombre: `X ${email}`, email })).toBeNull()
    }
    expect(useClienteStore.getState().clientes).toHaveLength(0)
  })

  it('conserva el cliente localmente si Supabase no está disponible', async () => {
    db.lanzar.add('clientes')

    const nuevo = await useClienteStore.getState().crearCliente({ nombre: 'Offline' })

    expect(nuevo).not.toBeNull()
    expect(clientesLocales().map(c => c.nombre)).toEqual(['Offline'])
  })

  it('falla sin kiosco identificado', async () => {
    useAuthStore.setState({ usuario: null })
    expect(await useClienteStore.getState().crearCliente({ nombre: 'X' })).toBeNull()
  })
})

describe('clienteStore.actualizarCliente', () => {
  beforeEach(() => {
    useClienteStore.setState({ clientes: [cli({ id: 'c1', nombre: 'Juan' }), cli({ id: 'c2', nombre: 'Ana' })] })
  })

  it('actualiza datos y recorta el nombre', async () => {
    expect(await useClienteStore.getState().actualizarCliente('c1', { nombre: '  Juan Carlos ', telefono: '123' })).toBe(true)

    const c1 = useClienteStore.getState().clientes.find(c => c.id === 'c1')
    expect(c1).toMatchObject({ nombre: 'Juan Carlos', telefono: '123' })
    expect(clientesLocales().find(c => c.id === 'c1')?.nombre).toBe('Juan Carlos')
  })

  it('permite conservar el propio nombre', async () => {
    expect(await useClienteStore.getState().actualizarCliente('c1', { nombre: 'juan' })).toBe(true)
  })

  it('rechaza el nombre de otro cliente y el nombre vacío', async () => {
    expect(await useClienteStore.getState().actualizarCliente('c1', { nombre: 'ANA' })).toBe(false)
    expect(await useClienteStore.getState().actualizarCliente('c1', { nombre: '  ' })).toBe(false)
    expect(useClienteStore.getState().clientes.find(c => c.id === 'c1')?.nombre).toBe('Juan')
  })

  it('valida el email y normaliza vacío a null', async () => {
    expect(await useClienteStore.getState().actualizarCliente('c1', { email: 'mal' })).toBe(false)
    expect(await useClienteStore.getState().actualizarCliente('c1', { email: '   ' })).toBe(true)
    expect(useClienteStore.getState().clientes.find(c => c.id === 'c1')?.email).toBeNull()
  })

  it('no modifica el objeto de datos recibido por parámetro', async () => {
    const datos = { nombre: '  Pedro  ' }
    await useClienteStore.getState().actualizarCliente('c1', datos)
    expect(datos.nombre).toBe('  Pedro  ')
  })
})

describe('clienteStore.eliminarCliente', () => {
  it('da de baja un cliente sin saldo', async () => {
    useClienteStore.setState({ clientes: [cli({ saldo_deudor: 0 })] })

    expect(await useClienteStore.getState().eliminarCliente('c1')).toBe(true)

    expect(useClienteStore.getState().clientes).toHaveLength(0)
    expect(llamadasA('clientes', 'update')[0].payload).toEqual({ activo: false })
  })

  it('bloquea la baja con deuda pendiente', async () => {
    useClienteStore.setState({ clientes: [cli({ saldo_deudor: 150 })] })
    expect(await useClienteStore.getState().eliminarCliente('c1')).toBe(false)
    expect(useClienteStore.getState().clientes).toHaveLength(1)
  })

  it('bloquea la baja con saldo a favor pendiente', async () => {
    useClienteStore.setState({ clientes: [cli({ saldo_deudor: -50 })] })
    expect(await useClienteStore.getState().eliminarCliente('c1')).toBe(false)
  })

  it('bloquea la baja si otro puesto registró deuda en Supabase', async () => {
    useClienteStore.setState({ clientes: [cli({ saldo_deudor: 0 })] })
    responder('clientes.select', { data: { saldo_deudor: 300 }, error: null })

    expect(await useClienteStore.getState().eliminarCliente('c1')).toBe(false)
    expect(useClienteStore.getState().clientes).toHaveLength(1)
    expect(llamadasA('clientes', 'update')).toHaveLength(0)
  })
})

describe('clienteStore.imputarCargoVenta', () => {
  beforeEach(() => {
    useClienteStore.setState({ clientes: [cli({ saldo_deudor: 100 })] })
  })

  it('suma el cargo al saldo y registra el movimiento local y remoto', async () => {
    expect(await useClienteStore.getState().imputarCargoVenta('c1', 'venta-1', 250)).toBe(true)

    expect(saldoEnStore('c1')).toBe(350)
    const [mov] = movsLocales('c1')
    expect(mov).toMatchObject({ tipo: 'CARGO_VENTA', monto: 250, saldo_resultante: 350, venta_id: 'venta-1' })
    expect(llamadasA('movimientos_cuenta_corriente', 'insert')).toHaveLength(1)
    expect(llamadasA('clientes', 'update')[0].payload).toEqual({ saldo_deudor: 350 })
  })

  it('usa el saldo fresco de la base y no el que tiene en memoria (concurrencia multi-puesto)', async () => {
    responder('clientes.select', { data: { saldo_deudor: 1000 }, error: null })

    await useClienteStore.getState().imputarCargoVenta('c1', 'venta-1', 50)

    expect(saldoEnStore('c1')).toBe(1050)
  })

  it('evita errores de punto flotante en el saldo', async () => {
    useClienteStore.setState({ clientes: [cli({ saldo_deudor: 0.1 })] })

    await useClienteStore.getState().imputarCargoVenta('c1', 'v', 0.2)

    expect(saldoEnStore('c1')).toBe(0.3)
  })

  it('falla si el cliente no existe', async () => {
    expect(await useClienteStore.getState().imputarCargoVenta('nope', 'v', 10)).toBe(false)
  })

  it('REGRESIÓN: rechaza montos no positivos o no finitos sin alterar el saldo', async () => {
    for (const monto of [0, -50, NaN, Infinity]) {
      expect(await useClienteStore.getState().imputarCargoVenta('c1', 'v', monto)).toBe(false)
    }
    expect(saldoEnStore('c1')).toBe(100)
    expect(movsLocales('c1')).toHaveLength(0)
  })

  it('mantiene el cargo local aunque Supabase no esté disponible', async () => {
    db.lanzar.add('clientes')

    expect(await useClienteStore.getState().imputarCargoVenta('c1', 'v', 40)).toBe(true)
    expect(saldoEnStore('c1')).toBe(140)
  })
})

describe('clienteStore.revertirCargoVenta', () => {
  beforeEach(() => {
    useClienteStore.setState({ clientes: [cli({ saldo_deudor: 500 })] })
  })

  it('resta el monto del saldo con el cliente explícito y registra el movimiento', async () => {
    expect(await useClienteStore.getState().revertirCargoVenta('venta-1', 200, undefined, 'c1')).toBe(true)

    expect(saldoEnStore('c1')).toBe(300)
    expect(movsLocales('c1')[0]).toMatchObject({ tipo: 'ABONO_PAGO', monto: 200, saldo_resultante: 300 })
  })

  it('ubica al cliente por el movimiento remoto de la venta', async () => {
    encolar('movimientos_cuenta_corriente.select', { data: [{ cliente_id: 'c1' }], error: null })

    expect(await useClienteStore.getState().revertirCargoVenta('venta-1', 100)).toBe(true)
    expect(saldoEnStore('c1')).toBe(400)
  })

  it('ubica al cliente por el movimiento local cuando no hay datos remotos', async () => {
    localStorage.setItem(
      'kioskopos_cc_movimientos_c1',
      JSON.stringify([{ id: 'm', cliente_id: 'c1', venta_id: 'venta-9', tipo: 'CARGO_VENTA', monto: 100 }])
    )

    expect(await useClienteStore.getState().revertirCargoVenta('venta-9', 100)).toBe(true)
    expect(saldoEnStore('c1')).toBe(400)
  })

  it('devuelve false si no encuentra cliente asociado a la venta', async () => {
    expect(await useClienteStore.getState().revertirCargoVenta('venta-x', 100)).toBe(false)
    expect(saldoEnStore('c1')).toBe(500)
  })

  it('REGRESIÓN: rechaza montos no positivos o no finitos sin alterar el saldo', async () => {
    for (const monto of [0, -10, NaN]) {
      expect(await useClienteStore.getState().revertirCargoVenta('v', monto, undefined, 'c1')).toBe(false)
    }
    expect(saldoEnStore('c1')).toBe(500)
  })
})

describe('clienteStore.registrarAbono', () => {
  beforeEach(() => {
    useClienteStore.setState({ clientes: [cli({ saldo_deudor: 1000 })] })
  })

  it('descuenta el abono y registra el movimiento', async () => {
    expect(await useClienteStore.getState().registrarAbono('c1', 400, 'TRANSFERENCIA')).toBe(true)

    expect(saldoEnStore('c1')).toBe(600)
    expect(movsLocales('c1')[0]).toMatchObject({ tipo: 'ABONO_PAGO', monto: 400, medio_pago: 'TRANSFERENCIA', saldo_resultante: 600 })
  })

  it('rechaza importes inválidos y clientes inexistentes', async () => {
    expect(await useClienteStore.getState().registrarAbono('c1', 0, 'EFECTIVO')).toBe(false)
    expect(await useClienteStore.getState().registrarAbono('c1', -5, 'EFECTIVO')).toBe(false)
    expect(await useClienteStore.getState().registrarAbono('c1', NaN, 'EFECTIVO')).toBe(false)
    expect(await useClienteStore.getState().registrarAbono('nope', 10, 'EFECTIVO')).toBe(false)
    expect(saldoEnStore('c1')).toBe(1000)
  })

  it('un abono en efectivo se asienta como ingreso en la caja abierta', async () => {
    const registrar = vi.fn().mockResolvedValue(true)
    useCajaStore.setState({ sesionActiva: { id: 's1', estado: 'ABIERTA' } as never, registrarMovimientoCaja: registrar })

    await useClienteStore.getState().registrarAbono('c1', 300, 'EFECTIVO')

    expect(registrar).toHaveBeenCalledTimes(1)
    expect(registrar).toHaveBeenCalledWith('INGRESO', 'COBRO_CUENTA_CORRIENTE', 300, expect.stringContaining('Juan Pérez'))
  })

  it('no impacta en caja si el medio no es efectivo o se pide explícitamente no impactar', async () => {
    const registrar = vi.fn().mockResolvedValue(true)
    useCajaStore.setState({ sesionActiva: { id: 's1', estado: 'ABIERTA' } as never, registrarMovimientoCaja: registrar })

    await useClienteStore.getState().registrarAbono('c1', 100, 'MERCADOPAGO')
    await useClienteStore.getState().registrarAbono('c1', 100, 'EFECTIVO', undefined, false)

    expect(registrar).not.toHaveBeenCalled()
  })

  it('con caja cerrada avisa pero el abono igual se registra en la cuenta', async () => {
    const registrar = vi.fn()
    useCajaStore.setState({ sesionActiva: null, registrarMovimientoCaja: registrar })

    expect(await useClienteStore.getState().registrarAbono('c1', 100, 'EFECTIVO')).toBe(true)

    expect(registrar).not.toHaveBeenCalled()
    expect(saldoEnStore('c1')).toBe(900)
  })

  it('un abono mayor a la deuda deja saldo a favor y lo informa', async () => {
    await useClienteStore.getState().registrarAbono('c1', 1500, 'TRANSFERENCIA')

    expect(saldoEnStore('c1')).toBe(-500)
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('saldo a favor'), expect.anything())
  })

  it('usa el saldo fresco de la base', async () => {
    responder('clientes.select', { data: { saldo_deudor: 2000 }, error: null })

    await useClienteStore.getState().registrarAbono('c1', 500, 'TRANSFERENCIA')

    expect(saldoEnStore('c1')).toBe(1500)
  })

  it('si falla el asiento en caja el abono sigue registrado', async () => {
    useCajaStore.setState({
      sesionActiva: { id: 's1' } as never,
      registrarMovimientoCaja: vi.fn().mockRejectedValue(new Error('boom')),
    })

    expect(await useClienteStore.getState().registrarAbono('c1', 100, 'EFECTIVO')).toBe(true)
    expect(saldoEnStore('c1')).toBe(900)
  })
})

describe('clienteStore.cargarMovimientosCliente', () => {
  it('devuelve los movimientos remotos y los cachea', async () => {
    responder('movimientos_cuenta_corriente.select', { data: [{ id: 'm1' }, { id: 'm2' }], error: null })

    const res = await useClienteStore.getState().cargarMovimientosCliente('c1')

    expect(res).toHaveLength(2)
    expect(movsLocales('c1')).toHaveLength(2)
  })

  it('cae a la copia local ante error o caída de Supabase', async () => {
    localStorage.setItem('kioskopos_cc_movimientos_c1', JSON.stringify([{ id: 'local' }]))

    responder('movimientos_cuenta_corriente.select', { data: null, error: { message: 'x' } })
    expect((await useClienteStore.getState().cargarMovimientosCliente('c1'))[0].id).toBe('local')

    db.lanzar.add('movimientos_cuenta_corriente')
    expect((await useClienteStore.getState().cargarMovimientosCliente('c1'))[0].id).toBe('local')
  })
})
