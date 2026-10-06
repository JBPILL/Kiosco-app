import type { Promocion, ItemCarrito } from '../types/database.ts'
import { getFechaLocal, obtenerEtiquetaPromocion } from './utils.ts'

export interface ContextoPromociones {
  fechaLocal: string
  diaSemana: number
}

/** Fecha comercial del POS argentino, independiente del huso horario del servidor. */
export function contextoPromocionesArgentina(fecha: Date): ContextoPromociones {
  if (!Number.isFinite(fecha.getTime())) throw new Error('Fecha comercial inválida')
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(fecha)
  const obtener = (tipo: Intl.DateTimeFormatPartTypes): string => {
    const valor = partes.find((parte) => parte.type === tipo)?.value
    if (!valor) throw new Error('No se pudo calcular la fecha comercial')
    return valor
  }
  const fechaLocal = `${obtener('year')}-${obtener('month')}-${obtener('day')}`
  return { fechaLocal, diaSemana: new Date(`${fechaLocal}T12:00:00Z`).getUTCDay() }
}

function contextoLocal(): ContextoPromociones {
  const fecha = new Date()
  return { fechaLocal: getFechaLocal(fecha), diaSemana: fecha.getDay() }
}

function calcularSubtotalBaseItem(item: ItemCarrito): number {
  if (item.es_devolucion_envase) {
    return item.producto.precio_venta * item.cantidad
  }
  const base = Math.round(item.cantidad * item.producto.precio_venta)
  const extraEnvase = item.sin_envase
    ? Math.round(item.cantidad * (item.precio_envase_unitario || item.producto.precio_envase || 0))
    : 0
  return base + extraEnvase
}

export function evaluarItemPromociones(
  item: ItemCarrito,
  promosActivas: Promocion[],
  contexto: ContextoPromociones = contextoLocal()
): { descuento: number; promoNombre?: string } {
  const subtotalBase = Math.round(item.cantidad * item.producto.precio_venta)
  if (subtotalBase <= 0) return { descuento: 0 }

  const hoyStr = contexto.fechaLocal
  const diaHoy = contexto.diaSemana

  // Filtrar promociones vigentes para este producto o categoría
  const aplicables = promosActivas.filter((p) => {
    if (!p.activo) return false
    const inicioNorm = p.fecha_inicio ? p.fecha_inicio.slice(0, 10) : null
    const finNorm = p.fecha_fin ? p.fecha_fin.slice(0, 10) : null

    if (inicioNorm && hoyStr < inicioNorm) return false
    if (finNorm && hoyStr > finNorm) return false
    if (p.dias_semana && p.dias_semana.length > 0 && !p.dias_semana.includes(diaHoy)) return false

    if (p.producto_id) {
      return p.producto_id === item.producto.id
    }
    if (p.categoria_id) {
      return p.categoria_id === item.producto.categoria_id
    }
    return false
  })

  if (aplicables.length === 0) return { descuento: 0 }

  let mejorDescuento = 0
  let mejorNombre: string | undefined

  for (const promo of aplicables) {
    let descuentoCalculado = 0
    const etiqueta = obtenerEtiquetaPromocion(promo)

    if (promo.tipo === 'NXM') {
      const min = Number(promo.cantidad_minima)
      const paga = Math.max(1, Number(promo.cantidad_paga ?? 1))
      if (min > 1 && paga < min && item.cantidad >= min) {
        const packs = Math.floor(item.cantidad / min)
        const unidadesGratis = packs * (min - paga)
        descuentoCalculado = Math.round(unidadesGratis * item.producto.precio_venta)
      }
    } else if (promo.tipo === 'VOLUMEN') {
      const min = Number(promo.cantidad_minima || 2)
      if (min > 0 && item.cantidad >= min) {
        if (promo.precio_unitario_promo !== null && promo.precio_unitario_promo !== undefined && promo.precio_unitario_promo > 0) {
          const ahorroUnit = Math.max(0, item.producto.precio_venta - promo.precio_unitario_promo)
          descuentoCalculado = Math.round(item.cantidad * ahorroUnit)
        } else if (promo.descuento_porcentaje) {
          descuentoCalculado = Math.round((subtotalBase * promo.descuento_porcentaje) / 100)
        }
      }
    } else if (promo.tipo === 'PORCENTAJE') {
      const min = Number(promo.cantidad_minima || 1)
      if (item.cantidad >= min) {
        if (promo.descuento_porcentaje && promo.descuento_porcentaje > 0) {
          descuentoCalculado = Math.round((subtotalBase * promo.descuento_porcentaje) / 100)
        }
      }
    }

    if (descuentoCalculado > mejorDescuento) {
      mejorDescuento = descuentoCalculado
      mejorNombre = etiqueta
    }
  }

  return {
    descuento: Math.min(mejorDescuento, subtotalBase),
    promoNombre: mejorNombre,
  }
}

export function evaluarCarritoPromociones(
  items: ItemCarrito[],
  promociones: Promocion[],
  contexto: ContextoPromociones = contextoLocal()
): ItemCarrito[] {
  const promosActivas = promociones.filter((p) => p.activo)
  if (promosActivas.length === 0) {
    return items.map((it) => {
      const subtotalOrig = calcularSubtotalBaseItem(it)
      return {
        ...it,
        subtotal: subtotalOrig,
        descuento_promo: 0,
        promo_nombre: undefined,
      }
    })
  }

  const hoyStr = contexto.fechaLocal
  const diaHoy = contexto.diaSemana

  // 1. Inicializar items con montos originales
  const resItems: ItemCarrito[] = items.map((it) => {
    const subtotalOrig = calcularSubtotalBaseItem(it)
    return {
      ...it,
      subtotal: subtotalOrig,
      descuento_promo: 0,
      promo_nombre: undefined,
    }
  })

  // 2. Evaluar COMBOS vigentes
  const comboPromos = promosActivas.filter((p) => {
    if (p.tipo !== 'COMBO') return false
    if (!p.items_combo || p.items_combo.length === 0) return false
    if (!p.precio_combo || p.precio_combo <= 0) return false
    const inicioNorm = p.fecha_inicio ? p.fecha_inicio.slice(0, 10) : null
    const finNorm = p.fecha_fin ? p.fecha_fin.slice(0, 10) : null
    if (inicioNorm && hoyStr < inicioNorm) return false
    if (finNorm && hoyStr > finNorm) return false
    if (p.dias_semana && p.dias_semana.length > 0 && !p.dias_semana.includes(diaHoy)) return false
    return true
  })

  // BUG-55: Rastrear unidades de productos ya consumidas por combos previos para no duplicar descuentos
  const cantUsadaEnCombo: Record<string, number> = {}

  for (const promo of comboPromos) {
    const itemsReq = promo.items_combo!
    // Verificar cuántas veces se cumple el combo completo con unidades disponibles
    let veces = Infinity
    for (const ic of itemsReq) {
      const cartIt = resItems.find((it) => it.producto.id === ic.producto_id)
      if (!cartIt || ic.cantidad <= 0) {
        veces = 0
        break
      }
      const cantLibre = Math.max(0, cartIt.cantidad - (cantUsadaEnCombo[ic.producto_id] || 0))
      const disponibles = Math.floor((cantLibre + 0.0001) / ic.cantidad)
      if (disponibles < veces) {
        veces = disponibles
      }
    }

    if (veces > 0 && isFinite(veces)) {
      // Registrar cantidades consumidas para este combo
      for (const ic of itemsReq) {
        cantUsadaEnCombo[ic.producto_id] = (cantUsadaEnCombo[ic.producto_id] || 0) + ic.cantidad * veces
      }

      // Calcular precio regular de 1 combo
      let regular1Combo = 0
      for (const ic of itemsReq) {
        const cartIt = resItems.find((it) => it.producto.id === ic.producto_id)!
        regular1Combo += ic.cantidad * cartIt.producto.precio_venta
      }

      const ahorro1Combo = Math.max(0, regular1Combo - (promo.precio_combo || 0))
      if (ahorro1Combo > 0 && regular1Combo > 0 && veces > 0) {
        const ahorroTotal = Math.round(ahorro1Combo * veces)
        let ahorroRestante = ahorroTotal
        const totalRegular = regular1Combo * veces

        itemsReq.forEach((ic, idx) => {
          const cartIt = resItems.find((it) => it.producto.id === ic.producto_id)!
          const esUltimo = idx === itemsReq.length - 1
          const itemSubtotal = ic.cantidad * cartIt.producto.precio_venta * veces
          const descItem = esUltimo
            ? ahorroRestante
            : Math.min(
                ahorroRestante,
                totalRegular > 0 ? Math.round((itemSubtotal / totalRegular) * ahorroTotal) : 0
              )

          ahorroRestante -= descItem
          cartIt.descuento_promo = (cartIt.descuento_promo || 0) + descItem
          cartIt.subtotal = Math.max(0, cartIt.subtotal - descItem)
          const nombreCombo = obtenerEtiquetaPromocion(promo) || 'Combo'
          cartIt.promo_nombre = cartIt.promo_nombre
            ? `${cartIt.promo_nombre} + ${nombreCombo}`
            : (nombreCombo.toLowerCase().startsWith('combo') ? nombreCombo : `Combo: ${nombreCombo}`)
        })
      }
    }
  }

  // 3. Para productos que NO recibieron descuento de combo, evaluar promociones individuales (NxM, Volumen, Porcentaje)
  const singlePromos = promosActivas.filter((p) => p.tipo !== 'COMBO')
  for (const item of resItems) {
    if (!item.descuento_promo || item.descuento_promo === 0) {
      const subtotalOrig = calcularSubtotalBaseItem(item)
      const { descuento, promoNombre } = evaluarItemPromociones(item, singlePromos, contexto)
      if (descuento > 0) {
        item.descuento_promo = descuento
        item.promo_nombre = promoNombre
        item.subtotal = Math.max(0, subtotalOrig - descuento)
      }
    }
  }

  return resItems

}
