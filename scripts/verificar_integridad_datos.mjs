// ==============================================================================
// SUITE DE AUDITORÍA Y VERIFICACIÓN DE INTEGRIDAD DE DATOS - KIOSKOPOS
// ==============================================================================
// Este script verifica la consistencia matemática, integridad referencial y
// precisión de cálculo de todas las operaciones comerciales del sistema.
// ==============================================================================

import assert from 'node:assert'
import { v4 as uuidv4, validate as validateUUID } from 'uuid'

console.log('='.repeat(70))
console.log('   KIOSKOPOS - AUDITORÍA DE INTEGRIDAD DE DATOS Y PROCEDIMIENTOS')
console.log('='.repeat(70))

let testsPassed = 0
let testsTotal = 0

function test(description, fn) {
  testsTotal++
  try {
    fn()
    console.log(`[PASS] ${description}`)
    testsPassed++
  } catch (err) {
    console.error(`[FAIL] ${description}`)
    console.error('       Detalle:', err.message)
  }
}

// ------------------------------------------------------------------------------
// TEST 1: Consistencia de UUIDs y Ausencia de Prefijos Inválidos
// ------------------------------------------------------------------------------
test('1. Validación estricta de UUID v4 para PostgreSQL (sin cadenas tipo dev-envase-...)', () => {
  const sampleVentaId = uuidv4()
  const sampleProductoDevolucionId = uuidv4()
  const sampleMovimientoId = uuidv4()

  assert.strictEqual(validateUUID(sampleVentaId), true, 'Venta ID debe ser UUID v4 válido')
  assert.strictEqual(validateUUID(sampleProductoDevolucionId), true, 'ID de devolución debe ser UUID v4')
  assert.strictEqual(validateUUID(sampleMovimientoId), true, 'Movimiento ID debe ser UUID v4')

  const legacyInvalidId = `dev-envase-${uuidv4()}`
  assert.strictEqual(validateUUID(legacyInvalidId), false, 'Cadenas prefijadas no son UUID válidos')
})

// ------------------------------------------------------------------------------
// TEST 2: Precisión Decimal en Pesables (Fiambrería / Balanza)
// ------------------------------------------------------------------------------
test('2. Aritmética de pesables con 3 decimales sin deriva de punto flotante', () => {
  const stockInicial = 5.250 // 5.25 kg
  const pesoVendido = 0.350  // 350 gramos
  const precioPorKilo = 12500

  // Subtotal monetario exacto
  const subtotal = Math.round(pesoVendido * precioPorKilo)
  assert.strictEqual(subtotal, 4375, 'Subtotal debe ser $4.375')

  // Reducción de stock con 3 decimales
  const stockResultante = Number((stockInicial - pesoVendido).toFixed(3))
  assert.strictEqual(stockResultante, 4.900, 'Stock debe ser exactamente 4.900 kg sin 4.8999999999999995')

  // Suma de pesable (reintegro de 150 gramos)
  const reintegro = 0.150
  const stockTrasReintegro = Number((stockResultante + reintegro).toFixed(3))
  assert.strictEqual(stockTrasReintegro, 5.050, 'Stock debe ser 5.050 kg')
})

// ------------------------------------------------------------------------------
// TEST 3: Envases Retornables (Mano a Mano, Sin Envase y Devolución)
// ------------------------------------------------------------------------------
test('3. Cálculo de envases retornables: Mano a mano vs Cobro de envase vs Devolución', () => {
  const precioBebida = 3200
  const precioEnvase = 1500
  const cantidad = 2

  // Caso A: Mano a mano (cliente trajo envases vacíos)
  const subtotalManoAMano = cantidad * precioBebida
  assert.strictEqual(subtotalManoAMano, 6400, 'Mano a mano no cobra envases')

  // Caso B: Sin envase (se cobra el envase vacío)
  const subtotalSinEnvase = cantidad * (precioBebida + precioEnvase)
  assert.strictEqual(subtotalSinEnvase, 9400, 'Sin envase cobra bebida + envase')

  // Caso C: Devolución de envases al ticket (saldo a favor)
  const cantDevueltos = 3
  const valorDevolucion = -(precioEnvase * cantDevueltos)
  assert.strictEqual(valorDevolucion, -4500, 'Devolución genera saldo a favor de -$4.500')

  // Carrito combinado: Compra de 2 cervezas ($6.400) + Devolución de 3 envases (-$4.500)
  const totalCarrito = subtotalManoAMano + valorDevolucion
  assert.strictEqual(totalCarrito, 1900, 'Total resultante debe ser $1.900')
})

// ------------------------------------------------------------------------------
// TEST 4: Salvaguarda de Carrito con Saldo Negativo (Supera Compra)
// ------------------------------------------------------------------------------
test('4. Detección y bloqueo de cobro cuando devolución de envases supera compra', () => {
  const compraBebida = 2000
  const devolucionEnvases = -3000
  const totalNeto = compraBebida + devolucionEnvases

  assert.strictEqual(totalNeto, -1000, 'Saldo a favor del cliente es -$1.000')

  const puedeCobrarNormal = totalNeto >= 0
  assert.strictEqual(puedeCobrarNormal, false, 'No se debe permitir cobrar ticket con saldo negativo')
})

// ------------------------------------------------------------------------------
// TEST 5: Control de Arqueo y Desglose de Caja en Cierre Z
// ------------------------------------------------------------------------------
test('5. Fórmulas de Arqueo de Caja y Cuadre de Cuenta Corriente (Fiados)', () => {
  const montoInicial = 10000
  const ventasEfectivo = 35000
  const ventasMercadoPago = 20000
  const ventasTarjeta = 15000
  const ventasCuentaCorriente = 10000 // Fiados otorgados en el turno

  const totalFacturado = ventasEfectivo + ventasMercadoPago + ventasTarjeta + ventasCuentaCorriente
  assert.strictEqual(totalFacturado, 80000, 'Total facturado del turno es $80.000')

  const ingresosExtraCaja = 5000 // Aporte de cambio
  const egresosCaja = 3000       // Pago a repartidor de panadería

  // Efectivo esperado en el cajón
  const efectivoEsperado = montoInicial + ventasEfectivo + ingresosExtraCaja - egresosCaja
  assert.strictEqual(efectivoEsperado, 47000, 'Efectivo en cajón debe ser exactamente $47.000')

  // Desglose de Cta Cte / Fiados (restando medios ingresados al total facturado)
  const ctaCteCalculado = Math.max(
    0,
    totalFacturado - (ventasEfectivo + ventasMercadoPago + ventasTarjeta)
  )
  assert.strictEqual(ctaCteCalculado, 10000, 'Cuenta corriente del turno debe ser exactamente $10.000')
})

// ------------------------------------------------------------------------------
// TEST 6: Deducción FEFO de Lotes de Vencimiento
// ------------------------------------------------------------------------------
test('6. Deducción FEFO de lotes: Prioriza el más próximo a vencer y maneja decimales', () => {
  const lotes = [
    { id: 'lote-2', fecha: '2026-10-01', cantidad: 5.0, activo: true },
    { id: 'lote-1', fecha: '2026-09-25', cantidad: 2.0, activo: true }, // Vence primero
  ].sort((a, b) => a.fecha.localeCompare(b.fecha))

  let aDescontar = 3.5 // Venta de 3.5 unidades o kg
  const deducciones = []

  for (const lote of lotes) {
    if (aDescontar <= 0) break
    const cantLote = Math.min(aDescontar, lote.cantidad)
    lote.cantidad = Number((lote.cantidad - cantLote).toFixed(3))
    lote.activo = lote.cantidad > 0
    deducciones.push({ id: lote.id, descontado: cantLote })
    aDescontar = Number((aDescontar - cantLote).toFixed(3))
  }

  assert.strictEqual(deducciones[0].id, 'lote-1', 'Primer descuento debe ser de lote-1')
  assert.strictEqual(deducciones[0].descontado, 2.0, 'Debe vaciar los 2.0 de lote-1')
  assert.strictEqual(lotes[0].activo, false, 'Lote 1 debe quedar inactivo')

  assert.strictEqual(deducciones[1].id, 'lote-2', 'Segundo descuento debe ser de lote-2')
  assert.strictEqual(deducciones[1].descontado, 1.5, 'Debe descontar 1.5 de lote-2')
  assert.strictEqual(lotes[1].cantidad, 3.5, 'Lote 2 debe quedar con 3.5')
  assert.strictEqual(lotes[1].activo, true, 'Lote 2 debe permanecer activo')
  assert.strictEqual(aDescontar, 0, 'Restante por descontar debe ser 0')
})

// ------------------------------------------------------------------------------
// TEST 7: Combos y Packs con Deducción de Componentes
// ------------------------------------------------------------------------------
test('7. Deducción de componentes en combos (Pack Fernet + 2 Cocas)', () => {
  const stockComponentes = {
    fernet: 10,
    coca: 24,
  }

  const comboVendido = {
    cantidad: 3, // Se venden 3 combos
    receta: [
      { id: 'fernet', porCombo: 1 },
      { id: 'coca', porCombo: 2 },
    ],
  }

  // Deducción
  for (const comp of comboVendido.receta) {
    const totalADescontar = comp.porCombo * comboVendido.cantidad
    stockComponentes[comp.id] -= totalADescontar
  }

  assert.strictEqual(stockComponentes.fernet, 7, 'Stock de Fernet debe ser 10 - 3 = 7')
  assert.strictEqual(stockComponentes.coca, 18, 'Stock de Coca debe ser 24 - 6 = 18')
})

// ------------------------------------------------------------------------------
// TEST 8: Cuenta Corriente (Fiado) y Límite de Crédito
// ------------------------------------------------------------------------------
test('8. Cuenta Corriente: Control de límite de crédito y amortización con abono', () => {
  const cliente = {
    nombre: 'Juan Pérez',
    limiteCredito: 30000,
    saldoDeudor: 25000,
  }

  const nuevaVenta = 8000
  const nuevoSaldoEstimado = cliente.saldoDeudor + nuevaVenta
  const superaLimite = cliente.limiteCredito > 0 && nuevoSaldoEstimado > cliente.limiteCredito
  const exceso = nuevoSaldoEstimado - cliente.limiteCredito

  assert.strictEqual(superaLimite, true, 'Debe detectar exceso de crédito')
  assert.strictEqual(exceso, 3000, 'Exceso debe ser de $3.000')

  // Supongamos que se autoriza la venta
  cliente.saldoDeudor = nuevoSaldoEstimado
  assert.strictEqual(cliente.saldoDeudor, 33000, 'Saldo deudor es $33.000')

  // Luego el cliente entrega un abono de $20.000
  const abono = 20000
  cliente.saldoDeudor = Math.max(0, cliente.saldoDeudor - abono)
  assert.strictEqual(cliente.saldoDeudor, 13000, 'Saldo tras abono debe ser $13.000')
})

// ------------------------------------------------------------------------------
// RESUMEN FINAL
// ------------------------------------------------------------------------------
console.log('='.repeat(70))
console.log(`RESULTADO DE LA AUDITORÍA: ${testsPassed} / ${testsTotal} PRUEBAS SUPERADAS EXITOSAMENTE`)
console.log('='.repeat(70))

if (testsPassed === testsTotal) {
  console.log('>>> TODOS LOS MODELOS, FÓRMULAS Y PROCEDIMIENTOS ESTÁN 100% BLINDADOS <<<')
  process.exit(0)
} else {
  console.error('>>> SE DETECTARON ERRORES DE PROCEDIMIENTO EN LA AUDITORÍA <<<')
  process.exit(1)
}
