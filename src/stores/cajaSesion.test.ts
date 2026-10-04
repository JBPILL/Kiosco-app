import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, llamadasA, resetDb, responder } from '../test/supabaseMock'

vi.mock('../lib/supabase', async () => (await import('../test/supabaseMock')).crearModuloSupabase())

import { useCajaStore } from './cajaStore'
import { useAuthStore } from './authStore'

const SESION = { id: 's1', kiosco_id: 'k1', usuario_id: 'u1', estado: 'ABIERTA', monto_inicial: 1000, fecha_apertura: '2026-10-04T08:00:00Z' }
const claveCierre = 's1'
const cierreOffline = () => localStorage.getItem(`kioskopos_cierre_offline_${claveCierre}`)

const acciones = {
  cargarResumenSesion: useCajaStore.getState().cargarResumenSesion,
  cargarMovimientosSesion: useCajaStore.getState().cargarMovimientosSesion,
  verificarSesionActiva: useCajaStore.getState().verificarSesionActiva,
}

beforeEach(() => {
  localStorage.clear()
  resetDb()
  vi.clearAllMocks()
  useAuthStore.setState({ usuario: { id: 'u1', nombre: 'Cajero', kiosco_id: 'k1' } as never, kiosco: { id: 'k1' } as never })
  useCajaStore.setState({
    ...acciones,
    sesionActiva: null,
    resumenActivo: null,
    movimientosCaja: [],
    cargando: false,
    arqueoCiegoObligatorio: true,
  })
})

describe('cajaStore.abrirCaja', () => {
  it('abre la caja y deja el resumen inicial con el efectivo esperado igual al monto inicial', async () => {
    responder('sesiones_caja.insert', { data: SESION, error: null })

    expect(await useCajaStore.getState().abrirCaja(1000)).toBe(true)

    const { sesionActiva, resumenActivo, cargando } = useCajaStore.getState()
    expect(sesionActiva?.id).toBe('s1')
    expect(resumenActivo).toMatchObject({ efectivo_esperado_en_caja: 1000, total_ventas: 0, nombre_cajero: 'Cajero' })
    expect(cargando).toBe(false)
  })

  it('no abre sin usuario identificado', async () => {
    useAuthStore.setState({ usuario: null })
    expect(await useCajaStore.getState().abrirCaja(100)).toBe(false)
    expect(llamadasA('sesiones_caja', 'insert')).toHaveLength(0)
  })

  it('no abre si ya hay una sesión abierta en memoria', async () => {
    useCajaStore.setState({ sesionActiva: SESION as never })
    expect(await useCajaStore.getState().abrirCaja(100)).toBe(false)
    expect(llamadasA('sesiones_caja', 'insert')).toHaveLength(0)
  })

  it('no abre una segunda caja si otro puesto ya tiene una abierta en la base', async () => {
    responder('sesiones_caja.select', { data: { id: 's-otra', estado: 'ABIERTA' }, error: null })
    useCajaStore.setState({ verificarSesionActiva: vi.fn().mockResolvedValue(undefined) })

    expect(await useCajaStore.getState().abrirCaja(100)).toBe(false)
    expect(llamadasA('sesiones_caja', 'insert')).toHaveLength(0)
  })

  it('devuelve false y libera el estado de carga si el insert falla', async () => {
    responder('sesiones_caja.insert', { data: null, error: { message: 'RLS' } })

    expect(await useCajaStore.getState().abrirCaja(100)).toBe(false)
    expect(useCajaStore.getState().sesionActiva).toBeNull()
    expect(useCajaStore.getState().cargando).toBe(false)
  })

  it('un monto inicial negativo se abre en 0', async () => {
    responder('sesiones_caja.insert', { data: { ...SESION, monto_inicial: 0 }, error: null })

    await useCajaStore.getState().abrirCaja(-300)

    expect((llamadasA('sesiones_caja', 'insert')[0].payload as { monto_inicial: number }).monto_inicial).toBe(0)
  })

  it('REGRESIÓN: rechaza un monto inicial no numérico sin llamar a la base', async () => {
    for (const monto of [NaN, Infinity]) {
      expect(await useCajaStore.getState().abrirCaja(monto)).toBe(false)
    }
    expect(llamadasA('sesiones_caja', 'insert')).toHaveLength(0)
  })
})

describe('cajaStore.cerrarCaja', () => {
  beforeEach(() => {
    useCajaStore.setState({
      sesionActiva: SESION as never,
      cargarResumenSesion: vi.fn().mockResolvedValue({ efectivo_esperado_en_caja: 5000 }),
    })
  })

  it('cierra la caja y calcula la diferencia contra el efectivo esperado', async () => {
    expect(await useCajaStore.getState().cerrarCaja(4800)).toBe(true)

    const [update] = llamadasA('sesiones_caja', 'update')
    expect(update.payload).toMatchObject({ estado: 'CERRADA', monto_final_declarado: 4800, monto_final_sistema: 5000, diferencia: -200 })
    expect(update.filtros).toContainEqual(['eq', ['estado', 'ABIERTA']])
    expect(useCajaStore.getState().sesionActiva).toBeNull()
    expect(cierreOffline()).toBeNull()
    expect(useCajaStore.getState().cargando).toBe(false)
  })

  it('usa el monto inicial como esperado cuando no hay resumen', async () => {
    useCajaStore.setState({ cargarResumenSesion: vi.fn().mockResolvedValue(null) })

    await useCajaStore.getState().cerrarCaja(1000)

    expect(llamadasA('sesiones_caja', 'update')[0].payload).toMatchObject({ monto_final_sistema: 1000, diferencia: 0 })
  })

  it('sin sesión abierta no cierra nada', async () => {
    useCajaStore.setState({ sesionActiva: null })
    expect(await useCajaStore.getState().cerrarCaja(100)).toBe(false)
  })

  it('ignora un segundo cierre mientras hay una operación en curso (doble clic)', async () => {
    useCajaStore.setState({ cargando: true })
    expect(await useCajaStore.getState().cerrarCaja(100)).toBe(false)
    expect(llamadasA('sesiones_caja', 'update')).toHaveLength(0)
  })

  it('guarda el cierre localmente cuando la base devuelve error y cierra la sesión en pantalla', async () => {
    responder('sesiones_caja.update', { error: { message: 'offline' } })

    expect(await useCajaStore.getState().cerrarCaja(5000)).toBe(true)

    expect(JSON.parse(cierreOffline() as string)).toMatchObject({ estado: 'CERRADA', monto_final_declarado: 5000 })
    expect(useCajaStore.getState().sesionActiva).toBeNull()
  })

  it('guarda el cierre localmente cuando la base lanza una excepción', async () => {
    db.lanzar.add('sesiones_caja.update')

    expect(await useCajaStore.getState().cerrarCaja(5000)).toBe(true)
    expect(cierreOffline()).not.toBeNull()
  })

  it('REGRESIÓN: rechaza montos declarados no numéricos o negativos', async () => {
    for (const monto of [NaN, -1, Infinity]) {
      expect(await useCajaStore.getState().cerrarCaja(monto)).toBe(false)
    }
    expect(llamadasA('sesiones_caja', 'update')).toHaveLength(0)
    expect(useCajaStore.getState().sesionActiva).not.toBeNull()
  })
})

describe('cajaStore.verificarSesionActiva', () => {
  beforeEach(() => {
    useCajaStore.setState({
      cargarMovimientosSesion: vi.fn().mockResolvedValue([]),
      cargarResumenSesion: vi.fn().mockResolvedValue(null),
    })
  })

  it('no hace nada sin kiosco o con una verificación en curso', async () => {
    useCajaStore.setState({ cargando: true })
    await useCajaStore.getState().verificarSesionActiva()
    expect(db.llamadas).toHaveLength(0)

    useCajaStore.setState({ cargando: false })
    useAuthStore.setState({ usuario: null })
    await useCajaStore.getState().verificarSesionActiva()
    expect(db.llamadas).toHaveLength(0)
  })

  it('restaura la sesión abierta encontrada en la base', async () => {
    responder('sesiones_caja.select', { data: SESION, error: null })

    await useCajaStore.getState().verificarSesionActiva()

    expect(useCajaStore.getState().sesionActiva?.id).toBe('s1')
    expect(useCajaStore.getState().cargando).toBe(false)
  })

  it('limpia el estado si no hay sesión abierta', async () => {
    useCajaStore.setState({ resumenActivo: {} as never, movimientosCaja: [{ id: 'x' }] as never })

    await useCajaStore.getState().verificarSesionActiva()

    expect(useCajaStore.getState().sesionActiva).toBeNull()
    expect(useCajaStore.getState().movimientosCaja).toEqual([])
  })

  it('sincroniza un cierre offline pendiente y lo elimina cuando la base lo confirma', async () => {
    responder('sesiones_caja.select', { data: SESION, error: null })
    responder('sesiones_caja.update', { error: null })
    localStorage.setItem(`kioskopos_cierre_offline_${claveCierre}`, JSON.stringify({ estado: 'CERRADA', diferencia: 0 }))

    await useCajaStore.getState().verificarSesionActiva()

    expect(llamadasA('sesiones_caja', 'update')).toHaveLength(1)
    expect(cierreOffline()).toBeNull()
    expect(useCajaStore.getState().sesionActiva).toBeNull()
  })

  it('REGRESIÓN: si la base rechaza el cierre pendiente, se conserva para reintentar y no se pierde el arqueo', async () => {
    responder('sesiones_caja.select', { data: SESION, error: null })
    responder('sesiones_caja.update', { error: { message: 'still offline' } })
    localStorage.setItem(`kioskopos_cierre_offline_${claveCierre}`, JSON.stringify({ estado: 'CERRADA', diferencia: -200 }))

    await useCajaStore.getState().verificarSesionActiva()

    expect(cierreOffline()).not.toBeNull()
  })
})

describe('cajaStore: arqueo ciego', () => {
  it('es obligatorio por defecto', async () => {
    expect(await useCajaStore.getState().cargarArqueoCiegoConfig()).toBe(true)
  })

  it('usa el valor local cuando la base no responde con el campo', async () => {
    localStorage.setItem('kioskopos_arqueo_ciego_k1', 'false')
    expect(await useCajaStore.getState().cargarArqueoCiegoConfig()).toBe(false)
    expect(useCajaStore.getState().arqueoCiegoObligatorio).toBe(false)
  })

  it('el valor remoto prevalece y se cachea', async () => {
    localStorage.setItem('kioskopos_arqueo_ciego_k1', 'true')
    responder('kioscos.select', { data: { arqueo_ciego_obligatorio: false }, error: null })

    expect(await useCajaStore.getState().cargarArqueoCiegoConfig()).toBe(false)
    expect(localStorage.getItem('kioskopos_arqueo_ciego_k1')).toBe('false')
  })

  it('guardar persiste local y remoto, y aun así funciona si la base cae', async () => {
    expect(await useCajaStore.getState().guardarArqueoCiegoConfig(false)).toBe(true)
    expect(llamadasA('kioscos', 'update')[0].payload).toEqual({ arqueo_ciego_obligatorio: false })

    db.lanzar.add('kioscos')
    expect(await useCajaStore.getState().guardarArqueoCiegoConfig(true)).toBe(true)
    expect(localStorage.getItem('kioskopos_arqueo_ciego_k1')).toBe('true')
  })
})
