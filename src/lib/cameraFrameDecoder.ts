import { ZXingHtml5QrcodeDecoder } from 'html5-qrcode/esm/zxing-html5-qrcode-decoder'
import { Html5QrcodeSupportedFormats } from 'html5-qrcode/esm/core'

/** Same bundled ZXing as html5-qrcode 2.3.8; pixels remain in this browser. */
export async function decodificarFrameCamaraHD(canvas: HTMLCanvasElement): Promise<string> {
  const decoder = new ZXingHtml5QrcodeDecoder([
    Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39,
  ], false, { log: () => {}, warn: () => {}, logError: () => {}, logErrors: () => {} })
  return (await decoder.decodeAsync(canvas)).text
}
