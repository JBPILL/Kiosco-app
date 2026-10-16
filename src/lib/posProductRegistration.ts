import type { Usuario } from '../types/database'

/** POS registration belongs only to an active owner assigned to a store. */
export function puedeRegistrarProductoPOS(usuario: Pick<Usuario, 'rol' | 'activo' | 'kiosco_id'> | null | undefined): boolean {
  return usuario?.rol === 'DUEÑO' && usuario.activo === true && Boolean(usuario.kiosco_id)
}
