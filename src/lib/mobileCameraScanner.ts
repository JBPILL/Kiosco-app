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
