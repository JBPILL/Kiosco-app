// Ruta heredada retirada. El historial de la implementación se conserva en Git.
// No desplegar como circuito de emisión; no lee claves, base, cuerpo ni ARCA.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { retiredFiscalLegacyHandler } from '../_shared/fiscalLegacyRetirement.ts'
serve(retiredFiscalLegacyHandler)
