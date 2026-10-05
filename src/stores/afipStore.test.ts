import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import type { ConfiguracionAFIP } from '../types/afip'
import { db, encolar, invocacionesA, llamadasA, resetDb, responder, responderFuncion } from '../test/supabaseMock'

vi.mock('../lib/supabase', async () => (await import('../test/supabaseMock')).crearModuloSupabase())

import { useAFIPStore } from './afipStore'
import { useAuthStore } from './authStore'

const KIOSCO = 'k1'
const CUIT_VALIDO = '20123456786'
const claveLocal = `kioskopos_afip_config_${KIOSCO}`

function config(overrides: Partial<ConfiguracionAFIP> = {}): ConfiguracionAFIP {
  return {
    habilitado: true,
    cuit: CUIT_VALIDO,
    razon_social: 'Kiosco Test',
    condicion_iva: 'MONOTRIBUTO',
    punto_venta: 2,
    iibb: '',
    inicio_actividades: '',
    entorno: 'HOMOLOGACION',
    certificado_crt: null,
    clave_privada_key: null,
    facturar_automatico: false,
    monto_minimo_auto: 0,
    ultimo_nro_comprobante: 0,
    ...overrides,
  }
}

function configLocal(): ConfiguracionAFIP | null {
  const raw = localStorage.getItem(claveLocal)
  return raw ? JSON.parse(raw) : null
}

function loguear(rol: string, extra: Record<string, unknown> = {}) {
  useAuthStore.setState({
    usuario: { id: 'u1', nombre: 'Dueño', kiosco_id: KIOSCO, rol, ...extra } as never,
    kiosco: { id: KIOSCO, nombre: 'Mi Kiosco' } as never,
  })
}

beforeEach(() => {
  localStorage.clear()
  resetDb()
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 4, 12, 0, 0))
  loguear('DUEÑO')
  useAFIPStore.setState({ config: null, cargando: false, guardando: false, facturando: false })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('afipStore.cargarConfiguracion', () => {
  it('devuelve null sin kiosco identificado', async () => {
    useAuthStore.setState({ usuario: null, kiosco: null })
    expect(await useAFIPStore.getState().cargarConfiguracion()).toBeNull()
  })

  it('crea una configuración inicial deshabilitada cuando no hay datos', async () => {
    const cfg = await useAFIPStore.getState().cargarConfiguracion()

    expect(cfg).toMatchObject({ habilitado: false, cuit: '', condicion_iva: 'MONOTRIBUTO', entorno: 'HOMOLOGACION', razon_social: 'Mi Kiosco' })
    expect(configLocal()?.habilitado).toBe(false)
    expect(useAFIPStore.getState().cargando).toBe(false)
  })

  it('combina datos del kiosco en Supabase con los ajustes que solo existen en local', async () => {
    localStorage.setItem(claveLocal, JSON.stringify(config({ entorno: 'PRODUCCION', ultimo_nro_comprobante: 41, facturar_automatico: true })))
    responder('kioscos.select', {
      data: { afip_habilitado: true, cuit: CUIT_VALIDO, nombre: 'Kiosco Remoto', condicion_iva: 'RESPONSABLE_INSCRIPTO', afip_punto_venta: 5 },
      error: null,
    })

    const cfg = await useAFIPStore.getState().cargarConfiguracion()

    expect(cfg).toMatchObject({
      habilitado: true,
      razon_social: 'Kiosco Remoto',
      condicion_iva: 'RESPONSABLE_INSCRIPTO',
      punto_venta: 5,
      entorno: 'PRODUCCION',
      ultimo_nro_comprobante: 41,
      facturar_automatico: true,
    })
  })

  it('usa la copia local si Supabase no está disponible', async () => {
    localStorage.setItem(claveLocal, JSON.stringify(config({ punto_venta: 9 })))
    db.lanzar.add('kioscos')

    const cfg = await useAFIPStore.getState().cargarConfiguracion()

    expect(cfg?.punto_venta).toBe(9)
  })
})

describe('afipStore.guardarConfiguracion', () => {
  it('solo el Dueño o un superadmin pueden modificar la configuración fiscal', async () => {
    loguear('CAJERO')
    useAFIPStore.setState({ config: config({ habilitado: false }) })

    expect(await useAFIPStore.getState().guardarConfiguracion({ habilitado: true })).toBe(false)
    expect(configLocal()).toBeNull()
    expect(llamadasA('kioscos', 'update')).toHaveLength(0)

    loguear('ENCARGADO', { es_superadmin: true })
    expect(await useAFIPStore.getState().guardarConfiguracion({ habilitado: true })).toBe(true)
  })

  it('rechaza un CUIT inválido al habilitar', async () => {
    useAFIPStore.setState({ config: config({ habilitado: false }) })

    expect(await useAFIPStore.getState().guardarConfiguracion({ habilitado: true, cuit: '20123456789' })).toBe(false)
    expect(toast.error).toHaveBeenCalled()
    expect(useAFIPStore.getState().config?.habilitado).toBe(false)
    expect(useAFIPStore.getState().guardando).toBe(false)
  })

  it('REGRESIÓN: no permite habilitar la facturación sin CUIT', async () => {
    useAFIPStore.setState({ config: config({ habilitado: false, cuit: '' }) })

    expect(await useAFIPStore.getState().guardarConfiguracion({ habilitado: true })).toBe(false)
    expect(useAFIPStore.getState().config?.habilitado).toBe(false)
  })

  it('permite guardar sin CUIT si la facturación queda deshabilitada', async () => {
    useAFIPStore.setState({ config: config({ habilitado: false, cuit: '' }) })
    expect(await useAFIPStore.getState().guardarConfiguracion({ razon_social: 'Nuevo' })).toBe(true)
  })

  it('persiste local y remotamente con CUIT válido', async () => {
    useAFIPStore.setState({ config: config({ habilitado: false }) })

    const ok = await useAFIPStore.getState().guardarConfiguracion({ habilitado: true, cuit: '20-12345678-6', punto_venta: 3 })

    expect(ok).toBe(true)
    expect(configLocal()).toMatchObject({ habilitado: true, punto_venta: 3 })
    expect(llamadasA('kioscos', 'update')[0].payload).toMatchObject({ afip_habilitado: true, afip_punto_venta: 3 })
    expect(useAFIPStore.getState().guardando).toBe(false)
  })

  it('persiste entorno, certificado y clave privada en kioscos de Supabase', async () => {
    useAFIPStore.setState({ config: config() })

    const ok = await useAFIPStore.getState().guardarConfiguracion({
      entorno: 'PRODUCCION',
      certificado_crt: '-----BEGIN CERTIFICATE-----\nMIIB...',
      clave_privada_key: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...',
    })

    expect(ok).toBe(true)
    const [update] = llamadasA('kioscos', 'update')
    expect(update.payload).toMatchObject({
      afip_entorno: 'PRODUCCION',
      afip_certificado_crt: '-----BEGIN CERTIFICATE-----\nMIIB...',
      afip_clave_privada_key: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...',
    })
  })

  it('conserva la configuración local si Supabase falla', async () => {
    db.lanzar.add('kioscos')
    useAFIPStore.setState({ config: config({ habilitado: false }) })

    expect(await useAFIPStore.getState().guardarConfiguracion({ punto_venta: 7 })).toBe(true)
    expect(configLocal()?.punto_venta).toBe(7)
    expect(useAFIPStore.getState().guardando).toBe(false)
  })
})

describe('afipStore.emitirFacturaVenta', () => {
  it('no emite si la facturación está deshabilitada', async () => {
    useAFIPStore.setState({ config: config({ habilitado: false }) })

    expect(await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v1', total: 1000 })).toBeNull()
    expect(llamadasA('ventas', 'update')).toHaveLength(0)
  })

  it('no emite sin kiosco identificado', async () => {
    useAuthStore.setState({ usuario: null, kiosco: null })
    expect(await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v1', total: 1000 })).toBeNull()
  })

  it('Monotributo emite Factura C por defecto', async () => {
    useAFIPStore.setState({ config: config() })

    const res = await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v1', total: 1500 })

    expect(res).toMatchObject({ tipo_comprobante: 11, letra: 'C', nro_comprobante: 1, punto_venta: 2, total: 1500, es_homologacion: true })
    expect(res?.condicion_iva).toBe('Responsable Monotributo')
  })

  it('Responsable Inscripto emite Factura B por defecto y respeta tipos explícitos', async () => {
    useAFIPStore.setState({ config: config({ condicion_iva: 'RESPONSABLE_INSCRIPTO' }) })

    expect((await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v1', total: 100 }))?.letra).toBe('B')
    expect((await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v2', total: 100, tipoComprobante: 1 }))?.letra).toBe('A')
    expect((await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v3', total: 100, tipoComprobante: 13 }))?.letra).toBe('C')
  })

  it('numera correlativamente y guarda el último número en la configuración', async () => {
    useAFIPStore.setState({ config: config({ ultimo_nro_comprobante: 10 }) })

    const a = await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v1', total: 100 })
    const b = await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v2', total: 100 })

    expect([a?.nro_comprobante, b?.nro_comprobante]).toEqual([11, 12])
    expect(configLocal()?.ultimo_nro_comprobante).toBe(12)
    expect(useAFIPStore.getState().config?.ultimo_nro_comprobante).toBe(12)
  })

  it('toma como base el mayor número registrado en Supabase si supera al local', async () => {
    useAFIPStore.setState({ config: config({ ultimo_nro_comprobante: 5 }) })
    encolar('ventas.select', { data: { afip_nro_comprobante: 40 }, error: null }, { data: null, error: null })

    const res = await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v1', total: 100 })

    expect(res?.nro_comprobante).toBe(41)
  })

  it('evita colisiones cuando otra terminal tomó el mismo número en simultáneo', async () => {
    useAFIPStore.setState({ config: config({ ultimo_nro_comprobante: 5 }) })
    encolar('ventas.select', { data: null, error: null }, { data: { afip_nro_comprobante: 6 }, error: null })

    const res = await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v1', total: 100 })

    expect(res?.nro_comprobante).toBe(7)
  })

  it('numera desde el local si la consulta remota de correlativos falla', async () => {
    useAFIPStore.setState({ config: config({ ultimo_nro_comprobante: 5 }) })
    db.lanzar.add('ventas')

    const res = await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v1', total: 100 })

    expect(res?.nro_comprobante).toBe(6)
  })

  it('REGRESIÓN: el CAE tiene exactamente 14 dígitos', async () => {
    useAFIPStore.setState({ config: config() })

    const res = await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v1', total: 100 })

    expect(res?.cae).toMatch(/^\d{14}$/)
  })

  it('el CAE vence a los 10 días corridos', async () => {
    useAFIPStore.setState({ config: config() })

    const res = await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v1', total: 100 })

    expect(res?.vto_cae).toBe('2026-10-14')
  })

  it('genera la URL del QR reglamentario', async () => {
    useAFIPStore.setState({ config: config() })

    const res = await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v1', total: 100 })

    expect(res?.qr_url).toMatch(/^https:\/\/www\.(afip|arca)\.gob\.ar\/fe\/qr\/\?p=/)
  })

  it('guarda CAE y datos fiscales en la venta', async () => {
    useAFIPStore.setState({ config: config() })

    const res = await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v1', total: 100 })

    const [update] = llamadasA('ventas', 'update')
    expect(update.payload).toMatchObject({ afip_cae: res?.cae, afip_tipo_comprobante: 11, afip_nro_comprobante: 1 })
    expect(update.filtros).toContainEqual(['eq', ['id', 'v1']])
  })

  it('reintenta con las columnas base si faltan las columnas extendidas', async () => {
    useAFIPStore.setState({ config: config() })
    encolar('ventas.update', { error: { message: 'column afip_vto_cae does not exist' } })

    await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v1', total: 100 })

    const updates = llamadasA('ventas', 'update')
    expect(updates).toHaveLength(2)
    expect(updates[1].payload).not.toHaveProperty('afip_qr_url')
    expect(updates[1].payload).toHaveProperty('afip_cae')
  })

  it('emite igual si Supabase falla al guardar y libera el indicador de facturación', async () => {
    useAFIPStore.setState({ config: config() })
    db.lanzar.add('ventas')

    const res = await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v1', total: 100 })

    expect(res).not.toBeNull()
    expect(useAFIPStore.getState().facturando).toBe(false)
  })

  it('carga la configuración si todavía no estaba en memoria', async () => {
    localStorage.setItem(claveLocal, JSON.stringify(config({ ultimo_nro_comprobante: 3 })))
    db.lanzar.add('kioscos')

    const res = await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v1', total: 100 })

    expect(res?.nro_comprobante).toBe(4)
  })

  it('incluye los datos del receptor en el comprobante', async () => {
    useAFIPStore.setState({ config: config() })

    const res = await useAFIPStore.getState().emitirFacturaVenta({
      ventaId: 'v1',
      total: 100,
      tipoDocCliente: 96,
      nroDocCliente: '30111222',
      nombreCliente: 'Ana',
    })

    expect(res).toMatchObject({ tipo_doc_cliente: 96, nro_doc_cliente: '30111222', nombre_cliente: 'Ana' })
  })
})

describe('afipStore.emitirComprobantePrueba', () => {
  it('genera un comprobante de homologación sin alterar la numeración real', async () => {
    useAFIPStore.setState({ config: config({ ultimo_nro_comprobante: 8 }) })

    const res = await useAFIPStore.getState().emitirComprobantePrueba()

    expect(res).toMatchObject({ es_homologacion: true, nro_comprobante: 9, letra: 'C' })
    expect(res?.cae).toMatch(/^\d{14}$/)
    expect(useAFIPStore.getState().config?.ultimo_nro_comprobante).toBe(8)
    expect(llamadasA('ventas', 'update')).toHaveLength(0)
  })

  it('devuelve null si no hay configuración posible', async () => {
    useAuthStore.setState({ usuario: null, kiosco: null })
    expect(await useAFIPStore.getState().emitirComprobantePrueba()).toBeNull()
  })
})

describe('afipStore.emitirFacturaVenta - Edge Function y contingencia', () => {
  it('con certificados llama a la Edge Function afip-wsfe y persiste comprobante con afip_estado=OFICIAL', async () => {
    useAFIPStore.setState({
      config: config({
        entorno: 'PRODUCCION',
        certificado_crt: '-----BEGIN CERTIFICATE-----\nABC...',
        clave_privada_key: '-----BEGIN PRIVATE KEY-----\nXYZ...',
      }),
    })

    responderFuncion('afip-wsfe', {
      data: {
        success: true,
        cae: '74123456789012',
        vto_cae: '2026-10-15',
        nro_comprobante: 125,
      },
      error: null,
    })

    const res = await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v100', total: 2500 })

    expect(res).not.toBeNull()
    expect(res?.cae).toBe('74123456789012')
    expect(res?.nro_comprobante).toBe(125)
    expect(res?.es_homologacion).toBe(false)

    const inv = invocacionesA('afip-wsfe')
    expect(inv).toHaveLength(1)
    expect(inv[0].options?.body).toMatchObject({
      venta_id: 'v100',
      kiosco_id: KIOSCO,
    })

    const updates = llamadasA('ventas', 'update')
    expect(updates[0].payload).toMatchObject({
      afip_cae: '74123456789012',
      afip_nro_comprobante: 125,
      afip_estado: 'OFICIAL',
    })
  })

  it('en PRODUCCION si la Edge Function falla marca la venta como PENDIENTE sin inventar CAE', async () => {
    useAFIPStore.setState({
      config: config({
        entorno: 'PRODUCCION',
        certificado_crt: '-----BEGIN CERTIFICATE-----\nABC...',
        clave_privada_key: '-----BEGIN PRIVATE KEY-----\nXYZ...',
      }),
    })

    responderFuncion('afip-wsfe', {
      data: {
        success: false,
        error: 'WSAA error: Certificado no autorizado',
      },
      error: null,
    })

    const res = await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v101', total: 1200 })

    expect(res).toBeNull()

    const updates = llamadasA('ventas', 'update')
    expect(updates.length).toBeGreaterThanOrEqual(1)
    expect(updates[0].payload).toMatchObject({
      afip_estado: 'PENDIENTE',
      afip_observaciones: 'WSAA error: Certificado no autorizado',
    })
    expect(updates[0].payload).not.toHaveProperty('afip_cae')
  })

  it('en PRODUCCION si no hay certificados marca la venta como PENDIENTE sin inventar CAE fake', async () => {
    useAFIPStore.setState({
      config: config({
        entorno: 'PRODUCCION',
        certificado_crt: null,
        clave_privada_key: null,
      }),
    })

    const res = await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v102', total: 950 })

    expect(res).toBeNull()

    const updates = llamadasA('ventas', 'update')
    expect(updates.length).toBeGreaterThanOrEqual(1)
    expect(updates[0].payload).toMatchObject({
      afip_estado: 'PENDIENTE',
    })
    expect(updates[0].payload).not.toHaveProperty('afip_cae')
  })

  it('en HOMOLOGACION sin certificados emite mediante el simulador con afip_estado=SIMULADO', async () => {
    useAFIPStore.setState({
      config: config({
        entorno: 'HOMOLOGACION',
        certificado_crt: null,
        clave_privada_key: null,
      }),
    })

    const res = await useAFIPStore.getState().emitirFacturaVenta({ ventaId: 'v103', total: 500 })

    expect(res).not.toBeNull()
    expect(res?.cae).toMatch(/^\d{14}$/)
    expect(res?.es_homologacion).toBe(true)

    const updates = llamadasA('ventas', 'update')
    expect(updates[0].payload).toMatchObject({
      afip_cae: res?.cae,
      afip_estado: 'SIMULADO',
    })
  })
})
