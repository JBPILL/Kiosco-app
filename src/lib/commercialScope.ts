/** Visibility capability only. Authorization and business state are enforced by SQL. */
export function administracionComercialHabilitada(): boolean {
  return import.meta.env.VITE_ADMIN_COMERCIAL_HABILITADO === 'true'
}
