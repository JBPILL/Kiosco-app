/**
 * Módulo de Copia de Seguridad Integral (Full Backup) para Kioscos
 * Permite descargar en 1 solo clic un archivo JSON estructurado con la totalidad
 * de datos del comercio (productos, categorías, clientes, proveedores, promociones y lotes)
 * para resguardo ante contingencias o migración.
 */

import { supabase } from './supabase'
import { descargarArchivo, sanitizarNombreArchivo } from './exportUtils'

export interface BackupData {
  version: '2.0'
  app: 'KioskoApp'
  exportDate: string
  kiosco: {
    id: string
    nombre: string
  }
  estadisticas: {
    totalProductos: number
    totalCategorias: number
    totalClientes: number
    totalProveedores: number
    totalPromociones: number
    totalLotes: number
  }
  productos: any[]
  categorias: any[]
  clientes: any[]
  proveedores: any[]
  promociones: any[]
  lotes_producto: any[]
}

/**
 * Genera y descarga un snapshot completo del kiosco en formato JSON
 */
export async function generarBackupIntegral(
  kioscoId: string,
  kioscoNombre?: string
): Promise<{ ok: boolean; mensaje: string }> {
  if (!kioscoId) {
    return { ok: false, mensaje: 'ID de comercio no especificado.' }
  }

  try {
    const [
      prodsRes,
      catsRes,
      clientesRes,
      provsRes,
      promosRes,
      lotesRes,
    ] = await Promise.all([
      supabase.from('productos').select('*').eq('kiosco_id', kioscoId),
      supabase.from('categorias').select('*').eq('kiosco_id', kioscoId),
      supabase.from('clientes').select('*').eq('kiosco_id', kioscoId),
      supabase.from('proveedores').select('*').eq('kiosco_id', kioscoId),
      supabase.from('promociones').select('*').eq('kiosco_id', kioscoId),
      supabase.from('lotes_producto').select('*').eq('kiosco_id', kioscoId),
    ])

    const productos = prodsRes.data || []
    const categorias = catsRes.data || []
    const clientes = clientesRes.data || []
    const proveedores = provsRes.data || []
    const promociones = promosRes.data || []
    const lotes = lotesRes.data || []

    const backupPayload: BackupData = {
      version: '2.0',
      app: 'KioskoApp',
      exportDate: new Date().toISOString(),
      kiosco: {
        id: kioscoId,
        nombre: kioscoNombre || 'Kiosco',
      },
      estadisticas: {
        totalProductos: productos.length,
        totalCategorias: categorias.length,
        totalClientes: clientes.length,
        totalProveedores: proveedores.length,
        totalPromociones: promociones.length,
        totalLotes: lotes.length,
      },
      productos,
      categorias,
      clientes,
      proveedores,
      promociones,
      lotes_producto: lotes,
    }

    const jsonStr = JSON.stringify(backupPayload, null, 2)
    const fechaHora = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const nombreSanitizado = sanitizarNombreArchivo(kioscoNombre || 'kiosco')
    const fileName = `backup_integral_${nombreSanitizado}_${fechaHora}.json`

    descargarArchivo(jsonStr, fileName, 'application/json;charset=utf-8;')

    return {
      ok: true,
      mensaje: `Copia de seguridad integral descargada con éxito (${productos.length} productos, ${clientes.length} clientes, ${promociones.length} promociones).`,
    }
  } catch (error: any) {
    return {
      ok: false,
      mensaje: error?.message ? `Error al generar backup: ${error.message}` : 'Error desconocido al generar backup',
    }
  }
}
