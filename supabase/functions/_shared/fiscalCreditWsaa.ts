import { validateFiscalCreditSendBinding } from './fiscalCreditSendSource.ts'
import type { PrivateCreditSendFiscalCustody } from './fiscalPrivateCustody.ts'
import type { FiscalCreditNumberBinding } from './fiscalCreditNumberSource.ts'
import { validateFiscalCreditNumberBinding } from './fiscalCreditNumberSource.ts'
import type { GuardedCreditWsaaTicketLoader, GuardedCreditSendWsaaTicketLoader } from './fiscalCreditSharedTickets.ts'
import type { PrivateFiscalSigner } from './fiscalWsaaCms.ts'
import { prepareWsaaRequest } from './fiscalWsaaCms.ts'
import { loginFiscalWsaa } from './fiscalWsaa.ts'
import { withFiscalDeadline } from './fiscalVoucherXml.ts'
import type { WsaaTicketEnvelope } from './fiscalTicketCache.ts'

export type PrivateCreditFiscalCustody = (binding: Readonly<FiscalCreditNumberBinding>, signal: AbortSignal) => Promise<PrivateFiscalSigner>
const fail = (): never => { throw new Error('FISCAL_WSAA_NC_NO_CONFIRMADO') }
/** Sólo tras Auth/fuente038 y dentro del lease039. No provisiona claves ni emite comprobantes. */
export function createCreditWsaaTicketSource(custody: PrivateCreditFiscalCustody, fetcher: typeof fetch): GuardedCreditWsaaTicketLoader {
  return createPurposeWsaaSource(custody,fetcher,validateFiscalCreditNumberBinding)
}
/** ENVIO_NC sólo se autoriza desde044; no consume permiso fiscal042 ni emite. */
export function createCreditSendWsaaTicketSource(custody:PrivateCreditSendFiscalCustody,fetcher:typeof fetch):GuardedCreditSendWsaaTicketLoader {
  return createPurposeWsaaSource(custody,fetcher,validateFiscalCreditSendBinding)
}
function createPurposeWsaaSource<B extends {credencial_id:string;certificado_sha256:string;cuit_emisor:string}>(
 custody:(binding:Readonly<B>,signal:AbortSignal)=>Promise<PrivateFiscalSigner>,fetcher:typeof fetch,validate:(input:unknown)=>Readonly<B>
):(binding:Readonly<B>,signal:AbortSignal,beforeSend:()=>Promise<void>)=>Promise<WsaaTicketEnvelope> {
  return async (input, signal, beforeSend) => {
    try {
      const binding = validate(structuredClone(input))
      if (signal.aborted || typeof beforeSend !== 'function') return fail()
      const material = await withFiscalDeadline(custody(binding, signal), signal)
      const prepared = await withFiscalDeadline(prepareWsaaRequest(material, { credentialId: binding.credencial_id, certificateSha256: binding.certificado_sha256 }), signal)
      await beforeSend()
      if (signal.aborted) return fail()
      const ticket = await loginFiscalWsaa(prepared, fetcher, signal)
      const result: WsaaTicketEnvelope = { entorno: 'HOMOLOGACION', servicio: 'wsfe', cuitEmisor: binding.cuit_emisor,
        credencialId: binding.credencial_id, certificadoSha256: binding.certificado_sha256, expiresAt: ticket.expiresAt, token: ticket.token, sign: ticket.sign }
      Object.defineProperties(result, { token: { enumerable: false, writable: false }, sign: { enumerable: false, writable: false } })
      return Object.freeze(result)
    } catch { return fail() }
  }
}
