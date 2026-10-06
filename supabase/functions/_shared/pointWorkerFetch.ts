/** El timeout sigue vigente durante la lectura del cuerpo de la respuesta SDK. */
export const solicitarBackendPoint: typeof fetch = (input, init) => {
  const existente = init?.signal ?? (input instanceof Request ? input.signal : null)
  const limite = AbortSignal.timeout(15000)
  return fetch(input, { ...init, signal: existente ? AbortSignal.any([existente, limite]) : limite })
}
