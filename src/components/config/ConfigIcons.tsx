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
  ShieldCheck: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  Lock: 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4',
  Key: 'm15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4M15.5 7.5 14 9l-1.5-1.5-4 4 1.5 1.5-4 4H2v4h4l4-4 1.5 1.5 4-4-1.5-1.5 2.5-2.5M15.5 7.5 19 4',
  Percent: 'M19 5 5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  History: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2',
  Inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  EyeOff: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22',
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
export const ShieldCheck = icon('ShieldCheck')
export const Lock = icon('Lock')
export const Key = icon('Key')
export const Percent = icon('Percent')
export const History = icon('History')
export const Inbox = icon('Inbox')
export const EyeOff = icon('EyeOff')
