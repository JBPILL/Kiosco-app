import { inflateSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { decodificarFrameCamaraHD } from './cameraFrameDecoder'
import fixture from '../test/fixtures/camera-ean-resolution.json'

function canvasDePixeles(frame: typeof fixture.native): HTMLCanvasElement {
  const luma = inflateSync(Buffer.from(frame.lumaDeflate, 'base64'))
  const rgba = new Uint8ClampedArray(frame.width * frame.height * 4)
  for (let i = 0; i < luma.length; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = luma[i]
    rgba[i * 4 + 3] = 255
  }
  // Only the canvas pixel adapter is supplied; the real ZXing decoder runs.
  return { width: frame.width, height: frame.height,
    getContext: () => ({ getImageData: () => ({ data: rgba }) }) } as unknown as HTMLCanvasElement
}

it('decodifica barras finas con píxeles nativos que se pierden al reducir al tamaño CSS', async () => {
  expect(await decodificarFrameCamaraHD(canvasDePixeles(fixture.native))).toBe(fixture.expected)
  await expect(decodificarFrameCamaraHD(canvasDePixeles(fixture.thumbnail))).rejects.toHaveProperty('name', 'NotFoundException')
})
