import { expect, it } from 'vitest'
import { contextoPointDesdeRegistro, leerCuentasPoint } from '../../supabase/functions/_shared/pointServerConfig'

const kioscoId = '10000000-0000-0000-0000-000000000001'
const cuenta = { applicationId: '123', accountId: '456', accessToken: 'credencial-simulada', modo: 'sandbox' }
const cuentas = leerCuentasPoint(JSON.stringify({ [kioscoId]: cuenta }))
const registro = { id: '20000000-0000-0000-0000-000000000001', kiosco_id: kioscoId,
  order_id: 'ORD123', terminal_id: 'terminal', monto_centavos: '15001', application_id: '123', account_id: '456', modo: 'sandbox' }

it('resuelve la cuenta por comercio desde configuración privada y valida el importe almacenado', () => {
  expect(contextoPointDesdeRegistro(registro, cuentas)).toMatchObject({ kioscoId, applicationId: '123',
    expected: { accountId: '456', amountCentavos: 15001, orderId: 'ORD123' } })
})

it('rechaza cuentas sin modo explícito y credenciales malformadas', () => {
  for (const invalida of [{ ...cuenta, modo: null }, { ...cuenta, accessToken: ' token ' }, { ...cuenta, accountId: 'otra' }]) {
    expect(() => leerCuentasPoint(JSON.stringify({ [kioscoId]: invalida }))).toThrow('Configuración Point inválida')
  }
})

it('rechaza otro comercio y cantidades no seguras o fraccionarias', () => {
  expect(() => contextoPointDesdeRegistro({ ...registro, kiosco_id: '10000000-0000-0000-0000-000000000002' }, cuentas)).toThrow()
  for (const monto_centavos of ['150.1', '1e3', '9007199254740992', -1]) {
    expect(() => contextoPointDesdeRegistro({ ...registro, monto_centavos }, cuentas)).toThrow()
  }
})

it('no reasigna intentos anteriores al cambiar la cuenta o el modo configurados', () => {
  for (const configurada of [{ ...cuenta, accountId: '999' }, { ...cuenta, applicationId: '999' }, { ...cuenta, modo: 'production' }]) {
    const cambiadas = leerCuentasPoint(JSON.stringify({ [kioscoId]: configurada }))
    expect(() => contextoPointDesdeRegistro(registro, cambiadas)).toThrow('no coincide')
  }
})
