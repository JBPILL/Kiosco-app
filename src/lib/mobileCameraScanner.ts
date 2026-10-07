export function cuadroEscaneoMovil(ancho: number, alto: number) {
  return { width: Math.max(1, Math.floor(Math.min(ancho * 0.88, 420))),
    height: Math.max(1, Math.floor(Math.min(alto * 0.65, 260))) }
}

export function errorCamaraMovil(error: unknown): string {
  const nombre = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
  const texto = error instanceof Error ? error.message : String(error)
  if (texto.includes('CAMERA_UNAVAILABLE')) return 'La cámara necesita HTTPS y un navegador con acceso a cámara. Podés ingresar el código manualmente.'
  if (/NotAllowedError|PermissionDenied|Permission|denied/i.test(`${nombre} ${texto}`)) {
    return 'Habilitá el permiso de cámara en tu navegador y volvé a intentar.'
  }
  if (/NotFoundError|DevicesNotFoundError/i.test(`${nombre} ${texto}`)) return 'No se encontró una cámara. Podés ingresar el código manualmente.'
  if (/NotReadableError|TrackStartError/i.test(`${nombre} ${texto}`)) return 'La cámara está ocupada. Cerrá otras aplicaciones que la estén usando.'
  return 'No se pudo iniciar la cámara. Reintentá o ingresá el código manualmente.'
}

export function puedeReintentarCamara(error: unknown): boolean {
  const nombre = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
  const texto = error instanceof Error ? error.message : String(error)
  return !/NotAllowedError|PermissionDenied|Permission|denied|NotReadableError|TrackStartError/i.test(`${nombre} ${texto}`)
}

/**
 * iOS puede iniciar getUserMedia y decodificar correctamente, pero dejar negro
 * el elemento <video> de html5-qrcode. Pintar sus frames en un canvas visible
 * evita ese fallo de composición sin interferir con el video que decodifica.
 */
export function iniciarVistaCamaraIOS(contenedor: HTMLElement): () => void {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return () => {}
  const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const video = contenedor.querySelector('video')
  if (!esIOS || !video) return () => {}

  const lienzo = document.createElement('canvas')
  lienzo.setAttribute('aria-hidden', 'true')
  Object.assign(lienzo.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    pointerEvents: 'none',
    zIndex: 'auto',
  })
  contenedor.insertBefore(lienzo, video.nextSibling)

  const contexto = lienzo.getContext('2d')
  if (!contexto) {
    lienzo.remove()
    return () => {}
  }

  const opacidadOriginal = video.style.opacity
  let frameId = 0
  let activo = true

  const dibujar = () => {
    if (!activo) return
    const ancho = contenedor.clientWidth
    const alto = contenedor.clientHeight
    if (video.readyState >= 2 && ancho > 0 && alto > 0 && video.videoWidth > 0 && video.videoHeight > 0) {
      const escala = Math.max(ancho / video.videoWidth, alto / video.videoHeight)
      const anchoFuente = ancho / escala
      const altoFuente = alto / escala
      const xFuente = (video.videoWidth - anchoFuente) / 2
      const yFuente = (video.videoHeight - altoFuente) / 2
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const anchoLienzo = Math.round(ancho * ratio)
      const altoLienzo = Math.round(alto * ratio)
      if (lienzo.width !== anchoLienzo || lienzo.height !== altoLienzo) {
        lienzo.width = anchoLienzo
        lienzo.height = altoLienzo
      }
      try {
        contexto.drawImage(video, xFuente, yFuente, anchoFuente, altoFuente, 0, 0, lienzo.width, lienzo.height)
        // Ocultar el video sólo cuando ya existe un frame visible de reemplazo.
        video.style.opacity = '0'
      } catch {
        // Una pista puede quedarse sin frames al rotar o volver del segundo plano.
        video.style.opacity = opacidadOriginal
      }
    }
    frameId = window.requestAnimationFrame(dibujar)
  }

  frameId = window.requestAnimationFrame(dibujar)
  return () => {
    activo = false
    window.cancelAnimationFrame(frameId)
    video.style.opacity = opacidadOriginal
    lienzo.remove()
  }
}
