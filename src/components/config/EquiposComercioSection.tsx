import { Input } from '../ui/Input'
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
  return (
    <fieldset className="pt-3 border-t border-gray-100 dark:border-gray-700/80 space-y-4">
      <legend className="text-xs font-bold text-gray-700 dark:text-gray-300">Equipos del comercio</legend>
      <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        Registrá los equipos que usa el local para revisar su compatibilidad después. Podés dejar en blanco los datos que todavía no conocés.
      </p>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {grupos.map((grupo) => (
          <div key={grupo.titulo} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4 space-y-4">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">{grupo.titulo}</h3>
            <span className="inline-flex rounded-lg bg-amber-100 dark:bg-amber-950/40 px-2 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">Compatibilidad por verificar</span>
            {grupo.campos.map((campo) => (
              <Input key={campo.key} label={campo.label} placeholder={campo.ejemplo}
                maxLength={150} value={value[campo.key]}
                onChange={(event) => onChange({ ...value, [campo.key]: event.target.value })} />
            ))}
          </div>
        ))}
      </div>
      <Input label="Observaciones de equipos" placeholder="Ej: modelo pendiente, versión del firmware o resultado de una prueba"
        maxLength={500} value={value.observaciones}
        onChange={(event) => onChange({ ...value, observaciones: event.target.value })} />
      <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        Se guardan con los cambios del comercio. Registrar un modelo no conecta el dispositivo ni confirma su compatibilidad; la selección del puerto de impresión se realiza en este puesto.
      </p>
    </fieldset>
  )
}
