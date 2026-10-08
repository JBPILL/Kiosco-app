import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
function rolDeclarado(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role } catch { return null }
}

export async function verificarCostosCajero(config, solicitar = fetch) {
  const origen = new URL(config.url)
  if (origen.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(origen.hostname)
    || origen.port || origen.username || origen.password || origen.pathname !== '/' || origen.search || origen.hash
    || !uuid.test(config.kioscoId) || rolDeclarado(config.jwt) !== 'authenticated'
    || !(config.key?.startsWith('sb_publishable_') || rolDeclarado(config.key) === 'anon')) {
    throw new Error('CONFIGURACION_INVALIDA')
  }
  const headers = { apikey: config.key, Authorization: `Bearer ${config.jwt}`, Prefer: 'count=exact' }
  function cantidad(respuesta) {
    const valor = respuesta.headers.get('content-range')?.match(/\/(\d+)$/)?.[1]
    if (valor === undefined) throw new Error('CONTEO_NO_CONFIRMADO')
    return Number(valor)
  }
  async function get(ruta) {
    const respuesta = await solicitar(new URL(ruta, origen), {
      method: 'GET', headers, signal: AbortSignal.timeout(15000), redirect: 'error',
    })
    let datos
    try { datos = await respuesta.json() } catch { throw new Error('RESPUESTA_INVALIDA') }
    return { respuesta, datos }
  }
  const identidad = await get('/auth/v1/user')
  if (!identidad.respuesta.ok || !uuid.test(identidad.datos?.id) || identidad.datos.role !== 'authenticated') {
    throw new Error('SESION_NO_VERIFICADA')
  }
  const perfiles = await get(`/rest/v1/usuarios?select=id,auth_user_id,kiosco_id,rol,activo&auth_user_id=eq.${identidad.datos.id}&activo=eq.true&limit=2`)
  if (!perfiles.respuesta.ok || !Array.isArray(perfiles.datos) || perfiles.datos.length !== 1
    || cantidad(perfiles.respuesta) !== 1) throw new Error('PERFIL_NO_VERIFICADO')
  const perfil = perfiles.datos[0]
  if (perfil.rol !== 'CAJERO' || perfil.activo !== true || perfil.auth_user_id !== identidad.datos.id
    || perfil.kiosco_id !== config.kioscoId || !uuid.test(perfil.id)) throw new Error('CONTEXTO_NO_CAJERO')
  const controles = []
  for (const tabla of ['producto_costos', 'movimiento_stock_costos']) {
    // Sin filtro por comercio: cualquier fila visible constituye exposición.
    const { respuesta, datos } = await get(`/rest/v1/${tabla}?select=*&limit=1`)
    if (respuesta.status === 403 && datos?.code === '42501') {
      controles.push({ tabla, resultado: 'DENEGADO' }); continue
    }
    if (!respuesta.ok || !Array.isArray(datos)) throw new Error('CONSULTA_NO_CONFIRMADA')
    if (datos.length || cantidad(respuesta) !== 0) throw new Error('COSTOS_PRIVADOS_VISIBLES')
    controles.push({ tabla, resultado: 'SIN_FILAS_VISIBLES' })
  }
  let productos = 0
  for (let pagina = 0; pagina < 100; pagina++) {
    const { respuesta, datos } = await get(`/rest/v1/productos?select=id,precio_costo&kiosco_id=eq.${config.kioscoId}&order=id&limit=1000&offset=${productos}`)
    if (!respuesta.ok || !Array.isArray(datos)) throw new Error('PRODUCTOS_NO_VERIFICADOS')
    if (datos.some(p => !uuid.test(p.id) || p.precio_costo !== 0)) throw new Error('COSTO_PUBLICO_NO_NEUTRALIZADO')
    productos += datos.length
    if (datos.length === 0) return { identidadVerificada: true, controles, productosRevisados: productos,
      alcance: 'Sólo lectura: no prueba INSERT, UPDATE, DELETE ni cierre de ventas.' }
  }
  throw new Error('REVISION_INCOMPLETA')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const resultado = await verificarCostosCajero({ url: process.env.KIOSKO_SUPABASE_URL,
      key: process.env.KIOSKO_SUPABASE_PUBLIC_KEY, jwt: process.env.KIOSKO_CAJERO_JWT, kioscoId: process.env.KIOSKO_COMERCIO_ID })
    console.log(JSON.stringify(resultado, null, 2))
  } catch {
    // No publicar cuerpo HTTP, excepciones de red, tokens ni costos.
    console.error('DIAGNOSTICO_NO_CONFIRMADO: revisar configuración, sesión y permisos sin ampliar accesos.')
    process.exitCode = 1
  }
}
