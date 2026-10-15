import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MovimientoCaja } from '../types/database'

type Resultado = { data?: unknown; error: { code?: string; message: string } | null }

const db = vi.hoisted(() => ({
  insertResult: { error: null } as { error: { code?: string; message: string } | null },
  insertThrows: false,
  updateError: null as { code?: string; message: string } | null,
  remoto: [] as unknown[],
  inserts: [] as Record<string, unknown>[],
  rpcs: [] as { name: string; args: Record<string, unknown> }[],
  rpcError: null as { code?: string; message: string } | null,
  tablas: [] as string[],
  sesionResumen: null as unknown,
  ventasResumen: [] as unknown[],
  vistaResumen: null as unknown,
}))

vi.mock('../lib/supabase', () => ({
  supabaseUrl: 'http://localhost',
  supabaseAnonKey: 'test',
  createUnauthenticatedClient: () => ({}),
  supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      db.rpcs.push({ name, args })
      return { data: { id: args.p_operacion_id }, error: db.rpcError }
    },
    from: (tabla: string) => {
      db.tablas.push(tabla)
      const resultado = (): Resultado => {
        if (tabla === 'movimientos_caja') return { data: db.remoto, error: null }
        if (tabla === 'sesiones_caja') return { data: db.sesionResumen, error: null }
        if (tabla === 'ventas') return { data: db.ventasResumen, error: null }
        if (tabla === 'v_resumen_caja') return { data: db.vistaResumen, error: null }
        return { data: null, error: db.updateError }
      }
      const chain: Record<string, unknown> = {}
      for (const metodo of ['select', 'eq', 'order', 'limit', 'maybeSingle']) {
        chain[metodo] = () => chain
      }
      chain.insert = async (fila: Record<string, unknown>) => {
        db.inserts.push(fila)
        if (db.insertThrows) throw new Error('network down')
        return db.insertResult
      }
      chain.update = () => chain
      chain.then = (resolve: (r: Resultado) => unknown) => resolve(resultado())
      return chain
    },
  },
}))

import { useCajaStore } from './cajaStore'
import { useAuthStore } from './authStore'

const SESION_ID = 'sesion-1'
const claveLocal = `kioskopos_movimientos_${SESION_ID}`
const clavePendientes = `kioskopos_movimientos_pendientes_${SESION_ID}`

function leerPendientes(): MovimientoCaja[] {
  return JSON.parse(localStorage.getItem(clavePendientes) ?? '[]')
}

describe('cajaStore.registrarMovimientoCaja', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'false')
    localStorage.clear()
    db.insertResult = { error: null }
    db.insertThrows = false
    db.updateError = null
    db.remoto = []
    db.inserts = []
    db.rpcs = []
    db.rpcError = null
    db.tablas = []
    db.sesionResumen = null
    db.ventasResumen = []
    db.vistaResumen = null
    useAuthStore.setState({ usuario: { id: 'u1', nombre: 'Cajero', kiosco_id: 'k1' } as never })
    useCajaStore.setState({
      sesionActiva: { id: SESION_ID, kiosco_id: 'k1', usuario_id: 'u1', estado: 'ABIERTA', fecha_cierre: null, monto_inicial: 1000 } as never,
      resumenActivo: null,
      movimientosCaja: [],
      cargando: false,
    })
  })
  afterEach(() => vi.unstubAllEnvs())

  it('registra el movimiento y no deja pendientes cuando Supabase confirma', async () => {
    const ok = await useCajaStore.getState().registrarMovimientoCaja('EGRESO', 'OTRO' as never, 500, ' Hielo ')

    expect(ok).toBe(true)
    expect(db.inserts).toHaveLength(1)
    expect(db.inserts[0]).toMatchObject({ tipo: 'EGRESO', monto: 500, descripcion: 'Hielo' })
    expect(leerPendientes()).toHaveLength(0)
  })

  it('usa RPC transaccional y no INSERT browser-side en strict scope', async () => {
    vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')

    const ok = await useCajaStore.getState().registrarMovimientoCaja('EGRESO', 'OTRO' as never, 125, 'Retiro')

    expect(ok).toBe(true)
    expect(db.rpcs).toHaveLength(1)
    expect(db.rpcs[0].name).toBe('registrar_movimiento_caja_transaccional')
    expect(db.inserts).toHaveLength(0)
    expect(leerPendientes()).toHaveLength(0)
  })

  it('conserva la caja y no encola un cierre con checkout manual pendiente en servidor', async () => {
    db.updateError = { code: 'P0001', message: 'CHECKOUT_MANUAL_PENDIENTE: conciliá los cobros' }
    expect(await useCajaStore.getState().cerrarCaja(1000)).toBe(false)
    expect(useCajaStore.getState().sesionActiva?.id).toBe(SESION_ID)
    expect(localStorage.getItem(`kioskopos_cierre_offline_${SESION_ID}`)).toBeNull()
    expect(useCajaStore.getState().cargando).toBe(false)
  })

  it('conserva la caja y no encola un cierre que Point rechaza', async () => {
    db.updateError = { code: 'P0001', message: 'POINT_COBRO_PENDIENTE: conciliá los cobros' }
    expect(await useCajaStore.getState().cerrarCaja(1000)).toBe(false)
    expect(useCajaStore.getState().sesionActiva?.id).toBe(SESION_ID)
    expect(localStorage.getItem(`kioskopos_cierre_offline_${SESION_ID}`)).toBeNull()
    expect(useCajaStore.getState().cargando).toBe(false)
  })

  it('REGRESIÓN: si el insert devuelve { error } el movimiento queda pendiente y se sigue contando', async () => {
    db.insertResult = { error: { code: '42501', message: 'RLS violation' } }

    const ok = await useCajaStore.getState().registrarMovimientoCaja('EGRESO', 'OTRO' as never, 300, 'Retiro')

    expect(ok).toBe(true)
    expect(leerPendientes()).toHaveLength(1)
    const { movimientosCaja, resumenActivo } = useCajaStore.getState()
    expect(movimientosCaja.map(m => m.monto)).toContain(300)
    expect(resumenActivo).toBeNull() // la vista no existe en el mock: el movimiento igual debe estar en la lista
  })

  it('si el insert lanza una excepción también queda pendiente', async () => {
    db.insertThrows = true

    const ok = await useCajaStore.getState().registrarMovimientoCaja('INGRESO', 'OTRO' as never, 200, 'Aporte')

    expect(ok).toBe(true)
    expect(leerPendientes()).toHaveLength(1)
  })

  it('un movimiento pendiente no desaparece cuando la base responde sin él', async () => {
    db.insertResult = { error: { message: 'timeout' } }
    await useCajaStore.getState().registrarMovimientoCaja('EGRESO', 'OTRO' as never, 750, 'Proveedor')
    const idPendiente = leerPendientes()[0].id

    // La base sigue rechazando: al recargar, el pendiente se mezcla con lo remoto
    const movimientos = await useCajaStore.getState().cargarMovimientosSesion(SESION_ID)

    expect(movimientos.some(m => m.id === idPendiente)).toBe(true)
    expect(leerPendientes()).toHaveLength(1)
  })

  it('sincroniza los pendientes y los limpia cuando vuelve la conexión', async () => {
    db.insertResult = { error: { message: 'offline' } }
    await useCajaStore.getState().registrarMovimientoCaja('EGRESO', 'OTRO' as never, 100, 'Pendiente')
    expect(leerPendientes()).toHaveLength(1)

    db.insertResult = { error: null }
    await useCajaStore.getState().cargarMovimientosSesion(SESION_ID)

    expect(leerPendientes()).toHaveLength(0)
  })

  it('un error de duplicado (23505) se considera sincronizado', async () => {
    db.insertResult = { error: { message: 'offline' } }
    await useCajaStore.getState().registrarMovimientoCaja('EGRESO', 'OTRO' as never, 100, 'Dup')

    db.insertResult = { error: { code: '23505', message: 'duplicate key' } }
    await useCajaStore.getState().cargarMovimientosSesion(SESION_ID)

    expect(leerPendientes()).toHaveLength(0)
  })

  it('rechaza montos inválidos sin tocar la base ni el almacenamiento local', async () => {
    for (const monto of [0, -5, NaN, Infinity]) {
      const ok = await useCajaStore.getState().registrarMovimientoCaja('EGRESO', 'OTRO' as never, monto, 'x')
      expect(ok).toBe(false)
    }
    expect(db.inserts).toHaveLength(0)
    expect(localStorage.getItem(claveLocal)).toBeNull()
  })

  it('rechaza si no hay sesión abierta', async () => {
    useCajaStore.setState({ sesionActiva: null })

    const ok = await useCajaStore.getState().registrarMovimientoCaja('EGRESO', 'OTRO' as never, 100, 'x')

    expect(ok).toBe(false)
    expect(db.inserts).toHaveLength(0)
  })

  it('bloquea un segundo registro mientras hay una operación en curso', async () => {
    useCajaStore.setState({ cargando: true })

    const ok = await useCajaStore.getState().registrarMovimientoCaja('EGRESO', 'OTRO' as never, 100, 'x')

    expect(ok).toBe(false)
    expect(db.inserts).toHaveLength(0)
  })
})

describe('cajaStore.cargarResumenSesion en alcance del piloto', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')
    db.tablas = []
    db.remoto = []
    db.sesionResumen = {
      id: SESION_ID, kiosco_id: 'k1', usuario_id: 'u1', fecha_apertura: '2026-10-12T10:00:00Z',
      fecha_cierre: null, monto_inicial: 1000, usuario: { nombre: 'Cajero' },
    }
    db.ventasResumen = [{ id: 'v1', total: 500, pagos: [{ medio_pago: 'EFECTIVO', monto: 500 }] }]
    db.vistaResumen = null
    useCajaStore.setState({
      sesionActiva: null,
      resumenActivo: null,
      cargarMovimientosSesion: vi.fn(async () => []),
    })
  })
  afterEach(() => vi.unstubAllEnvs())

  it('en strict scope omite la vista ausente y calcula el resumen manual', async () => {
    const resumen = await useCajaStore.getState().cargarResumenSesion(SESION_ID)

    expect(db.tablas).not.toContain('v_resumen_caja')
    expect(db.tablas).toContain('sesiones_caja')
    expect(db.tablas).toContain('ventas')
    expect(resumen).toMatchObject({ total_ventas: 1, total_facturado: 500, total_efectivo: 500, efectivo_esperado_en_caja: 1500 })
  })

  it('con flag false conserva la consulta legacy a la vista', async () => {
    vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'false')
    db.vistaResumen = {
      sesion_caja_id: SESION_ID, kiosco_id: 'k1', usuario_id: 'u1', nombre_cajero: 'Cajero',
      fecha_apertura: '2026-10-12T10:00:00Z', fecha_cierre: null, monto_inicial: 1000,
      total_ventas: 0, total_facturado: 0, total_efectivo: 0, total_mercadopago: 0,
      total_transferencia: 0, total_tarjeta: 0, total_cuenta_corriente: 0,
    }

    await useCajaStore.getState().cargarResumenSesion(SESION_ID)

    expect(db.tablas).toContain('v_resumen_caja')
  })
})
