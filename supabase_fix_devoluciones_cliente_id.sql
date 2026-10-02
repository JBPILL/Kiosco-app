-- Migración de corrección para tabla devoluciones_venta
-- Asegura que la columna cliente_id exista y esté vinculada a la tabla clientes

ALTER TABLE public.devoluciones_venta 
ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL;

-- Crear índice para optimizar consultas de devoluciones por cliente
CREATE INDEX IF NOT EXISTS idx_devoluciones_venta_cliente_id 
ON public.devoluciones_venta (cliente_id);

-- Forzar recarga del schema cache en PostgREST / Supabase
NOTIFY pgrst, 'reload schema';
