-- ==============================================================================
-- MIGRACIÓN: SOPORTE MULTI-RUBRO (KIOSCO / FOTOCOPIADORA & LIBRERÍA / GENERAL)
-- ==============================================================================

-- 1. Agregar columna 'rubro' a la tabla 'kioscos' si no existe
ALTER TABLE public.kioscos 
ADD COLUMN IF NOT EXISTS rubro VARCHAR(50) DEFAULT 'KIOSCO';

-- 2. Asegurar que los tenants existentes tengan el rubro 'KIOSCO' por defecto
UPDATE public.kioscos 
SET rubro = 'KIOSCO' 
WHERE rubro IS NULL;

-- 3. Recrear la vista consolidada v_admin_kioscos para incluir la columna 'rubro'
DROP VIEW IF EXISTS public.v_admin_kioscos CASCADE;

CREATE OR REPLACE VIEW public.v_admin_kioscos
WITH (security_invoker = true)
AS
SELECT 
    k.id AS kiosco_id,
    k.nombre AS nombre_kiosco,
    k.direccion,
    k.telefono AS telefono_kiosco,
    k.estado_suscripcion AS estado_kiosco,
    k.fecha_creacion,
    k.rubro,
    u.id AS dueno_usuario_id,
    u.nombre AS nombre_dueno,
    u.email AS email_dueno,
    s.id AS suscripcion_id,
    s.fecha_inicio,
    s.fecha_vencimiento,
    s.estado AS estado_suscripcion,
    p.id AS plan_id,
    p.nombre AS nombre_plan,
    p.precio_mensual AS plan_precio_mensual,
    ps.id AS ultimo_pago_id,
    ps.fecha_pago AS ultimo_pago_fecha,
    ps.monto AS ultimo_pago_monto,
    ps.medio_pago AS ultimo_pago_medio
FROM public.kioscos k
LEFT JOIN public.usuarios u ON u.kiosco_id = k.id AND u.rol = 'DUEÑO' AND u.activo = true
LEFT JOIN LATERAL (
    SELECT * FROM public.suscripciones s2 
    WHERE s2.kiosco_id = k.id 
    ORDER BY s2.fecha_vencimiento DESC 
    LIMIT 1
) s ON true
LEFT JOIN public.planes p ON p.id = s.plan_id
LEFT JOIN LATERAL (
    SELECT * FROM public.pagos_suscripcion ps2 
    WHERE ps2.suscripcion_id = s.id 
    ORDER BY ps2.fecha_pago DESC 
    LIMIT 1
) ps ON true;

COMMENT ON COLUMN public.kioscos.rubro IS 'Rubro comercial del tenant: KIOSCO, FOTOCOPIADORA_LIBRERIA, o GENERAL';
