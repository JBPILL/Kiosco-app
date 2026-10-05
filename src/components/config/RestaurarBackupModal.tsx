import { useState, useRef } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import {
  validarBackupJSON,
  restaurarBackupIntegral,
  type BackupData,
  type ModoRestauracion,
  type ProgresoRestauracion,
  type ResumenRestauracion,
} from '../../lib/backupUtils'
import { formatFecha } from '../../lib/utils'
import toast from 'react-hot-toast'
import { descifrarBackupJson, esBackupCifrado } from '../../lib/backupCrypto'

interface RestaurarBackupModalProps {
  isOpen: boolean
  onClose: () => void
  kioscoId: string
  kioscoNombre?: string
  onRestauracionExitosa: () => Promise<void>
}

export function RestaurarBackupModal({
  isOpen,
  onClose,
  kioscoId,
  kioscoNombre,
  onRestauracionExitosa,
}: RestaurarBackupModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [archivoCargado, setArchivoCargado] = useState<File | null>(null)
  const [backupData, setBackupData] = useState<BackupData | null>(null)
  const [advertencias, setAdvertencias] = useState<string[]>([])
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null)
  const [modo, setModo] = useState<ModoRestauracion>('FUSION')
  const [restaurando, setRestaurando] = useState(false)
  const [progreso, setProgreso] = useState<ProgresoRestauracion | null>(null)
  const [resumenExito, setResumenExito] = useState<ResumenRestauracion | null>(null)
  const [requiereClave, setRequiereClave] = useState(false)
  const [claveCifrado, setClaveCifrado] = useState('')
  const [descifrando, setDescifrando] = useState(false)

  const resetearEstado = () => {
    setArchivoCargado(null)
    setBackupData(null)
    setAdvertencias([])
    setErrorValidacion(null)
    setModo('FUSION')
    setRestaurando(false)
    setProgreso(null)
    setResumenExito(null)
    setRequiereClave(false)
    setClaveCifrado('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleCerrar = () => {
    if (restaurando) {
      if (!confirm('La restauración está en progreso. Si salís ahora algunos datos podrían quedar a medio sincronizar. ¿Deseás cerrar de todos modos?')) {
        return
      }
    }
    resetearEstado()
    onClose()
  }

  const validarContenido = (texto: string, file: File) => {
    const resultado = validarBackupJSON(texto, kioscoId)
    if (!resultado.valido) {
      setErrorValidacion(resultado.mensaje || 'Archivo de copia de seguridad inválido.')
      setArchivoCargado(null)
      setBackupData(null)
      setAdvertencias([])
      return
    }
    if (resultado.datos) {
      setArchivoCargado(file)
      setBackupData(resultado.datos)
      setAdvertencias(resultado.advertencias)
      setErrorValidacion(null)
      setRequiereClave(false)
      setClaveCifrado('')
      toast.success(`Archivo validado: ${resultado.datos.estadisticas.totalProductos} productos detectados.`)
    }
  }

  const procesarArchivo = (file: File) => {
    setErrorValidacion(null)
    setResumenExito(null)
    setProgreso(null)

    if (!file.name.toLowerCase().endsWith('.json')) {
      setErrorValidacion('El archivo debe tener extensión .json (Copia de seguridad oficial de KioskoApp).')
      setArchivoCargado(null)
      setBackupData(null)
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const texto = e.target?.result as string
      if (esBackupCifrado(texto)) {
        setArchivoCargado(file)
        setBackupData(null)
        setAdvertencias([])
        setRequiereClave(true)
        setErrorValidacion(null)
        return
      }
      validarContenido(texto, file)
    }
    reader.onerror = () => {
      setErrorValidacion('Error al leer el archivo desde el dispositivo.')
    }
    reader.readAsText(file)
  }

  const desbloquearBackup = async () => {
    if (!archivoCargado || !claveCifrado || descifrando) return
    setDescifrando(true)
    setErrorValidacion(null)
    try {
      const texto = await archivoCargado.text()
      const contenido = await descifrarBackupJson(texto, claveCifrado)
      validarContenido(contenido, archivoCargado)
    } catch (err) {
      setErrorValidacion(err instanceof Error ? err.message : 'No se pudo abrir el backup cifrado.')
    } finally {
      setClaveCifrado('')
      setDescifrando(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) procesarArchivo(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) procesarArchivo(file)
  }

  const handleEjecutarRestauracion = async () => {
    if (!backupData || restaurando) return

    if (modo === 'REEMPLAZO') {
      const confirma = confirm(
        '⚠️ ATENCIÓN: Se recuperarán los registros de esta copia. Los productos actuales que no figuren en ella quedarán desactivados si la recuperación previa no presenta errores.\n\nLa restauración aplica cambios por etapas y no revierte automáticamente las escrituras si algo falla.\n\n¿Querés continuar?'
      )
      if (!confirma) return
    }

    setRestaurando(true)
    setResumenExito(null)

    try {
      const resultado = await restaurarBackupIntegral(backupData, modo, kioscoId, (prog) => {
        setProgreso(prog)
      })

      if (resultado.ok && resultado.resumen) {
        setResumenExito(resultado.resumen)
        toast.success(resultado.mensaje, { duration: 5000 })
        await onRestauracionExitosa()
      } else {
        if (resultado.resumen) setResumenExito(resultado.resumen)
        toast.error(resultado.mensaje || 'Error al restaurar copia de seguridad.')
      }
    } catch (err: any) {
      toast.error('Error crítico durante la restauración: ' + (err?.message || ''))
    } finally {
      setRestaurando(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCerrar}
      title="Restaurar Copia de Seguridad Integral (.JSON)"
      size="xl"
      footer={
        <div className="flex flex-col sm:flex-row gap-2.5 w-full">
          <Button
            type="button"
            variant="secondary"
            disabled={restaurando}
            onClick={handleCerrar}
            className="order-2 sm:order-1 sm:w-1/3 py-2.5 text-sm font-semibold"
          >
            {resumenExito ? 'Cerrar' : 'Cancelar'}
          </Button>

          {!resumenExito ? (
            <Button
              type="button"
              variant="primary"
              disabled={!backupData || restaurando}
              loading={restaurando}
              onClick={handleEjecutarRestauracion}
              className="order-1 sm:order-2 sm:w-2/3 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
            >
              {restaurando
                ? 'Restaurando Base de Datos...'
                : modo === 'FUSION'
                ? 'Iniciar Fusión Inteligente'
                : 'Iniciar Reemplazo Total'}
            </Button>
          ) : (
            <Button
              type="button"
              variant="teal"
              onClick={handleCerrar}
              className="order-1 sm:order-2 sm:w-2/3 py-2.5 text-sm font-bold"
            >
              Completado con Éxito
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Banner de Ayuda Rápida / Guía Didáctica */}
        <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl flex items-center gap-3 text-xs text-indigo-950 dark:text-indigo-200">
          <span className="font-bold uppercase text-[10px] tracking-wider px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900 border border-indigo-300 dark:border-indigo-700 shrink-0">
            Guía
          </span>
          <p className="leading-relaxed font-medium">
            Recuperá los datos operativos incluidos en la copia (productos, costos, precios, categorías, clientes,
            proveedores, promociones y vencimientos). Las copias actuales no incluyen ventas ni movimientos de caja.
          </p>
        </div>

        {/* Bloque 1: Carga y Validación del Archivo */}
        <div className="space-y-3 bg-gray-50/60 dark:bg-gray-800/40 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              1. Archivo de Copia de Seguridad (.JSON)
            </p>
            {archivoCargado && (
              <button
                type="button"
                onClick={resetearEstado}
                disabled={restaurando}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Cambiar archivo
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            disabled={restaurando}
            className="hidden"
          />

          {!archivoCargado ? (
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 sm:p-8 text-center bg-white dark:bg-gray-800/60 hover:border-indigo-500 dark:hover:border-indigo-400 transition-colors cursor-pointer group"
            >
              <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-3 group-hover:scale-105 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <p className="text-xs sm:text-sm font-bold text-gray-900 dark:text-gray-100">
                Hacé clic para seleccionar o arrastrá tu archivo de backup aquí
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                Archivos con formato <strong className="font-mono">backup_integral_*.json</strong>
              </p>
            </div>
          ) : (
            <div className="p-3.5 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl">📄</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">
                      {archivoCargado.name}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {(archivoCargado.size / 1024).toFixed(1)} KB · Fecha de exportación:{' '}
                      {backupData ? formatFecha(backupData.exportDate) : 'Reciente'}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                  Formato Verificado
                </span>
              </div>

              {/* Advertencias si aplica (ej: comercio ajeno o fecha vieja) */}
              {advertencias.length > 0 && (
                <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-900 dark:text-amber-200 space-y-1">
                  {advertencias.map((adv, idx) => (
                    <p key={idx} className="flex items-start gap-1.5">
                      <span className="font-bold">⚠️</span>
                      <span>{adv}</span>
                    </p>
                  ))}
                </div>
              )}

              {/* Resumen de Entidades Detectadas */}
              {archivoCargado && requiereClave && (
                <div className="mt-3 space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">Backup cifrado. Ingresá la contraseña para validarlo antes de restaurar.</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={claveCifrado}
                      onChange={(event) => setClaveCifrado(event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Enter') void desbloquearBackup() }}
                      placeholder="Contraseña del backup"
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                    />
                    <Button type="button" variant="primary" disabled={claveCifrado.length < 12 || descifrando} loading={descifrando} onClick={desbloquearBackup}>
                      Abrir backup
                    </Button>
                  </div>
                </div>
              )}

              {backupData && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-1">
                  <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-center">
                    <span className="text-[11px] text-gray-400 block font-medium">Productos</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {backupData.estadisticas.totalProductos}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-center">
                    <span className="text-[11px] text-gray-400 block font-medium">Categorías</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {backupData.estadisticas.totalCategorias}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-center">
                    <span className="text-[11px] text-gray-400 block font-medium">Clientes</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {backupData.estadisticas.totalClientes}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-center">
                    <span className="text-[11px] text-gray-400 block font-medium">Proveedores</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {backupData.estadisticas.totalProveedores}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-center">
                    <span className="text-[11px] text-gray-400 block font-medium">Promociones</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {backupData.estadisticas.totalPromociones}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-center">
                    <span className="text-[11px] text-gray-400 block font-medium">Lotes FEFO</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {backupData.estadisticas.totalLotes}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {errorValidacion && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-300 font-medium">
              ❌ {errorValidacion}
            </div>
          )}
        </div>

        {/* Bloque 2: Modo de Restauración */}
        {backupData && !resumenExito && (
          <div className="space-y-3 bg-gray-50/60 dark:bg-gray-800/40 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              2. Modo de Restauración
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Opción 1: Fusión Inteligente */}
              <div
                onClick={() => !restaurando && setModo('FUSION')}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                  modo === 'FUSION'
                    ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 shadow-xs'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                    Fusión Inteligente (Recomendado)
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                    Seguro
                  </span>
                </div>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                  Actualiza precios y stock de productos existentes y agrega los artículos nuevos.
                  <strong> No borra ni desactiva</strong> los productos que hayas cargado después de este backup.
                </p>
              </div>

              {/* Opción 2: Reemplazo Total */}
              <div
                onClick={() => !restaurando && setModo('REEMPLAZO')}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                  modo === 'REEMPLAZO'
                    ? 'border-amber-600 bg-amber-50/60 dark:bg-amber-950/40 shadow-xs'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-amber-950 dark:text-amber-200">
                    Reemplazo Total (Rollback)
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300">
                    Desastre / Mudanza
                  </span>
                </div>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                  Recupera los registros incluidos en la copia y desactiva los artículos ausentes si la recuperación previa no presenta errores.
                  Las ventas y los movimientos de caja quedan fuera de este respaldo.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Bloque 3: Estado y Progreso en Vivo */}
        {restaurando && progreso && (
          <div className="p-4 bg-indigo-50/80 dark:bg-indigo-950/50 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                {progreso.etapaNombre}
              </span>
              <span className="font-mono text-indigo-700 dark:text-indigo-300">{progreso.porcentaje}%</span>
            </div>

            {/* Barra de progreso */}
            <div className="w-full h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progreso.porcentaje}%` }}
              />
            </div>

            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{progreso.detalle}</p>
          </div>
        )}

        {/* Bloque 4: Informe de Resultados al Completar */}
        {resumenExito && (
          <div className={`p-4 border-2 rounded-xl space-y-3 ${resumenExito.errores.length
            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800'
            : 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'}`}>
            <div className="flex items-center gap-2">
              <span className="text-lg">{resumenExito.errores.length ? '⚠️' : '✓'}</span>
              <div>
                <h4 className="text-xs font-bold text-emerald-950 dark:text-emerald-200">
                  {resumenExito.errores.length ? 'Restauración incompleta' : 'Copia de seguridad restaurada con éxito'}
                </h4>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                  {resumenExito.errores.length
                    ? 'Los cambios ya aplicados se conservaron. Revisá los errores antes de volver a cargar la copia.'
                    : `Se recuperaron los registros incluidos en la copia para ${kioscoNombre || 'Kiosco'}.`}
                </p>
              </div>
            </div>

            {resumenExito.errores.length > 0 && (
              <div role="alert" className="max-h-48 overflow-auto text-xs text-amber-900 dark:text-amber-200">
                <p className="font-semibold">Registros pendientes ({resumenExito.errores.length})</p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {resumenExito.errores.map((error, index) => <li key={index}>{error}</li>)}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2 bg-white dark:bg-gray-900 rounded-lg border border-emerald-200 dark:border-emerald-800 text-center">
                <span className="text-[10px] text-gray-400 block">Prods. Creados</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-300 text-sm">
                  +{resumenExito.productosCreados}
                </span>
              </div>
              <div className="p-2 bg-white dark:bg-gray-900 rounded-lg border border-emerald-200 dark:border-emerald-800 text-center">
                <span className="text-[10px] text-gray-400 block">Prods. Actualizados</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400 text-sm">
                  {resumenExito.productosActualizados}
                </span>
              </div>
              <div className="p-2 bg-white dark:bg-gray-900 rounded-lg border border-emerald-200 dark:border-emerald-800 text-center">
                <span className="text-[10px] text-gray-400 block">Categorías</span>
                <span className="font-bold text-gray-800 dark:text-gray-200 text-sm">
                  {resumenExito.categoriasCreadas + resumenExito.categoriasReutilizadas}
                </span>
              </div>
              <div className="p-2 bg-white dark:bg-gray-900 rounded-lg border border-emerald-200 dark:border-emerald-800 text-center">
                <span className="text-[10px] text-gray-400 block">Clientes / Provs</span>
                <span className="font-bold text-gray-800 dark:text-gray-200 text-sm">
                  {resumenExito.clientesCreados + resumenExito.proveedoresCreados}
                </span>
              </div>
            </div>

            {resumenExito.productosDesactivados > 0 && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                ⚠️ Se desactivaron {resumenExito.productosDesactivados} productos que no estaban en la copia de seguridad.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
