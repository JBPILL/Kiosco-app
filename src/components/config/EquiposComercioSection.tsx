import { Input } from '../ui/Input'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import { completarEquiposVacios, datosEquipoUSB, detectarEquiposAutorizados, leerSeleccionEquiposUSB } from '../../lib/equiposDetectados'
import type { EquiposDetectados, NavegadorEquipos } from '../../lib/equiposDetectados'
import { leerPuertoImpresoraConfigurado } from '../../lib/escposPrinter'
import type { EquiposComercio } from '../../types/database'

export function normalizarEquiposComercio(value: unknown): EquiposComercio {
  const datos = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const texto = (key: string, limite = 150): string =>
    typeof datos[key] === 'string' ? datos[key].trim().slice(0, limite) : ''
  return {
    impresoraTipo: texto('impresoraTipo'), impresoraModelo: texto('impresoraModelo'),
    impresoraConexion: texto('impresoraConexion'), lectorTipo: texto('lectorTipo'),
    lectorModelo: texto('lectorModelo'), lectorConexion: texto('lectorConexion'),
    pointModelo: texto('pointModelo'), pointTerminalId: texto('pointTerminalId'),
    observaciones: texto('observaciones', 500),
  }
}

interface Props {
  value: EquiposComercio
  onChange: (value: EquiposComercio) => void
}

const grupos: Array<{ titulo: string; campos: Array<{ key: keyof EquiposComercio; label: string; ejemplo: string }> }> = [
  { titulo: 'Impresora térmica', campos: [
    { key: 'impresoraTipo', label: 'Tipo / protocolo de impresora', ejemplo: 'Ej: ESC/POS, térmica de 80 mm' },
    { key: 'impresoraModelo', label: 'Marca y modelo de impresora', ejemplo: 'Tal como figura en la etiqueta' },
    { key: 'impresoraConexion', label: 'Conexión de impresora', ejemplo: 'Ej: USB, serial, Ethernet o Bluetooth' },
  ] },
  { titulo: 'Lector de códigos de barras', campos: [
    { key: 'lectorTipo', label: 'Tipo de lector', ejemplo: 'Ej: láser 1D o lector 2D' },
    { key: 'lectorModelo', label: 'Marca y modelo de lector', ejemplo: 'Tal como figura en la etiqueta' },
    { key: 'lectorConexion', label: 'Conexión / modo de lector', ejemplo: 'Ej: USB HID (teclado), serial o Bluetooth' },
  ] },
  { titulo: 'Terminal Mercado Pago Point', campos: [
    { key: 'pointModelo', label: 'Modelo de Terminal Point', ejemplo: 'Podés completarlo al instalar en el local' },
    { key: 'pointTerminalId', label: 'Identificador de terminal Point (opcional)', ejemplo: 'ID de la terminal; no ingreses tokens ni claves' },
  ] },
]

export function EquiposComercioSection({ value, onChange }: Props) {
  const actual = useRef({ value, onChange })
  useEffect(() => { actual.current = { value, onChange } }, [value, onChange])
  const activo = useRef(false)
  const revision = useRef(0)
  const [detectados, setDetectados] = useState<EquiposDetectados>({ impresora: null, lector: null, ambiguos: false })
  const [mensaje, setMensaje] = useState('')
  const [identificando, setIdentificando] = useState(false)
  const nav = navigator as unknown as NavegadorEquipos
  const seleccion = useRef<Partial<Record<'impresora' | 'lector', { vendorId: number; productId: number }>>>({})
  useEffect(() => {
    const completado = completarEquiposVacios(value, { ...detectados.impresora, ...detectados.lector })
    if (JSON.stringify(completado) !== JSON.stringify(value)) onChange(completado)
  }, [value, onChange, detectados.impresora, detectados.lector])
  const actualizar = useCallback(async () => {
    const version = ++revision.current
    try {
      const resultado = await detectarEquiposAutorizados(navigator as unknown as NavegadorEquipos,
        leerPuertoImpresoraConfigurado(), seleccion.current)
      if (!activo.current || version !== revision.current) return
      setDetectados(resultado)
      const completado = completarEquiposVacios(actual.current.value, { ...resultado.impresora, ...resultado.lector })
      if (JSON.stringify(completado) !== JSON.stringify(actual.current.value)) actual.current.onChange(completado)
      setMensaje(resultado.ambiguos ? 'Hay varios dispositivos del mismo tipo. Elegí cuál corresponde a cada equipo.' : '')
    } catch {
      if (activo.current && version === revision.current) {
        setDetectados({ impresora: null, lector: null, ambiguos: false })
        setMensaje('No se pudieron consultar los dispositivos. Podés completar los datos manualmente.')
      }
    }
  }, [])
  useEffect(() => {
    activo.current = true
    seleccion.current = leerSeleccionEquiposUSB()
    const fuentes = [nav.usb, nav.hid, nav.serial].filter((fuente): fuente is NonNullable<typeof fuente> => !!fuente)
    const refrescar = () => { void actualizar() }
    fuentes.forEach((fuente) => { fuente.addEventListener('connect', refrescar); fuente.addEventListener('disconnect', refrescar) })
    window.addEventListener('kioskopos-impresora-configurada', refrescar)
    void actualizar()
    return () => {
      activo.current = false
      revision.current++
      fuentes.forEach((fuente) => { fuente.removeEventListener('connect', refrescar); fuente.removeEventListener('disconnect', refrescar) })
      window.removeEventListener('kioskopos-impresora-configurada', refrescar)
    }
  }, [actualizar, nav.usb, nav.hid, nav.serial])
  const identificar = async (tipo: 'impresora' | 'lector') => {
    if (!nav.usb || identificando) return
    setIdentificando(true)
    try {
      const dispositivo = await nav.usb.requestDevice({ filters: [] })
      if (!activo.current) return
      seleccion.current = { ...seleccion.current, [tipo]: { vendorId: dispositivo.vendorId, productId: dispositivo.productId } }
      try { localStorage.setItem('kioskopos_equipos_usb_puesto_v1', JSON.stringify(seleccion.current)) } catch { /* La identificación actual sigue disponible. */ }
      actual.current.onChange(completarEquiposVacios(actual.current.value, datosEquipoUSB(dispositivo, tipo)))
      await actualizar()
    } catch (error) {
      if (activo.current) setMensaje(error instanceof Error && error.name === 'NotFoundError'
        ? 'Selección cancelada. Los datos se conservan.' : 'El navegador no permitió identificar el equipo. Podés completar los datos manualmente.')
    } finally {
      if (activo.current) setIdentificando(false)
    }
  }
  return (
    <fieldset className="pt-3 border-t border-gray-100 dark:border-gray-700/80 space-y-4">
      <legend className="text-xs font-bold text-gray-700 dark:text-gray-300">Equipos del comercio</legend>
      <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        Los dispositivos autorizados completan automáticamente los campos vacíos. Los datos que escribiste se conservan. Guardá los cambios del comercio para registrarlos.
      </p>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {grupos.map((grupo, indice) => (
          <div key={grupo.titulo} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4 space-y-4">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">{grupo.titulo}</h3>
            <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${indice === 0 && detectados.impresora || indice === 1 && detectados.lector
              ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
              : 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'}`}>
              {indice === 0 && detectados.impresora || indice === 1 && detectados.lector ? 'Detectado · prueba pendiente'
                : indice === 2 ? 'Conexión Point por verificar' : 'Sin detección en este puesto'}
            </span>
            {indice < 2 && <Button type="button" size="sm" variant="secondary" disabled={!nav.usb || identificando}
              onClick={() => identificar(indice === 0 ? 'impresora' : 'lector')}>Identificar por USB</Button>}
            {grupo.campos.map((campo) => (
              <Input key={campo.key} label={campo.label} aria-label={campo.label} placeholder={campo.ejemplo}
                maxLength={150} value={value[campo.key]}
                onChange={(event) => onChange({ ...value, [campo.key]: event.target.value })} />
            ))}
          </div>
        ))}
      </div>
      {mensaje && <p role="status" className="text-xs text-amber-700 dark:text-amber-300">{mensaje}</p>}
      <Input label="Observaciones de equipos" placeholder="Ej: modelo pendiente, versión del firmware o resultado de una prueba"
        maxLength={500} value={value.observaciones}
        onChange={(event) => onChange({ ...value, observaciones: event.target.value })} />
      <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        Si es la primera conexión, autorizá el equipo. Para imprimir, seleccioná el puerto debajo y enviá una prueba. Los lectores que funcionan como teclado pueden no exponer su modelo al navegador. Point requiere vinculación con Mercado Pago; su modelo se completa manualmente por ahora.
      </p>
    </fieldset>
  )
}
