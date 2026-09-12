// Utilidad de audio sintetizado con Web Audio API para feedback auditivo de escaneo
// 100% offline, 0ms de latencia y sin dependencias de archivos mp3 externos.

export type SoundType = 'success' | 'warning' | 'error'

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioContextClass) {
        audioCtx = new AudioContextClass()
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume()
    }
    return audioCtx
  } catch {
    return null
  }
}

/**
 * Reproduce un bip sintético de confirmación tipo lector de código de barras Honeywell / Zebra
 */
export function playScanSound(type: SoundType = 'success') {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.connect(gain)
    gain.connect(ctx.destination)

    if (type === 'success') {
      // Bip agudo, corto y claro característico de comanderas y lectores de códigos (A6 = 1760Hz)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(1760, now)
      gain.gain.setValueAtTime(0.2, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
      osc.start(now)
      osc.stop(now + 0.08)

      // Vibración háptica en celulares compatibles
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(60)
        } catch {
          // Ignorar si el navegador bloquea vibración
        }
      }
    } else if (type === 'warning') {
      // Tono de advertencia doble (producto no encontrado)
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(480, now)
      osc.frequency.setValueAtTime(360, now + 0.08)
      gain.gain.setValueAtTime(0.25, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
      osc.start(now)
      osc.stop(now + 0.18)

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([80, 50, 80])
        } catch {
          // Ignorar
        }
      }
    } else {
      // Tono grave de error
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(220, now)
      gain.gain.setValueAtTime(0.2, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)
      osc.start(now)
      osc.stop(now + 0.22)

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([150])
        } catch {
          // Ignorar
        }
      }
    }
  } catch {
    // Si el navegador bloquea audio antes del primer gesto del usuario, fallar silenciosamente
  }
}
