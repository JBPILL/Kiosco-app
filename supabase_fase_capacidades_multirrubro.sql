-- Fase 5: capacidades independientes por comercio.
-- Aplicar antes de desplegar una versión que permita guardar esta configuración.

ALTER TABLE public.kioscos
  ADD COLUMN IF NOT EXISTS capacidades_operativas jsonb;

COMMENT ON COLUMN public.kioscos.capacidades_operativas IS
  'Capacidades configurables: envases, balanza, vencimientos y serviciosRapidos. NULL conserva los defaults por rubro del frontend.';

-- Los valores NULL de comercios existentes se interpretan con defaults compatibles:
-- KIOSCO: envases/balanza/vencimientos; FOTOCOPIADORA_LIBRERIA: servicios rápidos;
-- GENERAL: sin capacidades activadas. No se migran ni eliminan productos existentes.
