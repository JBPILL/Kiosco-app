export interface ConfiguracionCostosCajero { url: string; key: string; jwt: string; kioscoId: string }
export interface DiagnosticoCostosCajero {
  identidadVerificada: boolean
  controles: Array<{ tabla: string; resultado: string }>
  productosRevisados: number
  alcance: string
}
export function verificarCostosCajero(config: ConfiguracionCostosCajero, solicitar?: typeof fetch): Promise<DiagnosticoCostosCajero>
