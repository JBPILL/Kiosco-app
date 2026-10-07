type Tipo = 'inventario' | 'costo' | 'conocido' | 'pendiente' | 'ayuda' | 'actualizar'
const trazos: Record<Tipo, string> = {
  inventario: 'M3 7 12 2l9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v10M7.5 4.5l9 5',
  costo: 'M12 2v20M17 5H9a4 4 0 0 0 0 8h6a3 3 0 0 1 0 6H6',
  conocido: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6L12 2ZM8 12l3 3 5-6',
  pendiente: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v6l4 2',
  ayuda: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v6M12 7h.01',
  actualizar: 'M20 7a8 8 0 0 0-14-2L3 8m0-5v5h5M4 17a8 8 0 0 0 14 2l3-3m0 5v-5h-5',
}
export function IconoBajas({ tipo, size = 22, className = '' }: { tipo: Tipo; size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}><path d={trazos[tipo]} /></svg>
}
