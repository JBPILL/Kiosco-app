import { useEffect, useRef } from 'react'

interface UseBarcodeGunOptions {
  enabled?: boolean
  onScan: (barcode: string) => void | Promise<void>
  minChars?: number
  maxIntervalMs?: number
  debounceMs?: number
}

/**
 * Hook para detectar lectores de código de barras físicos (USB / Bluetooth) tipo "Keyboard Wedge".
 * Los lectores de hardware envían ráfagas de caracteres a altísima velocidad (< 40ms entre pulsaciones)
 * y finalizan con la tecla 'Enter'.
 * Incluye filtro inteligente anti-doble escaneo accidental por rebote de gatillo o vibración láser.
 */
export function useBarcodeGun({
  enabled = true,
  onScan,
  minChars = 3,
  maxIntervalMs = 60,
  debounceMs = 450,
}: UseBarcodeGunOptions) {
  const bufferRef = useRef<string>('')
  const lastKeyTimeRef = useRef<number>(0)
  const isScannerBurstRef = useRef<boolean>(false)
  const lastScannedCodeRef = useRef<string>('')
  const lastScannedTimeRef = useRef<number>(0)

  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = performance.now()
      const timeSinceLastKey = now - lastKeyTimeRef.current

      // BUG-06: Si el foco está en un input/textarea/select, el usuario está escribiendo
      // manualmente. Ignorar todos los eventos para no mezclar texto manual con el buffer
      // del escáner, salvo que el intervalo sea tan corto que sólo un lector HW lo genere.
      const activeEl = document.activeElement as HTMLElement | null
      const isEditableActive =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.isContentEditable)

      lastKeyTimeRef.current = now

      // Tecla Enter indica fin del código de barras
      if (e.key === 'Enter') {
        const code = bufferRef.current.trim()
        const isLikelyScanner = isScannerBurstRef.current && code.length >= minChars

        bufferRef.current = ''
        isScannerBurstRef.current = false

        if (isLikelyScanner) {
          e.preventDefault()
          e.stopPropagation()

          // Filtro Anti-Doble Escaneo Accidental:
          // Si el mismo código entra en un lapso menor a debounceMs (rebote de gatillo o vibración del haz),
          // se ignora para prevenir ventas duplicadas involuntarias.
          const timeSinceLastScan = now - lastScannedTimeRef.current
          if (code === lastScannedCodeRef.current && timeSinceLastScan < debounceMs) {
            return
          }

          lastScannedCodeRef.current = code
          lastScannedTimeRef.current = now
          onScanRef.current(code)
        }
        return
      }

      // Ignorar teclas modificadoras o de función
      if (e.key.length > 1) {
        return
      }

      // BUG-06: Si el foco está en un campo editable Y el intervalo NO es ultra-corto
      // (propio de lectores HW), ignorar el carácter para no contaminar el buffer.
      if (isEditableActive && timeSinceLastKey > maxIntervalMs) {
        // Resetear buffer: el usuario está escribiendo manualmente entre escaneos
        bufferRef.current = ''
        isScannerBurstRef.current = false
        return
      }

      // Si el intervalo entre pulsaciones es muy corto, es una pistola lectora
      if (timeSinceLastKey <= maxIntervalMs) {
        bufferRef.current += e.key
        isScannerBurstRef.current = true
      } else {
        // Intervalo largo: reiniciamos el buffer con este nuevo caracter
        bufferRef.current = e.key
        isScannerBurstRef.current = false
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [enabled, minChars, maxIntervalMs, debounceMs])
}
