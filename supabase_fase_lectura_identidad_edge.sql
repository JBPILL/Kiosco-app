-- Paso 44. Lecturas mínimas para verificar JWT/perfil/comercio en Edge Functions.
-- Desplegar supervisor-pin con la selección explícita de columnas actualizada.
BEGIN;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT (id,auth_user_id,kiosco_id,activo,rol) ON public.usuarios TO service_role;
GRANT SELECT (id,estado_suscripcion,capacidades_operativas) ON public.kioscos TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
