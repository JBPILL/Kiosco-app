import type { SVGProps } from 'react'

const paths = {
  Store: 'M3 10h18M4 10v11h16V10M2 10l3-7h14l3 7M9 21v-7h6v7',
  Printer: 'M6 9V3h12v6M6 18H3V9h18v9h-3M6 14h12v7H6v-7M17 11h.01',
  Palette: 'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h4a4 4 0 0 0 4-4c0-4-5-6-9-6ZM7 8h.01M12 6h.01M17 8h.01M5 13h.01',
  Sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1',
  Moon: 'M21 13A9 9 0 0 1 11 3 9 9 0 1 0 21 13Z',
  Layers: 'M12 2 2 7l10 5 10-5-10-5ZM2 12l10 5 10-5M2 17l10 5 10-5',
  Package: 'M3 7 12 2l9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v10',
  Scale: 'M12 3v18M5 21h14M3 7h18M6 7l-4 8h8L6 7ZM18 7l-4 8h8l-4-8Z',
  CalendarClock: 'M3 5h18v16H3V5ZM7 2v6M17 2v6M3 10h18M12 12v4h3',
  Zap: 'M13 2 3 14h8l-1 8 11-13h-8l1-7Z',
}
interface Props extends SVGProps<SVGSVGElement> { size?: number }
function icon(name: keyof typeof paths) {
  return function ConfigIcon({ size = 20, ...props }: Props) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}><path d={paths[name]} /></svg>
  }
}
export const Store = icon('Store')
export const Printer = icon('Printer')
export const Palette = icon('Palette')
export const Sun = icon('Sun')
export const Moon = icon('Moon')
export const Layers = icon('Layers')
export const Package = icon('Package')
export const Scale = icon('Scale')
export const CalendarClock = icon('CalendarClock')
export const Zap = icon('Zap')
