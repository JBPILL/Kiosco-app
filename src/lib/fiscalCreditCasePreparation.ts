import { prepareFiscalCreditDraft } from '../../supabase/functions/_shared/fiscalCreditDraft'
import type { FiscalCreditDraft, FiscalCreditDraftInput } from '../../supabase/functions/_shared/fiscalCreditDraft'
import { validateFiscalCreditCommercialSource } from '../../supabase/functions/_shared/fiscalCreditCommercialSource'
import type { FiscalCreditCommercialSource } from '../../supabase/functions/_shared/fiscalCreditCommercialSource'
import { fiscalCreditUnitsWire, validateFiscalCreditUnits } from '../../supabase/functions/_shared/fiscalCreditUnits'
import type { FiscalCreditUnits } from '../../supabase/functions/_shared/fiscalCreditUnits'
import type { FiscalRepresentation } from '../../supabase/functions/_shared/fiscalRepresentation'

/** Precomprobación del formulario; saldo y elegibilidad final siguen perteneciendo al servidor. */
export async function prepareFiscalCreditCase(source: Readonly<FiscalRepresentation>, commercial: Readonly<FiscalCreditCommercialSource>, units: Readonly<FiscalCreditUnits>, input: FiscalCreditDraftInput): Promise<Readonly<FiscalCreditDraft>> {
  const original = structuredClone(source), facts = structuredClone(commercial), metadata = structuredClone(units), captured = structuredClone(input)
  const verified = await validateFiscalCreditCommercialSource(facts, original)
  const evidence = await validateFiscalCreditUnits(fiscalCreditUnitsWire(metadata), original, verified)
  if (evidence.estado !== 'CAPTURADAS') throw new Error('FISCAL_NC_UNIDADES_PENDIENTES')
  const proposal = await prepareFiscalCreditDraft(original, captured, captured.fecha)
  for (const line of proposal.datos.lineas) {
    const index = verified.lineas.findIndex(item => item.detalle_id === line.detalle_id)
    const historical = verified.lineas[index], unit = evidence.unidades.datos.lineas[index]
    const quantity = BigInt(line.cantidad.replace('.', ''))
    if (!historical || !unit || !unit.es_pesable && quantity % 1000n !== 0n
      || historical.tipo === 'LIBRE' && line.reingresa_stock) throw new Error('FISCAL_NC_CANTIDAD_INVALIDA')
    for (let n = 0; n < historical.componentes.length; n++) {
      const physical = quantity * BigInt(historical.componentes[n].cantidad.replace('.', ''))
      if (physical % (unit.componentes[n].es_pesable ? 1000n : 1000000n) !== 0n) throw new Error('FISCAL_NC_CANTIDAD_INVALIDA')
    }
  }
  return proposal
}
