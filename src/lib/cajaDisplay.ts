export function formatMotivoMovimientoCaja(motivo?: string | null): string {
  switch (motivo) {
    case 'PROVEEDOR':
      return 'Pago Proveedor'
    case 'GASTO_GENERAL':
      return 'Gasto General'
    case 'RETIRO_DUENO':
      return 'Retiro Dueño'
    case 'REPOSICION_CAMBIO':
      return 'Reposición Cambio'
    case 'DEVOLUCION_VENTA':
      return 'Devolución de Venta'
    case 'DEVOLUCION_ENVASE':
      return 'Devolución de Envases'
    case 'COBRO_CUENTA_CORRIENTE':
      return 'Cobro Cuenta Corriente'
    case 'OTRO':
    default:
      return 'Movimiento'
  }
}

export function formatMotivoDevolucion(motivo?: string | null): string {
  switch (motivo) {
    case 'CAMBIO_PRODUCTO':
      return 'Cambio de Producto'
    case 'FALLA_ROTURA':
      return 'Falla / Rotura'
    case 'VENCIDO':
      return 'Producto Vencido'
    case 'ERROR_COBRO':
      return 'Error de Cobro'
    case 'OTRO':
    default:
      return motivo || 'Devolución'
  }
}

export function formatMetodoReintegro(metodo?: string | null): string {
  switch (metodo) {
    case 'EFECTIVO_CAJA':
      return 'Efectivo de Caja'
    case 'MERCADOPAGO':
      return 'Mercado Pago'
    case 'TRANSFERENCIA':
      return 'Transferencia'
    case 'CUENTA_CORRIENTE':
      return 'Cuenta Corriente'
    case 'OTRO':
    default:
      return metodo || 'Otro'
  }
}

export function formatAccionEnvase(accion?: string | null): string {
  switch (accion) {
    case 'RECIBIR_EFECTIVO':
      return 'Recepción en Efectivo'
    case 'RECIBIR_TICKET':
      return 'Descuento en Ticket'
    case 'ENTREGAR_DISTRIBUIDOR':
      return 'Entrega a Distribuidor'
    case 'AJUSTAR_SALDO':
      return 'Ajuste de Saldo'
    case 'DEVOLVER_CLIENTE':
      return 'Devolución a Cliente'
    case 'AJUSTAR_PENDIENTES':
      return 'Ajuste de Pendientes'
    case 'RECIBIR_PENDIENTES':
      return 'Recepción Pendientes'
    default:
      return accion || 'Movimiento'
  }
}
