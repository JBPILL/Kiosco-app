import type { SVGProps } from 'react'
type Props = SVGProps<SVGSVGElement> & { size?: number }
function Icono({ size = 22, children, ...props }: Props) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>
}
export function Smartphone(props: Props) { return <Icono {...props}><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M10 18h4" /></Icono> }
export function Wrench(props: Props) { return <Icono {...props}><path d="M14 6a5 5 0 0 0-6 6L3 17a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4z" /></Icono> }
export function ShieldCheck(props: Props) { return <Icono {...props}><path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6zM8 12l3 3 5-6" /></Icono> }
export function RefreshCw(props: Props) { return <Icono {...props}><path d="M20 7a8 8 0 0 0-14-2L3 8m0-5v5h5M4 17a8 8 0 0 0 14 2l3-3m0 5v-5h-5" /></Icono> }
